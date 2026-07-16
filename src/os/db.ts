// AI意思決定OS — データアクセス (チャット / メッセージ / 役割モデル設定)。
// すべて user_id スコープ。既存 Dscribe の分離方針(ユーザーごとに完全独立)を踏襲する。

import { DEFAULT_MODELS, type Provider, type RoleModel } from "./provider";

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
