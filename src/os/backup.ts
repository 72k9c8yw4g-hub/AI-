// 自動バックアップ (実装準備設計書 第17-18章)
// 週1回の Cron + ⚙️ からの手動実行で、全ユーザーの全データを JSON にして R2 に保存する。
// R2 バケット(binding: BACKUP)が未設定でも壊れない — 「未設定」ステータスを記録して案内する。
// 含めないもの: ユーザートークン・APIキー(os_api_keys)・settings(招待コード/暗号KEK)。

import { getSetting, setSetting, listUsers, listTasks, listMemories, listProjects, exportConversations } from "../db";
import { exportOs } from "./db";

const KEEP_GENERATIONS = 8; // 世代ローテーション(週1なら約2ヶ月ぶん)

export interface BackupStatus {
  at: string;
  ok: boolean;
  location: string; // 保存先キー or "-"
  bytes: number;
  users: number;
  error: string | null;
}

// 全ユーザーぶんの完全ダンプを作る(秘密情報は含めない)
export async function buildBackup(db: D1Database): Promise<{ json: string; users: number }> {
  const users = await listUsers(db);
  const dump: Record<string, unknown>[] = [];
  for (const u of users) {
    const [tasks, memories, projects, conversations, os] = await Promise.all([
      listTasks(db, u.id, { status: "all", limit: 5000 }),
      listMemories(db, u.id, { limit: 5000 }),
      listProjects(db, u.id),
      exportConversations(db, u.id),
      exportOs(db, u.id),
    ]);
    dump.push({ email: u.email, is_owner: !!u.is_owner, projects, memories, tasks, conversations, os });
  }
  const json = JSON.stringify({ backup_at: new Date().toISOString(), version: 1, users: dump });
  return { json, users: users.length };
}

// バックアップを実行して結果を settings(backup:last) に記録する。
export async function runBackup(db: D1Database, bucket: R2Bucket | undefined): Promise<BackupStatus> {
  const at = new Date().toISOString();
  let status: BackupStatus;
  if (!bucket) {
    status = {
      at,
      ok: false,
      location: "-",
      bytes: 0,
      users: 0,
      error: "R2未設定(wrangler.toml の BACKUP バケットを有効化すると自動保存されます)",
    };
  } else {
    try {
      const { json, users } = await buildBackup(db);
      const key = `backup/${at.replace(/[:.]/g, "-")}.json`;
      await bucket.put(key, json, { httpMetadata: { contentType: "application/json" } });
      // 世代ローテーション: 新しい順に KEEP_GENERATIONS 件残して削除
      const listed = await bucket.list({ prefix: "backup/", limit: 500 });
      const keys = listed.objects.map((o) => o.key).sort().reverse();
      for (const old of keys.slice(KEEP_GENERATIONS)) await bucket.delete(old);
      status = { at, ok: true, location: key, bytes: json.length, users, error: null };
    } catch (e) {
      status = { at, ok: false, location: "-", bytes: 0, users: 0, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
    }
  }
  await setSetting(db, "backup:last", JSON.stringify(status));
  return status;
}

export async function lastBackupStatus(db: D1Database): Promise<BackupStatus | null> {
  const raw = await getSetting(db, "backup:last");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BackupStatus;
  } catch {
    return null;
  }
}

// ── パージ (技術設計書 第11章) ────────────────────────────
// 50日以上更新のないチャットの AI会話ログ(作業AIの議論)をパージする。
// 決定事項(memories)・チャット本体・保存候補は絶対に削除しない。
export async function purgeOldAiLogs(db: D1Database, days = 50): Promise<number> {
  const cutoff = `-${days} days`;
  // 対象: 更新が古いチャットに紐づく worker_runs
  const { results: runs } = await db
    .prepare(
      `SELECT r.id FROM os_worker_runs r JOIN os_chats c ON c.id = r.chat_id
        WHERE c.updated_at < datetime('now', ?)`
    )
    .bind(cutoff)
    .all<{ id: number }>();
  let purged = 0;
  for (const r of runs) {
    await db.prepare(`DELETE FROM os_worker_msgs WHERE run_id = ?`).bind(r.id).run();
    await db.prepare(`DELETE FROM os_worker_runs WHERE id = ?`).bind(r.id).run();
    purged++;
  }
  return purged;
}

// ── 復元 (実装準備設計書 第19章) ──────────────────────────
// バックアップJSONから、このユーザーの OS チャットを「追記」で復元する。
// 安全側に振る: 既存データを上書き・削除しない(常に新規チャットとして作る)。
// 決定・記憶は supersedes チェーンの整合が難しいためこの版では対象外(チャットのみ)。
export interface RestorePreview {
  found: boolean;
  email: string;
  chats: number;
  messages: number;
}

interface BackupUser {
  email?: string;
  os?: {
    chats?: Array<{ id: number; title: string }>;
    messages?: Array<{ chat_id: number; role: string; name: string; content: string; seq: number }>;
  };
}

function pickUser(backup: unknown, email: string): BackupUser | null {
  const users = (backup as { users?: BackupUser[] })?.users;
  if (!Array.isArray(users)) return null;
  return users.find((u) => u.email === email) ?? (users.length === 1 ? users[0] : null);
}

export function previewRestore(backup: unknown, email: string): RestorePreview {
  const u = pickUser(backup, email);
  if (!u || !u.os) return { found: false, email, chats: 0, messages: 0 };
  return { found: true, email: u.email ?? email, chats: u.os.chats?.length ?? 0, messages: u.os.messages?.length ?? 0 };
}

export async function restoreOsChats(db: D1Database, userId: number, email: string, backup: unknown): Promise<{ chats: number; messages: number }> {
  const u = pickUser(backup, email);
  if (!u || !u.os || !u.os.chats) return { chats: 0, messages: 0 };
  const msgsByChat = new Map<number, NonNullable<BackupUser["os"]>["messages"]>();
  for (const m of u.os.messages ?? []) {
    const arr = msgsByChat.get(m.chat_id) ?? [];
    arr!.push(m);
    msgsByChat.set(m.chat_id, arr);
  }
  let chats = 0;
  let messages = 0;
  for (const c of u.os.chats) {
    const row = await db
      .prepare(`INSERT INTO os_chats (user_id, title) VALUES (?, ?) RETURNING id`)
      .bind(userId, `[復元] ${(c.title || "会話").slice(0, 110)}`)
      .first<{ id: number }>();
    if (!row) continue;
    chats++;
    const msgs = (msgsByChat.get(c.id) ?? []).sort((a, b) => a.seq - b.seq);
    for (const m of msgs) {
      await db
        .prepare(`INSERT INTO os_messages (chat_id, user_id, role, name, content, seq) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(row.id, userId, m.role, m.name ?? "", (m.content ?? "").slice(0, 8000), m.seq ?? 0)
        .run();
      messages++;
    }
  }
  return { chats, messages };
}
