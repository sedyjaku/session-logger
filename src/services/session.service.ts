import { getDb } from "../db.js";
import type { Session } from "../types.js";
import { parseTranscript, getPrimaryModel, sumTokens } from "./transcript.service.js";
import { calculateCost } from "./cost.service.js";

export function createSession(
  sessionId: string,
  transcriptPath: string,
  projectPath: string,
  model: string,
  source: string
): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO sessions (session_id, transcript_path, project_path, model, source, started_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(sessionId, transcriptPath, projectPath, model, source, new Date().toISOString());
}

export function endSession(
  sessionId: string,
  transcriptPath: string,
  reason: string
): void {
  const db = getDb();
  const session = db
    .prepare("SELECT * FROM sessions WHERE session_id = ?")
    .get(sessionId) as Session | undefined;

  const tokensByModel = parseTranscript(transcriptPath);
  const costBreakdown = calculateCost(tokensByModel);
  const primaryModel = getPrimaryModel(tokensByModel);

  const totals = sumTokens(tokensByModel);

  const now = new Date().toISOString();
  const durationSeconds = session?.started_at
    ? Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000)
    : null;

  if (session) {
    db.prepare(
      `UPDATE sessions SET
        transcript_path = COALESCE(?, transcript_path),
        model = COALESCE(?, model),
        ended_at = ?,
        duration_seconds = ?,
        input_tokens = ?,
        output_tokens = ?,
        cache_creation_tokens = ?,
        cache_read_tokens = ?,
        estimated_cost_usd = ?,
        end_reason = ?
       WHERE session_id = ?`
    ).run(
      transcriptPath, primaryModel, now, durationSeconds,
      totals.input, totals.output, totals.cacheCreation, totals.cacheRead,
      costBreakdown.totalCost, reason, sessionId
    );
  } else {
    db.prepare(
      `INSERT INTO sessions (session_id, transcript_path, project_path, model, source, started_at, ended_at, duration_seconds,
        input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, estimated_cost_usd, end_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sessionId, transcriptPath, "unknown", primaryModel, "unknown", now, now, 0,
      totals.input, totals.output, totals.cacheCreation, totals.cacheRead,
      costBreakdown.totalCost, reason
    );
  }
}

export function syncSession(sessionId: string): boolean {
  const db = getDb();
  const session = db
    .prepare("SELECT * FROM sessions WHERE session_id = ?")
    .get(sessionId) as Session | undefined;

  if (!session?.transcript_path) return false;

  const tokensByModel = parseTranscript(session.transcript_path);
  const costBreakdown = calculateCost(tokensByModel);
  const primaryModel = getPrimaryModel(tokensByModel);

  const totals = sumTokens(tokensByModel);

  db.prepare(
    `UPDATE sessions SET
      model = COALESCE(?, model),
      input_tokens = ?,
      output_tokens = ?,
      cache_creation_tokens = ?,
      cache_read_tokens = ?,
      estimated_cost_usd = ?
     WHERE session_id = ?`
  ).run(
    primaryModel,
    totals.input, totals.output, totals.cacheCreation, totals.cacheRead,
    costBreakdown.totalCost, sessionId
  );

  return true;
}

export function buildSessionFilter(options: {
  label?: string;
  days?: number;
}): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.label) {
    conditions.push(
      `s.session_id IN (SELECT sl.session_id FROM session_labels sl JOIN labels l ON sl.label_id = l.id WHERE l.name = ?)`
    );
    params.push(options.label);
  }

  if (options.days) {
    conditions.push(`s.started_at >= datetime('now', ?)`);
    params.push(`-${options.days} days`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

export function listSessions(options: {
  label?: string;
  days?: number;
  limit?: number;
}): Session[] {
  const db = getDb();
  const { where, params } = buildSessionFilter(options);
  const limit = options.limit || 20;

  return db
    .prepare(
      `SELECT s.* FROM sessions s ${where} ORDER BY s.started_at DESC LIMIT ?`
    )
    .all(...params, limit) as Session[];
}

export function getSession(sessionId: string): Session | undefined {
  const db = getDb();
  const escaped = sessionId.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  return db
    .prepare("SELECT * FROM sessions WHERE session_id = ? OR session_id LIKE ? ESCAPE '\\'")
    .get(sessionId, `${escaped}%`) as Session | undefined;
}

export function getMostRecentSession(): Session | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM sessions ORDER BY started_at DESC LIMIT 1")
    .get() as Session | undefined;
}

export function getAllSessions(): Session[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM sessions ORDER BY started_at DESC")
    .all() as Session[];
}
