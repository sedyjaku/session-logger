import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { DB_DIR, DB_PATH } from "./config.js";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  mkdirSync(DB_DIR, { recursive: true });
  const instance = new Database(DB_PATH);
  try {
    instance.pragma("journal_mode = WAL");
    instance.pragma("busy_timeout = 3000");
    createSchema(instance);
    runMigrations(instance);
  } catch (err) {
    try {
      instance.close();
    } catch {}
    throw err;
  }
  db = instance;
  return db;
}

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      transcript_path TEXT,
      project_path TEXT NOT NULL,
      model TEXT,
      source TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_seconds INTEGER,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      estimated_cost_usd REAL DEFAULT 0,
      end_reason TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_project_path ON sessions(project_path);

    CREATE TABLE IF NOT EXISTS labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_labels (
      session_id TEXT NOT NULL REFERENCES sessions(session_id),
      label_id INTEGER NOT NULL REFERENCES labels(id),
      PRIMARY KEY (session_id, label_id)
    );

    CREATE TABLE IF NOT EXISTS session_models (
      session_id TEXT NOT NULL REFERENCES sessions(session_id),
      model TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      PRIMARY KEY (session_id, model)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(session_id),
      message_id TEXT UNIQUE NOT NULL,
      request_id TEXT,
      model TEXT,
      timestamp TEXT NOT NULL,
      stop_reason TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      thinking_tokens INTEGER DEFAULT 0,
      has_tool_use INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_model ON messages(model);

    CREATE TABLE IF NOT EXISTS tool_uses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(session_id),
      message_id TEXT NOT NULL REFERENCES messages(message_id),
      tool_use_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      input_json TEXT,
      duration_ms INTEGER,
      total_tokens INTEGER,
      status TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tool_uses_session_id ON tool_uses(session_id);
    CREATE INDEX IF NOT EXISTS idx_tool_uses_message_id ON tool_uses(message_id);
    CREATE INDEX IF NOT EXISTS idx_tool_uses_tool_name ON tool_uses(tool_name);

    CREATE TABLE IF NOT EXISTS session_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(session_id),
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      stop_reason TEXT,
      duration_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_session_events_session_id ON session_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_session_events_type ON session_events(type);
    CREATE INDEX IF NOT EXISTS idx_session_events_timestamp ON session_events(timestamp);

    CREATE TABLE IF NOT EXISTS jira_syncs (
      ticket_id TEXT PRIMARY KEY,
      comment_id TEXT,
      last_synced_at TEXT NOT NULL,
      total_cost_usd REAL DEFAULT 0,
      session_count INTEGER DEFAULT 0
    );
  `);
}

function runMigrations(db: Database.Database): void {
  const alters = [
    "ALTER TABLE sessions ADD COLUMN git_branch TEXT",
    "ALTER TABLE sessions ADD COLUMN claude_version TEXT",
    "ALTER TABLE sessions ADD COLUMN message_count INTEGER DEFAULT 0",
    "ALTER TABLE sessions ADD COLUMN tool_use_count INTEGER DEFAULT 0",
    "ALTER TABLE sessions ADD COLUMN thinking_tokens INTEGER DEFAULT 0",
  ];
  for (const sql of alters) {
    try { db.exec(sql); } catch {}
  }
}

export function closeDb(): void {
  if (db) {
    try {
      db.close();
    } catch {}
    db = null;
  }
}
