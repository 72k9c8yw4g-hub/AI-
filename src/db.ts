// Dscribe データアクセス層 (Cloudflare D1 / SQLite)

export type Kind = "memory" | "decision" | "note";
export type TaskStatus = "open" | "doing" | "done";
export type Priority = "high" | "normal" | "low";

export interface MemoryRow {
  id: number;
  kind: string;
  title: string;
  content: string;
  tags: string;
  source: string;
  project: string | null;
  created_at: string;
}

export interface TaskRow {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string | null;
  project: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ConversationRow {
  id: number;
  uuid: string;
  name: string;
  project_name: string;
  created_at: string | null;
  updated_at: string | null;
  message_count: number;
}

export interface SearchHit {
  type: "memory" | "task" | "chat";
  id: number;
  title: string;
  snippet: string;
  date: string;
  extra: string;
}

// ---------- ユーティリティ ----------

export function likeEscape(s: string): string {
  return s.replace(/([\\%_])/g, "\\$1");
}

export function splitTerms(query: string): string[] {
  return query
    .trim()
    .split(/[\s　]+/)
    .filter((t) => t.length > 0)
    .slice(0, 5);
}

export function makeSnippet(text: string, terms: string[], width = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const lower = clean.toLowerCase();
  let idx = -1;
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase());
    if (i >= 0 && (idx < 0 || i < idx)) idx = i;
  }
  if (idx < 0) idx = 0;
  const start = Math.max(0, idx - Math.floor(width / 3));
  const body = clean.slice(start, start + width);
  return (start > 0 ? "…" : "") + body + (start + width < clean.length ? "…" : "");
}

function normPriority(p: unknown): Priority {
  return p === "high" || p === "low" ? p : "normal";
}

function normKind(k: unknown): Kind {
  return k === "decision" || k === "note" ? k : "memory";
}

function normTags(tags: unknown): string {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean).join(",");
  if (typeof tags === "string") return tags.trim();
  return "";
}

// ---------- プロジェクト ----------

export async function ensureProject(db: D1Database, name: unknown): Promise<number | null> {
  const n = typeof name === "string" ? name.trim() : "";
  if (!n) return null;
  await db.prepare("INSERT OR IGNORE INTO projects (name) VALUES (?)").bind(n).run();
  const row = await db.prepare("SELECT id FROM projects WHERE name = ?").bind(n).first<{ id: number }>();
  return row ? row.id : null;
}

export async function listProjects(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.name, p.description,
        (SELECT COUNT(*) FROM memories m WHERE m.project_id = p.id) AS memory_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status != 'done') AS open_tasks
       FROM projects p ORDER BY p.name`
    )
    .all<{ id: number; name: string; description: string; memory_count: number; open_tasks: number }>();
  const { results: convs } = await db
    .prepare(
      `SELECT project_name, COUNT(*) AS cnt FROM conversations
       WHERE project_name != '' GROUP BY project_name`
    )
    .all<{ project_name: string; cnt: number }>();
  const convMap = new Map(convs.map((c) => [c.project_name, c.cnt]));
  return results.map((p) => ({ ...p, conversation_count: convMap.get(p.name) ?? 0 }));
}

// ---------- 記憶 (memories) ----------

export async function saveMemory(
  db: D1Database,
  args: { content?: unknown; title?: unknown; kind?: unknown; tags?: unknown; project?: unknown; source?: string }
): Promise<MemoryRow> {
  const content = typeof args.content === "string" ? args.content.trim() : "";
  if (!content) throw new Error("content は必須です");
  const projectId = await ensureProject(db, args.project);
  const title = typeof args.title === "string" ? args.title.trim().slice(0, 200) : "";
  const res = await db
    .prepare(
      `INSERT INTO memories (kind, title, content, tags, source, project_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(normKind(args.kind), title, content.slice(0, 50000), normTags(args.tags), args.source ?? "chat", projectId)
    .run();
  const id = Number(res.meta.last_row_id);
  return (await getMemory(db, id))!;
}

export async function getMemory(db: D1Database, id: number): Promise<MemoryRow | null> {
  return await db
    .prepare(
      `SELECT m.id, m.kind, m.title, m.content, m.tags, m.source, p.name AS project, m.created_at
       FROM memories m LEFT JOIN projects p ON p.id = m.project_id WHERE m.id = ?`
    )
    .bind(id)
    .first<MemoryRow>();
}

