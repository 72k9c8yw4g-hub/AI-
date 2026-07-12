-- Dscribe schema
CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS memories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL DEFAULT 'memory', -- memory | decision | note
  title      TEXT NOT NULL DEFAULT '',
  content    TEXT NOT NULL,
  tags       TEXT NOT NULL DEFAULT '',
  source     TEXT NOT NULL DEFAULT 'chat',   -- chat | import | manual
  project_id INTEGER REFERENCES projects(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_kind ON memories(kind);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
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
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);

-- claude.ai のエクスポート (conversations.json) を取り込んだもの
CREATE TABLE IF NOT EXISTS conversations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL DEFAULT '',
  project_name TEXT NOT NULL DEFAULT '',
  summary      TEXT NOT NULL DEFAULT '',
  created_at   TEXT,
  updated_at   TEXT,
  imported_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  sender          TEXT NOT NULL,  -- human | assistant
  text            TEXT NOT NULL,
  created_at      TEXT,
  seq             INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
