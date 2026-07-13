// Dscribe データアクセス層 (Cloudflare D1 / SQLite)
// すべてのデータは user_id で完全に分離される。各関数は必ず userId を受け取り、
// 他ユーザーのデータには一切アクセスできない。

export type Kind = "memory" | "decision" | "note";
export type TaskStatus = "open" | "doing" | "done";
export type Priority = "high" | "normal" | "low";

export interface UserRow {
  id: number;
  email: string;
  token: string | null;
  is_owner: number;
  created_at: string;
}

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

// ---------- 設定 (settings) ----------

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row ? row.value : null;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, value)
    .run();
}

// ---------- ユーザー / アカウント ----------

export const MAX_USERS = 100;

export function genToken(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function validEmail(e: unknown): e is string {
  return typeof e === "string" && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export async function getUserByToken(db: D1Database, token: string | null | undefined): Promise<UserRow | null> {
  if (!token || token.length < 8) return null;
  return await db.prepare("SELECT id, email, token, is_owner, created_at FROM users WHERE token = ?").bind(token).first<UserRow>();
}

export async function countUsers(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS c FROM users").first<{ c: number }>();
  return row?.c ?? 0;
}

export async function createUser(db: D1Database, emailRaw: unknown, isOwner = false): Promise<UserRow> {
  if (!validEmail(emailRaw)) throw new Error("メールアドレスの形式が正しくありません");
  const email = emailRaw.trim().toLowerCase();
  if ((await countUsers(db)) >= MAX_USERS) throw new Error("登録上限に達しています。管理者に連絡してください");
  const exists = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (exists) throw new Error("このメールアドレスは登録済みです。URLが分からない場合は招待してくれた人(管理者)に再発行を依頼してください");
  const token = genToken();
  const res = await db
    .prepare("INSERT INTO users (email, token, is_owner) VALUES (?, ?, ?)")
    .bind(email, token, isOwner ? 1 : 0)
    .run();
  return {
    id: Number(res.meta.last_row_id),
    email,
    token,
    is_owner: isOwner ? 1 : 0,
    created_at: new Date().toISOString(),
  };
}

export async function listUsers(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT u.id, u.email, u.is_owner, u.created_at,
        (SELECT COUNT(*) FROM memories m WHERE m.user_id = u.id) AS memory_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id) AS task_count,
        (SELECT COUNT(*) FROM conversations c WHERE c.user_id = u.id) AS conversation_count
       FROM users u ORDER BY u.id`
    )
    .all<{ id: number; email: string; is_owner: number; created_at: string; memory_count: number; task_count: number; conversation_count: number }>();
  return results;
}

export async function resetUserToken(db: D1Database, id: number): Promise<string | null> {
  const user = await db.prepare("SELECT id FROM users WHERE id = ?").bind(id).first();
  if (!user) return null;
  const token = genToken();
  await db.prepare("UPDATE users SET token = ? WHERE id = ?").bind(token, id).run();
  return token;
}

export async function deleteUserCascade(db: D1Database, id: number): Promise<boolean> {
  const user = await db.prepare("SELECT id, is_owner FROM users WHERE id = ?").bind(id).first<{ id: number; is_owner: number }>();
  if (!user) return false;
  if (user.is_owner) throw new Error("オーナーは削除できません");
  await db.batch([
    db.prepare("DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)").bind(id),
    db.prepare("DELETE FROM conversations WHERE user_id = ?").bind(id),
    db.prepare("DELETE FROM memories WHERE user_id = ?").bind(id),
    db.prepare("DELETE FROM tasks WHERE user_id = ?").bind(id),
    db.prepare("DELETE FROM projects WHERE user_id = ?").bind(id),
    db.prepare("DELETE FROM users WHERE id = ?").bind(id),
  ]);
  return true;
}

// ---------- プロジェクト ----------

export async function ensureProject(db: D1Database, userId: number, name: unknown): Promise<number | null> {
  const n = typeof name === "string" ? name.trim() : "";
  if (!n) return null;
  await db.prepare("INSERT OR IGNORE INTO projects (user_id, name) VALUES (?, ?)").bind(userId, n).run();
  const row = await db.prepare("SELECT id FROM projects WHERE user_id = ? AND name = ?").bind(userId, n).first<{ id: number }>();
  return row ? row.id : null;
}

export async function listProjects(db: D1Database, userId: number) {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.name, p.description,
        (SELECT COUNT(*) FROM memories m WHERE m.project_id = p.id) AS memory_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status != 'done') AS open_tasks
       FROM projects p WHERE p.user_id = ? ORDER BY p.name`
    )
    .bind(userId)
    .all<{ id: number; name: string; description: string; memory_count: number; open_tasks: number }>();
  const { results: convs } = await db
    .prepare(
      `SELECT project_name, COUNT(*) AS cnt FROM conversations
       WHERE user_id = ? AND project_name != '' GROUP BY project_name`
    )
    .bind(userId)
    .all<{ project_name: string; cnt: number }>();
  const convMap = new Map(convs.map((c) => [c.project_name, c.cnt]));
  return results.map((p) => ({ ...p, conversation_count: convMap.get(p.name) ?? 0 }));
}

