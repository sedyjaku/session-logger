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
  `);
}

export function closeDb(): void {
  if (db) {
    try {
      db.close();
    } catch {}
    db = null;
  }
}
