// AI意思決定OS — 追加スキーマ
// 既存 Dscribe と同じ D1 に同居する。すべて冪等 (CREATE TABLE IF NOT EXISTS) なので
// 新規DBでも稼働中の本番DBでも、初回リクエスト時に自動適用される。
// 憲法・運用設計書に基づく最小構成 (Phase 1: チャット + メンター)。

// os_chats … プロジェクト配下の会話スレッド (実装準備設計書 第10章: プロジェクト→チャット群)
// os_messages … 1メッセージ = 1行。role は発言者 (user / mentor / monitor / recorder / worker / system)
// os_role_config … 役割ごとの使用モデル (技術設計書 第4-5章: 役割別モデル / APIキーマッピング)
const OS_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS os_chats (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    project_id  INTEGER REFERENCES projects(id),
    title       TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_os_chats_user ON os_chats(user_id)`,
  `CREATE TABLE IF NOT EXISTS os_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id     INTEGER NOT NULL REFERENCES os_chats(id),
    user_id     INTEGER NOT NULL REFERENCES users(id),
    role        TEXT NOT NULL DEFAULT 'user',
    name        TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    seq         INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_os_messages_chat ON os_messages(chat_id)`,
  `CREATE TABLE IF NOT EXISTS os_role_config (
    user_id     INTEGER NOT NULL REFERENCES users(id),
    role        TEXT NOT NULL,
    provider    TEXT NOT NULL DEFAULT 'anthropic',
    model       TEXT NOT NULL DEFAULT '',
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, role)
  )`,
  // os_candidates … 記録官が生成した「保存候補」。運用第8章: 無承認保存禁止 → 承認されるまでここに留まる。
  // status: pending(承認待ち) / approved(承認→決定事項に保存済み) / rejected(却下)
  // memory_id: 承認時に作られた決定(memories)のID。chat_id と併せて「元チャット追跡」に使う。
  `CREATE TABLE IF NOT EXISTS os_candidates (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    chat_id       INTEGER REFERENCES os_chats(id),
    kind          TEXT NOT NULL DEFAULT 'decision',
    title         TEXT NOT NULL DEFAULT '',
    content       TEXT NOT NULL DEFAULT '',
    tags          TEXT NOT NULL DEFAULT '',
    project       TEXT NOT NULL DEFAULT '',
    summary       TEXT NOT NULL DEFAULT '',
    supersedes_id INTEGER,
    status        TEXT NOT NULL DEFAULT 'pending',
    memory_id     INTEGER,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    decided_at    TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_os_candidates_user ON os_candidates(user_id, status)`,
  // os_worker_runs … 作業AIへの1アサイン(run)。成果物はメンターが整理して summary に。
  // status: running / done / failed
  `CREATE TABLE IF NOT EXISTS os_worker_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    chat_id     INTEGER REFERENCES os_chats(id),
    task        TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'running',
    summary     TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    done_at     TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_os_worker_runs_user ON os_worker_runs(user_id)`,
  // os_worker_msgs … AI会話ログ(作業AI同士の議論)。閲覧専用。実装準備第9章 AI会話画面。
  `CREATE TABLE IF NOT EXISTS os_worker_msgs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      INTEGER NOT NULL REFERENCES os_worker_runs(id),
    user_id     INTEGER NOT NULL REFERENCES users(id),
    role        TEXT NOT NULL DEFAULT 'worker',
    name        TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL,
    seq         INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_os_worker_msgs_run ON os_worker_msgs(run_id)`,
  // os_api_keys … ユーザーが ⚙️ から登録する LLM APIキー。Cloudflare Secret を触れない人向け。
  // ユーザー単位で分離(このユーザーのトークンを知る人だけが使える = 他データと同じ信頼レベル)。
  `CREATE TABLE IF NOT EXISTS os_api_keys (
    user_id    INTEGER NOT NULL REFERENCES users(id),
    provider   TEXT NOT NULL,
    key        TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, provider)
  )`,
  // os_llm_usage … 1日あたりのLLM呼び出し回数(コスト暴走・トークン漏洩時の焼き尽くし対策)
  `CREATE TABLE IF NOT EXISTS os_llm_usage (
    user_id INTEGER NOT NULL REFERENCES users(id),
    day     TEXT NOT NULL,
    calls   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  )`,
];

let osSchemaReady = false;

// 既存DB・新規DBの双方で OS テーブルを保証する。IF NOT EXISTS なので毎回呼んでも安全。
export async function ensureOsSchema(db: D1Database): Promise<void> {
  if (osSchemaReady) return;
  for (const sql of OS_STATEMENTS) {
    await db.prepare(sql).run();
  }
  osSchemaReady = true;
}
