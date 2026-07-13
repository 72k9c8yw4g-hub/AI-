-- Dscribe schema (マルチアカウント: 全データは user_id で完全分離)

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  token      TEXT UNIQUE,              -- 個人アクセストークン(48桁hex)。URLに埋め込む
  is_owner   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

CREATE TABLE IF NOT EXISTS memories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  kind       TEXT NOT NULL DEFAULT 'memory', -- memory | decision | note
  title      TEXT NOT NULL DEFAULT '',
  content    TEXT NOT NULL,
  tags       TEXT NOT NULL DEFAULT '',
  source     TEXT NOT NULL DEFAULT 'chat',   -- chat | import | manual
  project_id INTEGER REFERENCES projects(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'open',   -- open | doing | done
  priority     TEXT NOT NULL DEFAULT 'normal', -- high | normal | low
  due_date     TEXT,
  project_id   INTEGER REFERENCES projects(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- claude.ai のエクスポート (conversations.json) を取り込んだもの
CREATE TABLE IF NOT EXISTS conversations (
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
);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  sender          TEXT NOT NULL,  -- human | assistant
  text            TEXT NOT NULL,
  created_at      TEXT,
  seq             INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