export async function listMemories(
  db: D1Database,
  opts: { kind?: string; project?: string; limit?: number } = {}
): Promise<MemoryRow[]> {
  const conds: string[] = [];
  const binds: unknown[] = [];
  if (opts.kind && ["memory", "decision", "note"].includes(opts.kind)) {
    conds.push("m.kind = ?");
    binds.push(opts.kind);
  }
  if (opts.project) {
    conds.push("p.name = ?");
    binds.push(opts.project);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  const { results } = await db
    .prepare(
      `SELECT m.id, m.kind, m.title, m.content, m.tags, m.source, p.name AS project, m.created_at
       FROM memories m LEFT JOIN projects p ON p.id = m.project_id
       ${where} ORDER BY m.id DESC LIMIT ${limit}`
    )
    .bind(...binds)
    .all<MemoryRow>();
  return results;
}

export async function deleteMemory(db: D1Database, id: number): Promise<boolean> {
  const res = await db.prepare("DELETE FROM memories WHERE id = ?").bind(id).run();
  return (res.meta.changes ?? 0) > 0;
}

// ---------- タスク ----------

export async function createTask(
  db: D1Database,
  args: { title?: unknown; description?: unknown; due_date?: unknown; priority?: unknown; project?: unknown }
): Promise<TaskRow> {
  const title = typeof args.title === "string" ? args.title.trim() : "";
  if (!title) throw new Error("title は必須です");
  const projectId = await ensureProject(db, args.project);
  const due = typeof args.due_date === "string" && /^\d{4}-\d{2}-\d{2}/.test(args.due_date) ? args.due_date.slice(0, 10) : null;
  const res = await db
    .prepare(
      `INSERT INTO tasks (title, description, priority, due_date, project_id)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      title.slice(0, 300),
      typeof args.description === "string" ? args.description.slice(0, 10000) : "",
      normPriority(args.priority),
      due,
      projectId
    )
    .run();
  const id = Number(res.meta.last_row_id);
  return (await getTask(db, id))!;
}

export async function getTask(db: D1Database, id: number): Promise<TaskRow | null> {
  return await db
    .prepare(
      `SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date, p.name AS project,
              t.created_at, t.updated_at, t.completed_at
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id WHERE t.id = ?`
    )
    .bind(id)
    .first<TaskRow>();
}

export async function updateTask(
  db: D1Database,
  args: {
    id?: unknown;
    title?: unknown;
    description?: unknown;
    status?: unknown;
    priority?: unknown;
    due_date?: unknown;
    project?: unknown;
  }
): Promise<TaskRow> {
  const id = Number(args.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("id は必須です");
  const existing = await getTask(db, id);
  if (!existing) throw new Error(`タスク #${id} は見つかりません`);

  const sets: string[] = ["updated_at = datetime('now')"];
  const binds: unknown[] = [];
  if (typeof args.title === "string" && args.title.trim()) {
    sets.push("title = ?");
    binds.push(args.title.trim().slice(0, 300));
  }
  if (typeof args.description === "string") {
    sets.push("description = ?");
    binds.push(args.description.slice(0, 10000));
  }
  if (args.status === "open" || args.status === "doing" || args.status === "done") {
    sets.push("status = ?");
    binds.push(args.status);
    if (args.status === "done") sets.push("completed_at = datetime('now')");
    else sets.push("completed_at = NULL");
  }
  if (args.priority !== undefined) {
    sets.push("priority = ?");
    binds.push(normPriority(args.priority));
  }
  if (typeof args.due_date === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(args.due_date)) {
      sets.push("due_date = ?");
      binds.push(args.due_date.slice(0, 10));
    } else if (args.due_date === "") {
      sets.push("due_date = NULL");
    }
  }
  if (args.project !== undefined) {
    const pid = await ensureProject(db, args.project);
    sets.push("project_id = ?");
    binds.push(pid);
  }
  await db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
  return (await getTask(db, id))!;
}

export async function deleteTask(db: D1Database, id: number): Promise<boolean> {
  const res = await db.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();
  return (res.meta.changes ?? 0) > 0;
}

export async function listTasks(
  db: D1Database,
  opts: { status?: string; project?: string; limit?: number } = {}
): Promise<TaskRow[]> {
  const conds: string[] = [];
  const binds: unknown[] = [];
  const status = opts.status ?? "active";
  if (status === "active") conds.push("t.status != 'done'");
  else if (["open", "doing", "done"].includes(status)) {
    conds.push("t.status = ?");
    binds.push(status);
  } // "all" は条件なし
  if (opts.project) {
    conds.push("p.name = ?");
    binds.push(opts.project);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 300);
  const { results } = await db
    .prepare(
      `SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date, p.name AS project,
              t.created_at, t.updated_at, t.completed_at
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
       ${where}
       ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'open' THEN 1 ELSE 2 END,
                CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
                (t.due_date IS NULL), t.due_date, t.id DESC
       LIMIT ${limit}`
    )
    .bind(...binds)
    .all<TaskRow>();
  return results;
}

// ---------- チャット履歴 ----------

export async function listConversations(db: D1Database, limit = 100): Promise<ConversationRow[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.uuid, c.name, c.project_name, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
       FROM conversations c
       ORDER BY (c.updated_at IS NULL), c.updated_at DESC LIMIT ?`
    )
    .bind(Math.min(Math.max(limit, 1), 500))
    .all<ConversationRow>();
  return results;
}

export async function deleteConversation(db: D1Database, id: number): Promise<boolean> {
  await db.prepare("DELETE FROM messages WHERE conversation_id = ?").bind(id).run();
  const res = await db.prepare("DELETE FROM conversations WHERE id = ?").bind(id).run();
  return (res.meta.changes ?? 0) > 0;
}

const CHAT_PAGE_CHARS = 6000;

export async function getConversationText(
  db: D1Database,
  id: number,
  offset = 0
): Promise<{ header: string; page: string; offset: number; total: number; nextOffset: number | null } | null> {
  const conv = await db
    .prepare("SELECT id, name, project_name, created_at, updated_at FROM conversations WHERE id = ?")
    .bind(id)
    .first<{ id: number; name: string; project_name: string; created_at: string | null; updated_at: string | null }>();
  if (!conv) return null;
  const { results } = await db
    .prepare("SELECT sender, text FROM messages WHERE conversation_id = ? ORDER BY seq, id")
    .bind(id)
    .all<{ sender: string; text: string }>();
  const full = results
    .map((m) => `【${m.sender === "human" ? "ユーザー" : "Claude"}】\n${m.text}`)
    .join("\n\n");
  const off = Math.max(0, Number(offset) || 0);
  const page = full.slice(off, off + CHAT_PAGE_CHARS);
  const next = off + CHAT_PAGE_CHARS < full.length ? off + CHAT_PAGE_CHARS : null;
  const header = `チャット「${conv.name || "(無題)"}」${conv.project_name ? ` / プロジェクト: ${conv.project_name}` : ""}（${results.length}メッセージ, 最終更新: ${conv.updated_at ?? "不明"}）`;
  return { header, page, offset: off, total: full.length, nextOffset: next };
}

// ---------- 横断検索 ----------

export interface SearchResults {
  memories: SearchHit[];
  tasks: SearchHit[];
  chats: SearchHit[];
}

export async function searchAll(
  db: D1Database,
  opts: { query?: unknown; types?: unknown; project?: unknown; limit?: unknown }
): Promise<{ terms: string[]; results: SearchResults }> {
  const query = typeof opts.query === "string" ? opts.query : "";
  const terms = splitTerms(query);
  if (!terms.length) throw new Error("query は必須です");
  const limit = Math.min(Math.max(Number(opts.limit) || 8, 1), 30);
  const project = typeof opts.project === "string" && opts.project.trim() ? opts.project.trim() : null;
  const wanted = Array.isArray(opts.types) && opts.types.length ? opts.types.map(String) : ["memories", "tasks", "chats"];
  const results: SearchResults = { memories: [], tasks: [], chats: [] };

  const likeBinds = (n: number) => terms.flatMap((t) => Array(n).fill(`%${likeEscape(t)}%`));

  if (wanted.includes("memories")) {
    const termCond = terms
      .map(() => "(m.title LIKE ? ESCAPE '\\' OR m.content LIKE ? ESCAPE '\\' OR m.tags LIKE ? ESCAPE '\\')")
      .join(" AND ");
    const binds: unknown[] = likeBinds(3);
    let projCond = "";
    if (project) {
      projCond = " AND p.name = ?";
      binds.push(project);
    }
    const { results: rows } = await db
      .prepare(
        `SELECT m.id, m.kind, m.title, m.content, m.tags, p.name AS project, m.created_at
         FROM memories m LEFT JOIN projects p ON p.id = m.project_id
         WHERE ${termCond}${projCond} ORDER BY m.id DESC LIMIT ${limit}`
      )
      .bind(...binds)
      .all<{ id: number; kind: string; title: string; content: string; tags: string; project: string | null; created_at: string }>();
    results.memories = rows.map((r) => ({
      type: "memory",
      id: r.id,
      title: r.title || r.content.slice(0, 40),
      snippet: makeSnippet(r.content, terms),
      date: r.created_at,
      extra: [r.kind, r.project, r.tags].filter(Boolean).join(" / "),
    }));
  }

  if (wanted.includes("tasks")) {
    const termCond = terms.map(() => "(t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\')").join(" AND ");
    const binds: unknown[] = likeBinds(2);
    let projCond = "";
    if (project) {
      projCond = " AND p.name = ?";
      binds.push(project);
    }
    const { results: rows } = await db
      .prepare(
        `SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date, p.name AS project, t.updated_at
         FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
         WHERE ${termCond}${projCond} ORDER BY t.id DESC LIMIT ${limit}`
      )
      .bind(...binds)
      .all<{ id: number; title: string; description: string; status: string; priority: string; due_date: string | null; project: string | null; updated_at: string }>();
    results.tasks = rows.map((r) => ({
      type: "task",
      id: r.id,
      title: r.title,
      snippet: makeSnippet(r.description || r.title, terms, 100),
      date: r.updated_at,
      extra: [`状態:${r.status}`, `優先度:${r.priority}`, r.due_date ? `期限:${r.due_date}` : "", r.project ?? ""]
        .filter(Boolean)
        .join(" / "),
    }));
  }

  if (wanted.includes("chats")) {
    const termCond = terms.map(() => "m.text LIKE ? ESCAPE '\\'").join(" AND ");
    const binds: unknown[] = likeBinds(1);
    let projCond = "";
    if (project) {
      projCond = " AND c.project_name = ?";
      binds.push(project);
    }
    const { results: rows } = await db
      .prepare(
        `SELECT c.id AS conv_id, c.name, c.project_name, c.updated_at, m.text
         FROM messages m JOIN conversations c ON c.id = m.conversation_id
         WHERE ${termCond}${projCond} ORDER BY c.updated_at DESC LIMIT 300`
      )
      .bind(...binds)
      .all<{ conv_id: number; name: string; project_name: string; updated_at: string | null; text: string }>();
    // 会話単位にまとめる(ヒット数が多い順)
    const byConv = new Map<number, { row: (typeof rows)[number]; count: number }>();
    for (const r of rows) {
      const cur = byConv.get(r.conv_id);
      if (cur) cur.count++;
      else byConv.set(r.conv_id, { row: r, count: 1 });
    }
    // タイトル一致の会話も拾う
    const nameCond = terms.map(() => "c.name LIKE ? ESCAPE '\\'").join(" AND ");
    const nameBinds: unknown[] = likeBinds(1);
    if (project) nameBinds.push(project);
    const { results: nameRows } = await db
      .prepare(
        `SELECT c.id AS conv_id, c.name, c.project_name, c.updated_at, '' AS text
         FROM conversations c WHERE ${nameCond}${project ? " AND c.project_name = ?" : ""} LIMIT 20`
      )
      .bind(...nameBinds)
      .all<{ conv_id: number; name: string; project_name: string; updated_at: string | null; text: string }>();
    for (const r of nameRows) if (!byConv.has(r.conv_id)) byConv.set(r.conv_id, { row: r, count: 1 });

    results.chats = [...byConv.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(({ row, count }) => ({
        type: "chat",
        id: row.conv_id,
        title: row.name || "(無題のチャット)",
        snippet: row.text ? makeSnippet(row.text, terms) : "(タイトルに一致)",
        date: row.updated_at ?? "",
        extra: [row.project_name, `ヒット${count}件`].filter(Boolean).join(" / "),
      }));
  }

  return { terms, results };
}

// ---------- 状況サマリー (recall_context 用) ----------

export async function getOverview(db: D1Database, project?: string) {
  const projId = project
    ? (await db.prepare("SELECT id FROM projects WHERE name = ?").bind(project).first<{ id: number }>())?.id ?? -1
    : null;

  const counts = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM memories) AS memories,
        (SELECT COUNT(*) FROM tasks WHERE status != 'done') AS open_tasks,
        (SELECT COUNT(*) FROM tasks) AS all_tasks,
        (SELECT COUNT(*) FROM conversations) AS conversations,
        (SELECT COUNT(*) FROM messages) AS messages`
    )
    .first<{ memories: number; open_tasks: number; all_tasks: number; conversations: number; messages: number }>();

  const tasks = await listTasks(db, { status: "active", project, limit: 15 });
  const memories = await listMemories(db, { project, limit: 12 });
  const projects = await listProjects(db);

  let convWhere = "";
  const convBinds: unknown[] = [];
  if (project) {
    convWhere = "WHERE c.project_name = ?";
    convBinds.push(project);
  }
  const { results: recentConvs } = await db
    .prepare(
      `SELECT c.id, c.name, c.project_name, c.updated_at,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
       FROM conversations c ${convWhere}
       ORDER BY (c.updated_at IS NULL), c.updated_at DESC LIMIT 5`
    )
    .bind(...convBinds)
    .all<{ id: number; name: string; project_name: string; updated_at: string | null; message_count: number }>();

  return { counts: counts!, tasks, memories, projects, recentConvs, projectFilter: project ?? null, projId };
}
