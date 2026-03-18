import { getDb } from "../db.js";
import type { Label, LabelStats, SessionSummary } from "../types.js";
import { buildSessionFilter } from "./session.service.js";

export function addLabel(sessionId: string, labelName: string): void {
  const db = getDb();

  db.prepare(
    "INSERT OR IGNORE INTO labels (name, created_at) VALUES (?, ?)"
  ).run(labelName, new Date().toISOString());

  const label = db
    .prepare("SELECT id FROM labels WHERE name = ?")
    .get(labelName) as { id: number };

  db.prepare(
    "INSERT OR IGNORE INTO session_labels (session_id, label_id) VALUES (?, ?)"
  ).run(sessionId, label.id);
}

export function removeLabel(sessionId: string, labelName: string): boolean {
  const db = getDb();
  const label = db
    .prepare("SELECT id FROM labels WHERE name = ?")
    .get(labelName) as { id: number } | undefined;

  if (!label) return false;

  const result = db
    .prepare("DELETE FROM session_labels WHERE session_id = ? AND label_id = ?")
    .run(sessionId, label.id);

  return result.changes > 0;
}

export function getLabelsForSession(sessionId: string): Label[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT l.* FROM labels l
       JOIN session_labels sl ON l.id = sl.label_id
       WHERE sl.session_id = ?`
    )
    .all(sessionId) as Label[];
}

export function listAllLabels(): LabelStats[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT
        l.name,
        COUNT(DISTINCT sl.session_id) as session_count,
        COALESCE(SUM(s.input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(s.output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(s.cache_creation_tokens), 0) as total_cache_creation_tokens,
        COALESCE(SUM(s.cache_read_tokens), 0) as total_cache_read_tokens,
        COALESCE(SUM(s.estimated_cost_usd), 0) as total_cost
       FROM labels l
       LEFT JOIN session_labels sl ON l.id = sl.label_id
       LEFT JOIN sessions s ON sl.session_id = s.session_id
       GROUP BY l.id, l.name
       ORDER BY l.name`
    )
    .all() as LabelStats[];
}

export function getSummary(options: {
  label?: string;
  days?: number;
}): SessionSummary {
  const db = getDb();
  const { where, params } = buildSessionFilter(options);

  return db
    .prepare(
      `SELECT
        COUNT(*) as sessions,
        COALESCE(SUM(s.input_tokens), 0) as input_tokens,
        COALESCE(SUM(s.output_tokens), 0) as output_tokens,
        COALESCE(SUM(s.cache_creation_tokens), 0) as cache_creation_tokens,
        COALESCE(SUM(s.cache_read_tokens), 0) as cache_read_tokens,
        COALESCE(SUM(s.estimated_cost_usd), 0) as total_cost
       FROM sessions s ${where}`
    )
    .get(...params) as SessionSummary;
}
