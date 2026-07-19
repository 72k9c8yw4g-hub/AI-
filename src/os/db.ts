// AI意思決定OS — データアクセス (チャット / メッセージ / 役割モデル設定)。
// すべて user_id スコープ。既存 Dscribe の分離方針(ユーザーごとに完全独立)を踏襲する。

import { keyFor, resolveModel, type LlmSecrets, type Provider, type RoleModel } from "./provider";
import {
  saveMemory,
  listMemories,
  getMemory,
  getMemoryChain,
  likeEscape,
  splitTerms,
  getSetting,
  setSetting,
  genToken,
  createTask,
  ensureProject,
  listProjects,
  type MemoryRow,
  type TaskRow,
} from "../db";

export interface OsChat {
  id: number;
  title: string;
  project_id: number | null;
  project?: string | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface OsMessage {
  id: number;
  role: string;
  name: string;
  content: string;
  created_at: string;
  seq: number;
}

// チャット一覧 (更新が新しい順)。メッセージ件数・プロジェクト名つき。project 指定でそのPJに絞る。
export async function listChats(db: D1Database, userId: number, project?: string): Promise<OsChat[]> {
  const conds = ["c.user_id = ?"];
  const binds: unknown[] = [userId];
  if (project) {
    conds.push("p.name = ?");
    binds.push(project);
  }
  const { results } = await db
    .prepare(
      `SELECT c.id, c.title, c.project_id, p.name AS project, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM os_messages m WHERE m.chat_id = c.id) AS message_count
         FROM os_chats c LEFT JOIN projects p ON p.id = c.project_id
        WHERE ${conds.join(" AND ")}
        ORDER BY c.updated_at DESC, c.id DESC`
    )
    .bind(...binds)
    .all<OsChat>();
  return results;
}

export async function getChat(db: D1Database, userId: number, id: number): Promise<OsChat | null> {
  return db
    .prepare(
      `SELECT c.id, c.title, c.project_id, p.name AS project, c.created_at, c.updated_at
         FROM os_chats c LEFT JOIN projects p ON p.id = c.project_id
        WHERE c.id = ? AND c.user_id = ?`
    )
    .bind(id, userId)
    .first<OsChat>();
}

export async function createChat(db: D1Database, userId: number, title?: unknown, project?: unknown): Promise<OsChat> {
  const t = (typeof title === "string" ? title : "").trim().slice(0, 120) || "新しい会話";
  const projectId = await ensureProject(db, userId, project);
  const row = await db
    .prepare(`INSERT INTO os_chats (user_id, title, project_id) VALUES (?, ?, ?) RETURNING id, title, project_id, created_at, updated_at`)
    .bind(userId, t, projectId)
    .first<OsChat>();
  if (!row) throw new Error("チャット作成に失敗しました");
  return row;
}

// チャットをプロジェクトに割り当てる(空文字で外す)。技術設計書 第7章: プロジェクト→チャット群
export async function assignChatProject(db: D1Database, userId: number, chatId: number, project: unknown): Promise<boolean> {
  const chat = await getChat(db, userId, chatId);
  if (!chat) return false;
  const projectId = await ensureProject(db, userId, project);
  const r = await db
    .prepare(`UPDATE os_chats SET project_id = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .bind(projectId, chatId, userId)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

// OS視点のプロジェクト一覧: Dscribe のプロジェクトに、OSチャット数・現行決定数・完了状態を足す。
export async function listOsProjects(db: D1Database, userId: number) {
  const base = await listProjects(db, userId);
  const { results: chatCounts } = await db
    .prepare(`SELECT p.name AS name, COUNT(c.id) AS cnt FROM os_chats c JOIN projects p ON p.id = c.project_id WHERE c.user_id = ? GROUP BY p.name`)
    .bind(userId)
    .all<{ name: string; cnt: number }>();
  const { results: decCounts } = await db
    .prepare(
      `SELECT p.name AS name, COUNT(m.id) AS cnt FROM memories m JOIN projects p ON p.id = m.project_id
        WHERE m.user_id = ? AND m.kind = 'decision' AND m.superseded_by_id IS NULL GROUP BY p.name`
    )
    .bind(userId)
    .all<{ name: string; cnt: number }>();
  const { results: statuses } = await db
    .prepare(`SELECT p.name AS name, s.status AS status FROM os_project_status s JOIN projects p ON p.id = s.project_id WHERE s.user_id = ?`)
    .bind(userId)
    .all<{ name: string; status: string }>();
  const chatMap = new Map(chatCounts.map((r) => [r.name, r.cnt]));
  const decMap = new Map(decCounts.map((r) => [r.name, r.cnt]));
  const statMap = new Map(statuses.map((r) => [r.name, r.status]));
  return base.map((p) => ({
    ...p,
    os_chats: chatMap.get(p.name) ?? 0,
    active_decisions: decMap.get(p.name) ?? 0,
    status: statMap.get(p.name) ?? "active",
  }));
}

// プロジェクトの完了(アーカイブ)/再開。運用設計書 第9章の終了運用。
export async function setProjectStatus(db: D1Database, userId: number, project: unknown, status: "active" | "archived", finalReport = ""): Promise<boolean> {
  const projectId = await ensureProject(db, userId, project);
  if (!projectId) return false;
  await db
    .prepare(
      `INSERT INTO os_project_status (user_id, project_id, status, final_report) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, project_id) DO UPDATE SET status = excluded.status,
         final_report = CASE WHEN excluded.final_report != '' THEN excluded.final_report ELSE os_project_status.final_report END,
         updated_at = datetime('now')`
    )
    .bind(userId, projectId, status, finalReport)
    .run();
  return true;
}

export async function getProjectStatus(db: D1Database, userId: number, project: string): Promise<{ status: string; final_report: string } | null> {
  return db
    .prepare(`SELECT s.status, s.final_report FROM os_project_status s JOIN projects p ON p.id = s.project_id WHERE s.user_id = ? AND p.name = ?`)
    .bind(userId, project)
    .first<{ status: string; final_report: string }>();
}

// プロジェクトの現行決定(最終報告の材料)
export async function projectActiveDecisions(db: D1Database, userId: number, project: string): Promise<MemoryRow[]> {
  const all = await listMemories(db, userId, { kind: "decision", project, limit: 200, activeOnly: true });
  return all;
}

// 保存データ(決定以外の記録: memory / note)。実装準備設計書 第3章「保存データ」画面。
export async function listSavedData(db: D1Database, userId: number, opts: { project?: string; q?: string } = {}): Promise<MemoryRow[]> {
  const conds = ["m.user_id = ?", "m.kind IN ('memory','note')", "m.superseded_by_id IS NULL"];
  const binds: unknown[] = [userId];
  if (opts.project) {
    conds.push("p.name = ?");
    binds.push(opts.project);
  }
  const terms = splitTerms(opts.q ?? "");
  for (const t of terms) {
    conds.push("(m.title LIKE ? ESCAPE '\\' OR m.content LIKE ? ESCAPE '\\' OR m.tags LIKE ? ESCAPE '\\')");
    binds.push(`%${likeEscape(t)}%`, `%${likeEscape(t)}%`, `%${likeEscape(t)}%`);
  }
  const { results } = await db
    .prepare(
      `SELECT m.id, m.kind, m.title, m.content, m.tags, m.source, p.name AS project, m.created_at,
              m.supersedes_id, m.superseded_by_id, m.supersede_reason
         FROM memories m LEFT JOIN projects p ON p.id = m.project_id
        WHERE ${conds.join(" AND ")} ORDER BY m.id DESC LIMIT 100`
    )
    .bind(...binds)
    .all<MemoryRow>();
  return results;
}

export async function renameChat(db: D1Database, userId: number, id: number, title: unknown): Promise<boolean> {
  const t = (typeof title === "string" ? title : "").trim().slice(0, 120);
  if (!t) return false;
  const r = await db
    .prepare(`UPDATE os_chats SET title = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .bind(t, id, userId)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

export async function deleteChat(db: D1Database, userId: number, id: number): Promise<boolean> {
  const chat = await getChat(db, userId, id);
  if (!chat) return false;
  await db.prepare(`DELETE FROM os_messages WHERE chat_id = ? AND user_id = ?`).bind(id, userId).run();
  const r = await db.prepare(`DELETE FROM os_chats WHERE id = ? AND user_id = ?`).bind(id, userId).run();
  return (r.meta.changes ?? 0) > 0;
}

export async function listMessages(db: D1Database, userId: number, chatId: number): Promise<OsMessage[]> {
  const { results } = await db
    .prepare(
      `SELECT id, role, name, content, created_at, seq
         FROM os_messages WHERE chat_id = ? AND user_id = ?
        ORDER BY seq ASC, id ASC`
    )
    .bind(chatId, userId)
    .all<OsMessage>();
  return results;
}

// 1メッセージの最大長。DB肥大とLLMコスト暴走の入口を塞ぐ(タイトルは別途120字)
const MAX_MESSAGE_CHARS = 8000;

// メッセージ追加。seq はチャット内連番。チャットの updated_at も進める。
export async function addMessage(
  db: D1Database,
  userId: number,
  chatId: number,
  role: string,
  content: string,
  name = ""
): Promise<OsMessage> {
  content = content.slice(0, MAX_MESSAGE_CHARS);
  const seqRow = await db
    .prepare(`SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM os_messages WHERE chat_id = ?`)
    .bind(chatId)
    .first<{ n: number }>();
  const seq = seqRow?.n ?? 1;
  const row = await db
    .prepare(
      `INSERT INTO os_messages (chat_id, user_id, role, name, content, seq)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id, role, name, content, created_at, seq`
    )
    .bind(chatId, userId, role, name, content, seq)
    .first<OsMessage>();
  await db.prepare(`UPDATE os_chats SET updated_at = datetime('now') WHERE id = ? AND user_id = ?`).bind(chatId, userId).run();
  if (!row) throw new Error("メッセージ保存に失敗しました");
  return row;
}

// 最初のユーザー発言でチャット名がまだ既定なら、その内容から自動命名する。
export async function autoTitleIfNeeded(db: D1Database, userId: number, chatId: number, firstUserText: string): Promise<void> {
  const chat = await getChat(db, userId, chatId);
  if (!chat || (chat.title && chat.title !== "新しい会話")) return;
  const t = firstUserText.replace(/\s+/g, " ").trim().slice(0, 30);
  if (t) await renameChat(db, userId, chatId, t);
}

// worker1/2/3 = 作業AI群の個別スロット(実装準備第14章「デフォルト＋個別上書き」)。未設定なら worker(既定)へ落ちる。
const VALID_ROLES = new Set(["mentor", "monitor", "recorder", "worker", "worker1", "worker2", "worker3"]);
const VALID_PROVIDERS = new Set<Provider>(["anthropic", "openai", "gemini"]);

// 役割の使用モデルを取得。未設定なら既定(anthropic + 役割別既定モデル)。
// モデル名がプロバイダと食い違う(切替時の残骸・プロジェクトID誤入力)場合は読み取り時に自己修復する。
export async function getRoleModel(db: D1Database, userId: number, role: string): Promise<RoleModel> {
  const row = await db
    .prepare(`SELECT provider, model FROM os_role_config WHERE user_id = ? AND role = ?`)
    .bind(userId, role)
    .first<{ provider: string; model: string }>();
  const provider = (row && VALID_PROVIDERS.has(row.provider as Provider) ? row.provider : "anthropic") as Provider;
  return { provider, model: resolveModel(provider, row?.model ?? "") };
}

export async function setRoleModel(db: D1Database, userId: number, role: string, provider: string, model: string): Promise<boolean> {
  if (!VALID_ROLES.has(role) || !VALID_PROVIDERS.has(provider as Provider)) return false;
  await db
    .prepare(
      `INSERT INTO os_role_config (user_id, role, provider, model) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, role) DO UPDATE SET provider = excluded.provider, model = excluded.model, updated_at = datetime('now')`
    )
    .bind(userId, role, provider, (typeof model === "string" ? model : "").trim().slice(0, 80))
    .run();
  return true;
}

// 作業AI n(1..3)のモデル。個別設定(worker1/2/3)があればそれ、無ければ作業AI既定(worker)に落ちる。
export async function getWorkerRoleModel(db: D1Database, userId: number, n: number): Promise<RoleModel> {
  const row = await db
    .prepare(`SELECT provider, model FROM os_role_config WHERE user_id = ? AND role = ?`)
    .bind(userId, `worker${n}`)
    .first<{ provider: string; model: string }>();
  if (row && VALID_PROVIDERS.has(row.provider as Provider)) {
    return { provider: row.provider as Provider, model: resolveModel(row.provider as Provider, row.model ?? "") };
  }
  return getRoleModel(db, userId, "worker");
}

// ── 保存候補 (os_candidates) ──────────────────────────────
export interface OsCandidate {
  id: number;
  chat_id: number | null;
  kind: string;
  title: string;
  content: string;
  tags: string;
  project: string;
  summary: string;
  supersedes_id: number | null;
  status: string;
  memory_id: number | null;
  created_at: string;
  decided_at: string | null;
}

export interface CandidateInput {
  kind: string;
  title: string;
  content: string;
  tags: string;
  summary: string;
  supersedes_id: number | null;
  project?: string;
}

export async function createCandidate(db: D1Database, userId: number, chatId: number | null, c: CandidateInput): Promise<OsCandidate> {
  const row = await db
    .prepare(
      `INSERT INTO os_candidates (user_id, chat_id, kind, title, content, tags, project, summary, supersedes_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .bind(userId, chatId, c.kind, c.title, c.content, c.tags, c.project ?? "", c.summary, c.supersedes_id)
    .first<OsCandidate>();
  if (!row) throw new Error("保存候補の作成に失敗しました");
  return row;
}

export async function getCandidate(db: D1Database, userId: number, id: number): Promise<OsCandidate | null> {
  return db.prepare(`SELECT * FROM os_candidates WHERE id = ? AND user_id = ?`).bind(id, userId).first<OsCandidate>();
}

export async function listPendingCandidates(db: D1Database, userId: number, chatId?: number): Promise<OsCandidate[]> {
  const sql = `SELECT * FROM os_candidates WHERE user_id = ? AND status = 'pending'${chatId ? " AND chat_id = ?" : ""} ORDER BY id DESC`;
  const stmt = chatId ? db.prepare(sql).bind(userId, chatId) : db.prepare(sql).bind(userId);
  const { results } = await stmt.all<OsCandidate>();
  return results;
}

// 承認 = 明示的承認。決定事項(memories kind=decision)として保存する。無承認では決して保存しない。
// 二重承認レース対策: 先に status='pending' 条件つき UPDATE で「承認権」を原子的に取る。
export async function approveCandidate(
  db: D1Database,
  userId: number,
  id: number
): Promise<{ ok: boolean; memory?: MemoryRow; error?: string }> {
  const c = await getCandidate(db, userId, id);
  if (!c) return { ok: false, error: "保存候補が見つかりません" };
  const claim = await db
    .prepare(
      `UPDATE os_candidates SET status = 'approved', decided_at = datetime('now')
        WHERE id = ? AND user_id = ? AND status = 'pending'`
    )
    .bind(id, userId)
    .run();
  if ((claim.meta.changes ?? 0) === 0) return { ok: false, error: `この候補は既に処理済みです (${c.status})` };
  let memory: MemoryRow;
  try {
    memory = await saveMemory(db, userId, {
      content: c.content || c.title,
      title: c.title,
      kind: c.kind,
      tags: c.tags,
      project: c.project || undefined,
      source: "recorder",
      supersedes: c.supersedes_id ?? undefined,
    });
  } catch (e) {
    // 保存に失敗したら承認権を返上して pending に戻す(再承認できるように)
    await db
      .prepare(`UPDATE os_candidates SET status = 'pending', decided_at = NULL WHERE id = ? AND user_id = ?`)
      .bind(id, userId)
      .run();
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  await db.prepare(`UPDATE os_candidates SET memory_id = ? WHERE id = ? AND user_id = ?`).bind(memory.id, id, userId).run();
  return { ok: true, memory };
}

export async function rejectCandidate(db: D1Database, userId: number, id: number): Promise<boolean> {
  const r = await db
    .prepare(`UPDATE os_candidates SET status = 'rejected', decided_at = datetime('now') WHERE id = ? AND user_id = ? AND status = 'pending'`)
    .bind(id, userId)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

// ── 決定事項 (Dscribe memories kind=decision を転用) ──────────
// Active = superseded_by_id が NULL / Archived = 置き換え済み。憲法第8章のコンフリクトルールに一致。
export async function listDecisions(db: D1Database, userId: number): Promise<{ active: MemoryRow[]; archived: MemoryRow[] }> {
  const all = await listMemories(db, userId, { kind: "decision", limit: 500 });
  return {
    active: all.filter((m) => !m.superseded_by_id),
    archived: all.filter((m) => m.superseded_by_id),
  };
}

// 記録官に渡す「現在有効な決定」の一覧(ID + タイトル)。
export async function activeDecisionList(db: D1Database, userId: number): Promise<{ id: number; title: string }[]> {
  const all = await listMemories(db, userId, { kind: "decision", limit: 200, activeOnly: true });
  return all.map((m) => ({ id: m.id, title: m.title || m.content.slice(0, 40) }));
}

// ── 決定事項の詳細 (実装準備設計書 第8章) ──────────────────
// タイトル・内容・状態・タグ・作成日に加えて、更新履歴(supersedesチェーン)・
// 元チャット(どの会話の保存候補から生まれたか)・関連決定(タグ/プロジェクトの重なり)を返す。
export interface DecisionDetail {
  decision: MemoryRow;
  status: "active" | "archived";
  chain: { id: number; title: string; content: string; created_at: string; reason: string | null; current: boolean }[];
  sourceChat: { chat_id: number; title: string; candidate_created_at: string } | null;
  related: { id: number; title: string; status: "active" | "archived" }[];
  tasks: TaskRow[];
}

export async function getDecisionDetail(db: D1Database, userId: number, id: number): Promise<DecisionDetail | null> {
  const m = await getMemory(db, userId, id);
  if (!m || m.kind !== "decision") return null;

  // 更新履歴: 旧→新の線形チェーン
  const chainRows = await getMemoryChain(db, userId, id);
  const chain = chainRows.map((c) => ({
    id: c.id,
    title: c.title || c.content.slice(0, 40),
    content: c.content,
    created_at: c.created_at,
    reason: c.supersede_reason,
    current: !c.superseded_by_id,
  }));

  // 元チャット: この決定(またはチェーン内の決定)を生んだ保存候補 → チャット
  const chainIds = chainRows.map((c) => c.id);
  let sourceChat: DecisionDetail["sourceChat"] = null;
  if (chainIds.length) {
    const src = await db
      .prepare(
        `SELECT oc.chat_id, oc.created_at, c.title
           FROM os_candidates oc JOIN os_chats c ON c.id = oc.chat_id
          WHERE oc.user_id = ? AND oc.memory_id IN (${chainIds.map(() => "?").join(",")})
          ORDER BY oc.id ASC LIMIT 1`
      )
      .bind(userId, ...chainIds)
      .first<{ chat_id: number; created_at: string; title: string }>();
    if (src) sourceChat = { chat_id: src.chat_id, title: src.title, candidate_created_at: src.created_at };
  }

  // 関連決定: タグまたはプロジェクトが重なる他の決定(チェーン内は除く)
  const related: DecisionDetail["related"] = [];
  const all = await listMemories(db, userId, { kind: "decision", limit: 300 });
  const myTags = (m.tags || "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  for (const d of all) {
    if (chainIds.includes(d.id)) continue;
    const tags = (d.tags || "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    const tagHit = myTags.length && tags.some((t) => myTags.includes(t));
    const projHit = m.project && d.project === m.project;
    if (tagHit || projHit) related.push({ id: d.id, title: d.title || d.content.slice(0, 40), status: d.superseded_by_id ? "archived" : "active" });
    if (related.length >= 5) break;
  }

  return {
    decision: m,
    status: m.superseded_by_id ? "archived" : "active",
    chain,
    sourceChat,
    related,
    tasks: await linkedTasks(db, userId, chainIds),
  };
}

// ── 決定→タスク化ブリッジ (憲法 Rule 4: アイデアより実行を優先) ──
// 決定を Dscribe のタスクに落とす。リンクは description 内の [決定#N] マーカーで持つ
// (スキーマ変更なし。Claude 側の list_tasks からも同じタスクが見える = 共有脳)。

export async function taskFromDecision(db: D1Database, userId: number, decisionId: number): Promise<TaskRow> {
  const m = await getMemory(db, userId, decisionId);
  if (!m || m.kind !== "decision") throw new Error("決定事項が見つかりません");
  const title = (m.title || m.content.slice(0, 60)).slice(0, 200);
  return createTask(db, userId, {
    title: `実行: ${title}`,
    description: `[決定#${decisionId}] から作成\n\n${m.content.slice(0, 2000)}`,
    project: m.project ?? undefined,
  });
}

// この決定(チェーン全体)にひもづく実行タスク一覧
export async function linkedTasks(db: D1Database, userId: number, decisionIds: number[]): Promise<TaskRow[]> {
  if (!decisionIds.length) return [];
  const conds = decisionIds.map(() => `t.description LIKE ? ESCAPE '\\'`).join(" OR ");
  const binds = decisionIds.map((id) => `%[決定#${id}]%`);
  const { results } = await db
    .prepare(
      `SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date, p.name AS project, t.created_at, t.updated_at, t.completed_at
         FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.user_id = ? AND (${conds}) ORDER BY t.id DESC LIMIT 20`
    )
    .bind(userId, ...binds)
    .all<TaskRow>();
  return results;
}

// ── OS内の横断検索 (実装準備設計書 第12章) ─────────────────
// 対象: チャット(メッセージ全文)・決定事項(旧版含む)・AI会話ログ。スペース区切りのAND検索。
export interface OsSearchResults {
  chats: { chat_id: number; title: string; role: string; snippet: string; created_at: string }[];
  decisions: { id: number; title: string; snippet: string; status: "active" | "archived"; created_at: string }[];
  ailogs: { run_id: number; task: string; name: string; snippet: string; created_at: string }[];
}

function snippet(text: string, term: string, width = 60): string {
  const i = text.toLowerCase().indexOf(term.toLowerCase());
  const start = Math.max(0, (i < 0 ? 0 : i) - Math.floor(width / 3));
  const s = text.slice(start, start + width).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + s + (start + width < text.length ? "…" : "");
}

export async function searchOs(db: D1Database, userId: number, query: unknown): Promise<{ terms: string[]; results: OsSearchResults }> {
  const terms = splitTerms(typeof query === "string" ? query : "");
  if (!terms.length) throw new Error("q は必須です");
  const likeBinds = (n: number) => terms.flatMap((t) => Array(n).fill(`%${likeEscape(t)}%`));
  const results: OsSearchResults = { chats: [], decisions: [], ailogs: [] };

  // チャット(メッセージ全文)。監視官の警告はノイズなので除外
  {
    const cond = terms.map(() => "m.content LIKE ? ESCAPE '\\'").join(" AND ");
    const { results: rows } = await db
      .prepare(
        `SELECT m.chat_id, c.title, m.role, m.content, m.created_at
           FROM os_messages m JOIN os_chats c ON c.id = m.chat_id
          WHERE m.user_id = ? AND m.role != 'monitor' AND ${cond}
          ORDER BY m.id DESC LIMIT 10`
      )
      .bind(userId, ...likeBinds(1))
      .all<{ chat_id: number; title: string; role: string; content: string; created_at: string }>();
    results.chats = rows.map((r) => ({ chat_id: r.chat_id, title: r.title, role: r.role, snippet: snippet(r.content, terms[0]), created_at: r.created_at }));
  }

  // 決定事項(旧版含む)
  {
    const cond = terms.map(() => "(m.title LIKE ? ESCAPE '\\' OR m.content LIKE ? ESCAPE '\\' OR m.tags LIKE ? ESCAPE '\\')").join(" AND ");
    const { results: rows } = await db
      .prepare(
        `SELECT m.id, m.title, m.content, m.superseded_by_id, m.created_at
           FROM memories m WHERE m.user_id = ? AND m.kind = 'decision' AND ${cond}
          ORDER BY m.id DESC LIMIT 10`
      )
      .bind(userId, ...likeBinds(3))
      .all<{ id: number; title: string; content: string; superseded_by_id: number | null; created_at: string }>();
    results.decisions = rows.map((r) => ({
      id: r.id,
      title: r.title || r.content.slice(0, 40),
      snippet: snippet(r.content, terms[0]),
      status: r.superseded_by_id ? "archived" : "active",
      created_at: r.created_at,
    }));
  }

  // AI会話ログ(作業AIの議論)
  {
    const cond = terms.map(() => "wm.content LIKE ? ESCAPE '\\'").join(" AND ");
    const { results: rows } = await db
      .prepare(
        `SELECT wm.run_id, wr.task, wm.name, wm.content, wm.created_at
           FROM os_worker_msgs wm JOIN os_worker_runs wr ON wr.id = wm.run_id
          WHERE wm.user_id = ? AND ${cond}
          ORDER BY wm.id DESC LIMIT 10`
      )
      .bind(userId, ...likeBinds(1))
      .all<{ run_id: number; task: string; name: string; content: string; created_at: string }>();
    results.ailogs = rows.map((r) => ({ run_id: r.run_id, task: r.task, name: r.name, snippet: snippet(r.content, terms[0]), created_at: r.created_at }));
  }

  return { terms, results };
}

// ── 監視官レポート + 通知 ─────────────────────────────────
export interface OsReport {
  id: number;
  chat_id: number | null;
  content: string;
  created_at: string;
}

export async function createReport(db: D1Database, userId: number, chatId: number | null, content: string): Promise<OsReport> {
  const row = await db
    .prepare(`INSERT INTO os_reports (user_id, chat_id, content) VALUES (?, ?, ?) RETURNING id, chat_id, content, created_at`)
    .bind(userId, chatId, content)
    .first<OsReport>();
  if (!row) throw new Error("レポート保存に失敗しました");
  return row;
}

export async function listReports(db: D1Database, userId: number, limit = 10): Promise<OsReport[]> {
  const { results } = await db
    .prepare(`SELECT id, chat_id, content, created_at FROM os_reports WHERE user_id = ? ORDER BY id DESC LIMIT ?`)
    .bind(userId, limit)
    .all<OsReport>();
  return results;
}

// チャット内の監視官警告の回数(節目レポート用)
export async function warningCounts(db: D1Database, userId: number, chatId: number): Promise<{ deviation: number; loop: number }> {
  const row = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN content LIKE '%[deviation]%' THEN 1 ELSE 0 END) AS deviation,
         SUM(CASE WHEN content LIKE '%[loop]%' THEN 1 ELSE 0 END) AS loop
       FROM os_messages WHERE user_id = ? AND chat_id = ? AND role = 'monitor'`
    )
    .bind(userId, chatId)
    .first<{ deviation: number | null; loop: number | null }>();
  return { deviation: row?.deviation ?? 0, loop: row?.loop ?? 0 };
}

// 通知フィード(実装準備設計書 第3-4章): 承認待ち・最近の監視官警告・最近のレポートを集約。
export interface Notifications {
  pending: OsCandidate[];
  warnings: { chat_id: number; content: string; created_at: string }[];
  reports: OsReport[];
}

export async function getNotifications(db: D1Database, userId: number): Promise<Notifications> {
  const pending = await listPendingCandidates(db, userId);
  const { results: warnings } = await db
    .prepare(
      `SELECT chat_id, content, created_at FROM os_messages
        WHERE user_id = ? AND role = 'monitor' ORDER BY id DESC LIMIT 10`
    )
    .bind(userId)
    .all<{ chat_id: number; content: string; created_at: string }>();
  return { pending, warnings, reports: await listReports(db, userId, 10) };
}

// ── エクスポート(バックアップ) ─────────────────────────────
// 📤の全体エクスポートに OS のデータも含める。os_api_keys(秘密情報)は絶対に含めない。
export async function exportOs(db: D1Database, userId: number) {
  const q = async <T>(sql: string) => (await db.prepare(sql).bind(userId).all<T>()).results;
  return {
    chats: await q(`SELECT id, title, project_id, created_at, updated_at FROM os_chats WHERE user_id = ? ORDER BY id`),
    messages: await q(
      `SELECT chat_id, role, name, content, seq, created_at FROM os_messages WHERE user_id = ? ORDER BY chat_id, seq, id`
    ),
    candidates: await q(
      `SELECT id, chat_id, kind, title, content, tags, project, summary, supersedes_id, status, memory_id, created_at, decided_at
         FROM os_candidates WHERE user_id = ? ORDER BY id`
    ),
    worker_runs: await q(`SELECT id, chat_id, task, status, summary, created_at, done_at FROM os_worker_runs WHERE user_id = ? ORDER BY id`),
    worker_msgs: await q(`SELECT run_id, role, name, content, seq, created_at FROM os_worker_msgs WHERE user_id = ? ORDER BY run_id, seq, id`),
    role_config: await q(`SELECT role, provider, model, updated_at FROM os_role_config WHERE user_id = ?`),
  };
}

// ── 役割別モデル設定 ──────────────────────────────────────
export const OS_ROLES = ["mentor", "monitor", "recorder", "worker"] as const;

// 全役割の現在のモデル設定(未設定は既定)を返す。設定画面用。
export async function listRoleModels(db: D1Database, userId: number): Promise<{ role: string; provider: Provider; model: string }[]> {
  const out: { role: string; provider: Provider; model: string }[] = [];
  for (const role of OS_ROLES) {
    const rm = await getRoleModel(db, userId, role);
    out.push({ role, provider: rm.provider, model: rm.model });
  }
  return out;
}

// 作業AI 1/2/3 の個別設定。explicit=false は「作業AI既定(worker)に従う」状態。設定画面用。
export async function listWorkerSlots(
  db: D1Database,
  userId: number
): Promise<{ role: string; provider: Provider; model: string; explicit: boolean }[]> {
  const out: { role: string; provider: Provider; model: string; explicit: boolean }[] = [];
  for (const n of [1, 2, 3]) {
    const role = `worker${n}`;
    const row = await db
      .prepare(`SELECT provider, model FROM os_role_config WHERE user_id = ? AND role = ?`)
      .bind(userId, role)
      .first<{ provider: string; model: string }>();
    const rm = await getWorkerRoleModel(db, userId, n);
    out.push({ role, provider: rm.provider, model: rm.model, explicit: !!(row && VALID_PROVIDERS.has(row.provider as Provider)) });
  }
  return out;
}

// ── APIキーの暗号化 (AES-GCM) ─────────────────────────────
// os_api_keys.key は平文で置かず封筒暗号化する。KEK(暗号鍵の素)は初回に自動生成して
// settings に保存する。KEK が同じDBにある以上「DB丸ごと流出」には効かないが、
// 部分的な流出(エクスポートの誤共有・画面共有中のテーブル閲覧など)からは守れる。
const ENC_PREFIX = "enc:v1:";

async function kekKey(db: D1Database): Promise<CryptoKey> {
  let material = await getSetting(db, "os_kek");
  if (!material) {
    material = genToken(); // 48桁hex
    await setSetting(db, "os_kek", material);
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function b64enc(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64dec(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function encryptApiKey(db: D1Database, plain: string): Promise<string> {
  const key = await kekKey(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return `${ENC_PREFIX}${b64enc(iv)}:${b64enc(ct)}`;
}

async function decryptApiKey(db: D1Database, stored: string): Promise<string> {
  if (!stored.startsWith(ENC_PREFIX)) return stored; // 旧形式(平文)はそのまま読める
  const [ivB64, ctB64] = stored.slice(ENC_PREFIX.length).split(":");
  const key = await kekKey(db);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64dec(ivB64) as unknown as BufferSource }, key, b64dec(ctB64) as unknown as BufferSource);
  return new TextDecoder().decode(pt);
}

// ── APIキー (os_api_keys) ─────────────────────────────────
// ⚙️ から登録するユーザー別キー。Cloudflare Secret(env) より優先する(ユーザーの明示的な意思のため)。
const KEY_ENV_NAME: Record<Provider, keyof LlmSecrets> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

export interface KeyInfo {
  set: boolean;
  source: "db" | "env" | null;
  tail: string; // 末尾4文字のみ(全文は絶対に返さない)
}

async function getUserApiKeys(db: D1Database, userId: number): Promise<Partial<Record<Provider, string>>> {
  const { results } = await db
    .prepare(`SELECT provider, key FROM os_api_keys WHERE user_id = ?`)
    .bind(userId)
    .all<{ provider: string; key: string }>();
  const out: Partial<Record<Provider, string>> = {};
  for (const r of results) {
    if (!VALID_PROVIDERS.has(r.provider as Provider) || !r.key) continue;
    try {
      const plain = await decryptApiKey(db, r.key);
      out[r.provider as Provider] = plain;
      // 旧形式(平文)の行は読んだついでに暗号化形式へ自動アップグレード
      if (!r.key.startsWith(ENC_PREFIX)) {
        const enc = await encryptApiKey(db, plain);
        await db
          .prepare(`UPDATE os_api_keys SET key = ? WHERE user_id = ? AND provider = ?`)
          .bind(enc, userId, r.provider)
          .run();
      }
    } catch {
      // 復号失敗(KEK消失など)。キーは使えないが、他の処理は止めない
    }
  }
  return out;
}

// env の Secret と DB のユーザーキーをマージした「実効シークレット」。DB が優先。
export async function effectiveSecrets(db: D1Database, userId: number, env: LlmSecrets): Promise<LlmSecrets> {
  const user = await getUserApiKeys(db, userId);
  return {
    ANTHROPIC_API_KEY: user.anthropic || env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: user.openai || env.OPENAI_API_KEY,
    GEMINI_API_KEY: user.gemini || env.GEMINI_API_KEY,
  };
}

// ⚙️ 表示用: どのプロバイダのキーがどこから来ているか(キー本文は末尾4文字だけ)。
export async function keyStatus(db: D1Database, userId: number, env: LlmSecrets): Promise<Record<Provider, KeyInfo>> {
  const user = await getUserApiKeys(db, userId);
  const out = {} as Record<Provider, KeyInfo>;
  for (const p of ["anthropic", "openai", "gemini"] as Provider[]) {
    const dbKey = user[p];
    const envKey = env[KEY_ENV_NAME[p]];
    const key = dbKey || envKey || "";
    out[p] = { set: !!key, source: dbKey ? "db" : envKey ? "env" : null, tail: key ? key.slice(-4) : "" };
  }
  return out;
}

export async function setUserApiKey(db: D1Database, userId: number, provider: string, key: unknown): Promise<boolean> {
  if (!VALID_PROVIDERS.has(provider as Provider)) return false;
  const k = (typeof key === "string" ? key : "").trim();
  // ゴミ入力(空・改行入り・短すぎ・長すぎ)は拒否
  if (!k || /\s/.test(k) || k.length < 10 || k.length > 300) return false;
  const enc = await encryptApiKey(db, k);
  await db
    .prepare(
      `INSERT INTO os_api_keys (user_id, provider, key) VALUES (?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET key = excluded.key, updated_at = datetime('now')`
    )
    .bind(userId, provider, enc)
    .run();
  return true;
}

// ── 役割別APIキー (os_role_keys) ──────────────────────────
// 役割ごとの上書きキー。空の役割は共有キー(os_api_keys, プロバイダ別)へ落ちる。
// 同じ会社でも役割ごとに別キーを持てる = 無料枠の隔離(監視官がメンターの枠を食い潰さない)。
async function getRoleKey(db: D1Database, userId: number, role: string): Promise<string | undefined> {
  const row = await db
    .prepare(`SELECT key FROM os_role_keys WHERE user_id = ? AND role = ?`)
    .bind(userId, role)
    .first<{ key: string }>();
  if (!row?.key) return undefined;
  try {
    return await decryptApiKey(db, row.key);
  } catch {
    return undefined; // 復号失敗(KEK消失など)。共有キーへ落ちる
  }
}

export async function setRoleKey(db: D1Database, userId: number, role: string, key: unknown): Promise<boolean> {
  if (!VALID_ROLES.has(role)) return false;
  const k = (typeof key === "string" ? key : "").trim();
  if (!k || /\s/.test(k) || k.length < 10 || k.length > 300) return false;
  const enc = await encryptApiKey(db, k);
  await db
    .prepare(
      `INSERT INTO os_role_keys (user_id, role, key) VALUES (?, ?, ?)
       ON CONFLICT(user_id, role) DO UPDATE SET key = excluded.key, updated_at = datetime('now')`
    )
    .bind(userId, role, enc)
    .run();
  return true;
}

export async function deleteRoleKey(db: D1Database, userId: number, role: string): Promise<void> {
  await db.prepare(`DELETE FROM os_role_keys WHERE user_id = ? AND role = ?`).bind(userId, role).run();
}

// 役割ごとに、どの役割が自前キーを持っているか(末尾4文字のみ)。⚙️表示用。
export async function roleKeyStatus(db: D1Database, userId: number): Promise<Record<string, { set: boolean; tail: string }>> {
  const { results } = await db
    .prepare(`SELECT role, key FROM os_role_keys WHERE user_id = ?`)
    .bind(userId)
    .all<{ role: string; key: string }>();
  const out: Record<string, { set: boolean; tail: string }> = {};
  for (const r of results) {
    let tail = "";
    try {
      tail = (await decryptApiKey(db, r.key)).slice(-4);
    } catch {
      /* 復号不可でも set は true(存在はする) */
    }
    out[r.role] = { set: true, tail };
  }
  return out;
}

// 役割の呼び出しに使う {モデル, キー}。キーは 役割別キー → 共有プロバイダキー(env含む) の順で解決する。
// callLLM は secrets から rm.provider のキーだけ読むので、その1枠だけ埋めて返す。
export async function resolveRoleCall(
  db: D1Database,
  userId: number,
  role: string,
  rm: RoleModel,
  base: LlmSecrets
): Promise<{ rm: RoleModel; secrets: LlmSecrets }> {
  const override = await getRoleKey(db, userId, role);
  const secrets: LlmSecrets = {};
  secrets[KEY_ENV_NAME[rm.provider]] = override || keyFor(rm.provider, base);
  return { rm, secrets };
}

// 作業AI n(1..3)の {モデル, キー}。キーは workerN → worker(既定) → 共有キー の順。
export async function resolveWorkerCall(
  db: D1Database,
  userId: number,
  n: number,
  base: LlmSecrets
): Promise<{ rm: RoleModel; secrets: LlmSecrets }> {
  const rm = await getWorkerRoleModel(db, userId, n);
  const override = (await getRoleKey(db, userId, `worker${n}`)) || (await getRoleKey(db, userId, "worker"));
  const secrets: LlmSecrets = {};
  secrets[KEY_ENV_NAME[rm.provider]] = override || keyFor(rm.provider, base);
  return { rm, secrets };
}

// ── ファイル/写真 (os_files) ──────────────────────────────
// R2 を使わず D1 に base64 で保存する軽量版(カード不要・完全無料)。
// 大きいファイル/動画は非対応。写真はブラウザ側で縮小してから送る前提。
// D1 の行サイズを抑えるため、保存するbase64は約700KB(=元データ約525KB)まで。
export const MAX_FILE_B64 = 700_000;

export interface OsFileMeta {
  id: number;
  chat_id: number | null;
  project: string;
  name: string;
  mime: string;
  size: number;
  created_at: string;
}

// data(base64)は保存するが、メタデータの一覧では返さない(レスポンスを軽く保つ)。
export async function createFile(
  db: D1Database,
  userId: number,
  f: { chat_id?: number | null; project?: string; name: string; mime: string; dataB64: string }
): Promise<OsFileMeta | null> {
  const dataB64 = (f.dataB64 || "").replace(/^data:[^,]*,/, ""); // data: プレフィックスが付いていても剥がす
  if (!dataB64 || dataB64.length > MAX_FILE_B64) return null;
  const name = (f.name || "file").trim().slice(0, 200) || "file";
  const mime = (f.mime || "application/octet-stream").trim().slice(0, 120);
  const size = Math.floor((dataB64.length * 3) / 4); // base64 → 元バイト数の概算
  const row = await db
    .prepare(
      `INSERT INTO os_files (user_id, chat_id, project, name, mime, size, data)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id, chat_id, project, name, mime, size, created_at`
    )
    .bind(userId, f.chat_id ?? null, (f.project || "").slice(0, 200), name, mime, size, dataB64)
    .first<OsFileMeta>();
  return row ?? null;
}

export async function listFiles(
  db: D1Database,
  userId: number,
  opt?: { project?: string; chatId?: number }
): Promise<OsFileMeta[]> {
  let sql = `SELECT id, chat_id, project, name, mime, size, created_at FROM os_files WHERE user_id = ?`;
  const binds: unknown[] = [userId];
  if (opt?.chatId) {
    sql += ` AND chat_id = ?`;
    binds.push(opt.chatId);
  } else if (opt?.project) {
    sql += ` AND project = ?`;
    binds.push(opt.project);
  }
  sql += ` ORDER BY id DESC LIMIT 500`;
  const { results } = await db.prepare(sql).bind(...binds).all<OsFileMeta>();
  return results;
}

// ダウンロード/表示用に本体(base64 + mime + name)を返す。user_id スコープで所有チェック。
export async function getFileData(
  db: D1Database,
  userId: number,
  id: number
): Promise<{ name: string; mime: string; dataB64: string } | null> {
  const row = await db
    .prepare(`SELECT name, mime, data FROM os_files WHERE user_id = ? AND id = ?`)
    .bind(userId, id)
    .first<{ name: string; mime: string; data: string }>();
  return row ? { name: row.name, mime: row.mime, dataB64: row.data } : null;
}

export async function deleteFile(db: D1Database, userId: number, id: number): Promise<boolean> {
  const r = await db.prepare(`DELETE FROM os_files WHERE user_id = ? AND id = ?`).bind(userId, id).run();
  return (r.meta.changes ?? 0) > 0;
}

// ── LLM 呼び出しの1日上限(コスト暴走・トークン漏洩時の焼き尽くし対策) ──
export const DAILY_LLM_LIMIT = 500;

// n 回ぶんの予算を原子的に消費する。上限を超える場合は消費せずエラー。
export async function consumeLlmBudget(db: D1Database, userId: number, n: number): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  await db
    .prepare(`INSERT INTO os_llm_usage (user_id, day, calls) VALUES (?, ?, 0) ON CONFLICT(user_id, day) DO NOTHING`)
    .bind(userId, day)
    .run();
  const r = await db
    .prepare(`UPDATE os_llm_usage SET calls = calls + ? WHERE user_id = ? AND day = ? AND calls + ? <= ?`)
    .bind(n, userId, day, n, DAILY_LLM_LIMIT)
    .run();
  if ((r.meta.changes ?? 0) === 0)
    throw new Error(`本日のAI呼び出し上限(${DAILY_LLM_LIMIT}回/日)に達しました。明日リセットされます`);
}

export async function deleteUserApiKey(db: D1Database, userId: number, provider: string): Promise<boolean> {
  const r = await db.prepare(`DELETE FROM os_api_keys WHERE user_id = ? AND provider = ?`).bind(userId, provider).run();
  return (r.meta.changes ?? 0) > 0;
}

// ── 作業AI (os_worker_runs / os_worker_msgs) ──────────────
export interface WorkerRun {
  id: number;
  chat_id: number | null;
  task: string;
  status: string;
  summary: string;
  created_at: string;
  done_at: string | null;
}
export interface WorkerMsg {
  id: number;
  role: string;
  name: string;
  content: string;
  seq: number;
  created_at: string;
}

export async function createWorkerRun(db: D1Database, userId: number, chatId: number, task: string): Promise<WorkerRun> {
  const row = await db
    .prepare(`INSERT INTO os_worker_runs (user_id, chat_id, task) VALUES (?, ?, ?) RETURNING id, chat_id, task, status, summary, created_at, done_at`)
    .bind(userId, chatId, task)
    .first<WorkerRun>();
  if (!row) throw new Error("作業AI run の作成に失敗しました");
  return row;
}

export async function addWorkerMsg(db: D1Database, userId: number, runId: number, seq: number, role: string, name: string, content: string): Promise<void> {
  await db
    .prepare(`INSERT INTO os_worker_msgs (run_id, user_id, role, name, content, seq) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(runId, userId, role, name, content, seq)
    .run();
}

export async function finishWorkerRun(db: D1Database, userId: number, runId: number, summary: string, status = "done"): Promise<void> {
  await db
    .prepare(`UPDATE os_worker_runs SET status = ?, summary = ?, done_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .bind(status, summary, runId, userId)
    .run();
}

export async function listWorkerRuns(db: D1Database, userId: number, chatId?: number): Promise<WorkerRun[]> {
  const sql = `SELECT id, chat_id, task, status, summary, created_at, done_at FROM os_worker_runs WHERE user_id = ?${chatId ? " AND chat_id = ?" : ""} ORDER BY id DESC LIMIT 100`;
  const stmt = chatId ? db.prepare(sql).bind(userId, chatId) : db.prepare(sql).bind(userId);
  const { results } = await stmt.all<WorkerRun>();
  return results;
}

export async function getWorkerRun(db: D1Database, userId: number, id: number): Promise<WorkerRun | null> {
  return db.prepare(`SELECT id, chat_id, task, status, summary, created_at, done_at FROM os_worker_runs WHERE id = ? AND user_id = ?`).bind(id, userId).first<WorkerRun>();
}

export async function getWorkerLog(db: D1Database, userId: number, runId: number): Promise<WorkerMsg[]> {
  const { results } = await db
    .prepare(`SELECT id, role, name, content, seq, created_at FROM os_worker_msgs WHERE run_id = ? AND user_id = ? ORDER BY seq ASC, id ASC`)
    .bind(runId, userId)
    .all<WorkerMsg>();
  return results;
}