// ---------- 記憶 (memories) ----------

export async function saveMemory(
  db: D1Database,
  userId: number,
  args: { content?: unknown; title?: unknown; kind?: unknown; tags?: unknown; project?: unknown; source?: string }
): Promise<MemoryRow> {
  const content = typeof args.content === "string" ? args.content.trim() : "";
  if (!content) throw new Error("content は必須です");
  const projectId = await ensureProject(db, userId, args.project);
  const title = typeof args.title === "string" ? args.title.trim().slice(0, 200) : "";
  const res = await db
    .prepare(
      `INSERT INTO memories (user_id, kind, title, content, tags, source, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(userId, normKind(args.kind), title, content.slice(0, 50000), normTags(args.tags), args.source ?? "chat", projectId)
    .run();
  const id = Number(res.meta.last_row_id);
  return (await getMemory(db, userId, id))!;
}

export async function getMemory(db: D1Database, userId: number, id: number): Promise<MemoryRow | null> {
  return await db
    .prepare(
      `SELECT m.id, m.kind, m.title, m.content, m.tags, m.source, p.name AS project, m.created_at
       FROM memories m LEFT JOIN projects p ON p.id = m.project_id
       WHERE m.id = ? AND m.user_id = ?`
    )
    .bind(id, userId)
    .first<MemoryRow>();
}

export async function listMemories(
  db: D1Database,
  userId: number,
  opts: { kind?: string; project?: string; limit?: number } = {}
): Promise<MemoryRow[]> {
  const conds: string[] = ["m.user_id = ?"];
  const binds: unknown[] = [userId];
  if (opts.kind && ["memory", "decision", "note"].includes(opts.kind)) {
    conds.push("m.kind = ?");
    binds.push(opts.kind);
  }
  if (opts.project) {
    conds.push("p.name = ?");
    binds.push(opts.project);
  }
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  const { results } = await db
    .prepare(
      `SELECT m.id, m.kind, m.title, m.content, m.tags, m.source, p.name AS project, m.created_at
       FROM memories m LEFT JOIN projects p ON p.id = m.project_id
       WHERE ${conds.join(" AND ")} ORDER BY m.id DESC LIMIT ${limit}`
    )
    .bind(...binds)
    .all<MemoryRow>();
  return results;
}

export async function deleteMemory(db: D1Database, userId: number, id: number): Promise<boolean> {
  const res = await db.prepare("DELETE FROM memories WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return (res.meta.changes ?? 0) > 0;
}

// ---------- タスク ----------

export async function createTask(
  db: D1Database,
  userId: number,
  args: { title?: unknown; description?: unknown; due_date?: unknown; priority?: unknown; project?: unknown }
): Promise<TaskRow> {
  const title = typeof args.title === "string" ? args.title.trim() : "";
  if (!title) throw new Error("title は必須です");
  const projectId = await ensureProject(db, userId, args.project);
  const due = typeof args.due_date === "string" && /^\d{4}-\d{2}-\d{2}/.test(args.due_date) ? args.due_date.slice(0, 10) : null;
  const res = await db
    .prepare(
      `INSERT INTO tasks (user_id, title, description, priority, due_date, project_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      userId,
      title.slice(0, 300),
      typeof args.description === "string" ? args.description.slice(0, 10000) : "",
      normPriority(args.priority),
      due,
      projectId
    )
    .run();
  const id = Number(res.meta.last_row_id);
  return (await getTask(db, userId, id))!;
}

export async function getTask(db: D1Database, userId: number, id: number): Promise<TaskRow | null> {
  return await db
    .prepare(
      `SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date, p.name AS project,
              t.created_at, t.updated_at, t.completed_at
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.id = ? AND t.user_id = ?`
    )
    .bind(id, userId)
    .first<TaskRow>();
}

export async function updateTask(
  db: D1Database,
  userId: number,
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
  const existing = await getTask(db, userId, id);
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
    const pid = await ensureProject(db, userId, args.project);
    sets.push("project_id = ?");
    binds.push(pid);
  }
  await db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`).bind(...binds, id, userId).run();
  return (await getTask(db, userId, id))!;
}

export async function deleteTask(db: D1Database, userId: number, id: number): Promise<boolean> {
  const res = await db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return (res.meta.changes ?? 0) > 0;
}

export async function listTasks(
  db: D1Database,
  userId: number,
  opts: { status?: string; project?: string; limit?: number } = {}
): Promise<TaskRow[]> {
  const conds: string[] = ["t.user_id = ?"];
  const binds: unknown[] = [userId];
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
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 300);
  const { results } = await db
    .prepare(
      `SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date, p.name AS project,
              t.created_at, t.updated_at, t.completed_at
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
       WHERE ${conds.join(" AND ")}
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

export async function listConversations(db: D1Database, userId: number, limit = 100): Promise<ConversationRow[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.uuid, c.name, c.project_name, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
       FROM conversations c WHERE c.user_id = ?
       ORDER BY (c.updated_at IS NULL), c.updated_at DESC LIMIT ?`
    )
    .bind(userId, Math.min(Math.max(limit, 1), 500))
    .all<ConversationRow>();
  return results;
}

export async function deleteConversation(db: D1Database, userId: number, id: number): Promise<boolean> {
  const conv = await db.prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!conv) return false;
  await db.prepare("DELETE FROM messages WHERE conversation_id = ?").bind(id).run();
  const res = await db.prepare("DELETE FROM conversations WHERE id = ?").bind(id).run();
  return (res.meta.changes ?? 0) > 0;
}

const CHAT_PAGE_CHARS = 6000;

export async function getConversationText(
  db: D1Database,
  userId: number,
  id: number,
  offset = 0
): Promise<{ header: string; page: string; offset: number; total: number; nextOffset: number | null } | null> {
  const conv = await db
    .prepare("SELECT id, name, project_name, created_at, updated_at FROM conversations WHERE id = ? AND user_id = ?")
    .bind(id, userId)
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
  userId: number,
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
    const binds: unknown[] = [userId, ...likeBinds(3)];
    let projCond = "";
    if (project) {
      projCond = " AND p.name = ?";
      binds.push(project);
    }
    const { results: rows } = await db
      .prepare(
        `SELECT m.id, m.kind, m.title, m.content, m.tags, p.name AS project, m.created_at
         FROM memories m LEFT JOIN projects p ON p.id = m.project_id
         WHERE m.user_id = ? AND ${termCond}${projCond} ORDER BY m.id DESC LIMIT ${limit}`
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
    const binds: unknown[] = [userId, ...likeBinds(2)];
    let projCond = "";
    if (project) {
      projCond = " AND p.name = ?";
      binds.push(project);
    }
    const { results: rows } = await db
      .prepare(
        `SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date, p.name AS project, t.updated_at
         FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
         WHERE t.user_id = ? AND ${termCond}${projCond} ORDER BY t.id DESC LIMIT ${limit}`
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
    const binds: unknown[] = [userId, ...likeBinds(1)];
    let projCond = "";
    if (project) {
      projCond = " AND c.project_name = ?";
      binds.push(project);
    }
    const { results: rows } = await db
      .prepare(
        `SELECT c.id AS conv_id, c.name, c.project_name, c.updated_at, m.text
         FROM messages m JOIN conversations c ON c.id = m.conversation_id
         WHERE c.user_id = ? AND ${termCond}${projCond} ORDER BY c.updated_at DESC LIMIT 300`
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
    const nameBinds: unknown[] = [userId, ...likeBinds(1)];
    if (project) nameBinds.push(project);
    const { results: nameRows } = await db
      .prepare(
        `SELECT c.id AS conv_id, c.name, c.project_name, c.updated_at, '' AS text
         FROM conversations c WHERE c.user_id = ? AND ${nameCond}${project ? " AND c.project_name = ?" : ""} LIMIT 20`
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

export async function getOverview(db: D1Database, userId: number, project?: string) {
  const counts = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM memories WHERE user_id = ?1) AS memories,
        (SELECT COUNT(*) FROM tasks WHERE user_id = ?1 AND status != 'done') AS open_tasks,
        (SELECT COUNT(*) FROM tasks WHERE user_id = ?1) AS all_tasks,
        (SELECT COUNT(*) FROM conversations WHERE user_id = ?1) AS conversations,
        (SELECT COUNT(*) FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?1)) AS messages`
    )
    .bind(userId)
    .first<{ memories: number; open_tasks: number; all_tasks: number; conversations: number; messages: number }>();

  const tasks = await listTasks(db, userId, { status: "active", project, limit: 15 });
  const memories = await listMemories(db, userId, { project, limit: 12 });
  const projects = await listProjects(db, userId);

  const convConds = ["c.user_id = ?"];
  const convBinds: unknown[] = [userId];
  if (project) {
    convConds.push("c.project_name = ?");
    convBinds.push(project);
  }
  const { results: recentConvs } = await db
    .prepare(
      `SELECT c.id, c.name, c.project_name, c.updated_at,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
       FROM conversations c WHERE ${convConds.join(" AND ")}
       ORDER BY (c.updated_at IS NULL), c.updated_at DESC LIMIT 5`
    )
    .bind(...convBinds)
    .all<{ id: number; name: string; project_name: string; updated_at: string | null; message_count: number }>();

  return { counts: counts!, tasks, memories, projects, recentConvs, projectFilter: project ?? null };
}
