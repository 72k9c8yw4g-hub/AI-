// AI意思決定OS — データアクセス (チャット / メッセージ / 役割モデル設定)。
// すべて user_id スコープ。既存 Dscribe の分離方針(ユーザーごとに完全独立)を踏襲する。

import { DEFAULT_MODELS, type Provider, type RoleModel } from "./provider";
import { saveMemory, listMemories, type MemoryRow } from "../db";

export interface OsChat {
  id: number;
  title: string;
  project_id: number | null;
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

// チャット一覧 (更新が新しい順)。メッセージ件数つき。
export async function listChats(db: D1Database, userId: number): Promise<OsChat[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.title, c.project_id, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM os_messages m WHERE m.chat_id = c.id) AS message_count
         FROM os_chats c
        WHERE c.user_id = ?
        ORDER BY c.updated_at DESC, c.id DESC`
    )
    .bind(userId)
    .all<OsChat>();
  return results;
}

export async function getChat(db: D1Database, userId: number, id: number): Promise<OsChat | null> {
  return db
    .prepare(`SELECT id, title, project_id, created_at, updated_at FROM os_chats WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<OsChat>();
}

export async function createChat(db: D1Database, userId: number, title?: unknown): Promise<OsChat> {
  const t = (typeof title === "string" ? title : "").trim().slice(0, 120) || "新しい会話";
  const row = await db
    .prepare(`INSERT INTO os_chats (user_id, title) VALUES (?, ?) RETURNING id, title, project_id, created_at, updated_at`)
    .bind(userId, t)
    .first<OsChat>();
  if (!row) throw new Error("チャット作成に失敗しました");
  return row;
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

// メッセージ追加。seq はチャット内連番。チャットの updated_at も進める。
export async function addMessage(
  db: D1Database,
  userId: number,
  chatId: number,
  role: string,
  content: string,
  name = ""
): Promise<OsMessage> {
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

const VALID_ROLES = new Set(["mentor", "monitor", "recorder", "worker"]);
const VALID_PROVIDERS = new Set<Provider>(["anthropic", "openai", "gemini"]);

// 役割の使用モデルを取得。未設定なら既定(anthropic + 役割別既定モデル)。
export async function getRoleModel(db: D1Database, userId: number, role: string): Promise<RoleModel> {
  const row = await db
    .prepare(`SELECT provider, model FROM os_role_config WHERE user_id = ? AND role = ?`)
    .bind(userId, role)
    .first<{ provider: string; model: string }>();
  const provider = (row && VALID_PROVIDERS.has(row.provider as Provider) ? row.provider : "anthropic") as Provider;
  return { provider, model: row?.model || DEFAULT_MODELS[provider] };
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
export async function approveCandidate(
  db: D1Database,
  userId: number,
  id: number
): Promise<{ ok: boolean; memory?: MemoryRow; error?: string }> {
  const c = await getCandidate(db, userId, id);
  if (!c) return { ok: false, error: "保存候補が見つかりません" };
  if (c.status !== "pending") return { ok: false, error: `この候補は既に処理済みです (${c.status})` };
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
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  await db
    .prepare(`UPDATE os_candidates SET status = 'approved', memory_id = ?, decided_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .bind(memory.id, id, userId)
    .run();
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
