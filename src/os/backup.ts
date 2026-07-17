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
