// スキーマ定義と自動初期化
// wrangler の CLI が使えない環境(スマホのブラウザだけで導入する場合など)でも
// 動くように、最初のリクエスト時にテーブルを自動作成する。すべて冪等。

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT NOT NULL UNIQUE,
    token      TEXT UNIQUE,
    is_owner   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, name)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id)`,
  `CREATE TABLE IF NOT EXISTS memories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    kind       TEXT NOT NULL DEFAULT 'memory',
    title      TEXT NOT NULL DEFAULT '',
    content    TEXT NOT NULL,
    tags       TEXT NOT NULL DEFAULT '',
    source     TEXT NOT NULL DEFAULT 'chat',
    project_id INTEGER REFERENCES projects(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_kind ON memories(kind)`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    title        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'open',
    priority     TEXT NOT NULL DEFAULT 'normal',
    due_date     TEXT,
    project_id   INTEGER REFERENCES projects(id),
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    uuid         TEXT NOT NULL,
    name         TEXT NOT NULL DEFAULT '',
    project_name TEXT NOT NULL DEFAULT '',
    summary      TEXT NOT NULL DEFAULT '',
    created_at   TEXT,
    updated_at   TEXT,
    imported_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, uuid)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    sender          TEXT NOT NULL,
    text            TEXT NOT NULL,
    created_at      TEXT,
    seq             INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id)`,
];

let schemaReady = false;

export async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaReady) return;
  try {
    await db.prepare("SELECT id FROM users LIMIT 1").first();
    schemaReady = true;
    return;
  } catch {
    // テーブル未作成 → 初期化
  }
  for (const sql of STATEMENTS) {
    await db.prepare(sql).run();
  }
  schemaReady = true;
}
