import Database from "better-sqlite3";
import { join } from "path";
import { homedir } from "os";

const DB_PATH = join(homedir(), ".claude", "session-logger", "data.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const instance = new Database(DB_PATH, { readonly: true });
  instance.pragma("journal_mode = WAL");
  instance.pragma("busy_timeout = 3000");
  db = instance;
  return db;
}
