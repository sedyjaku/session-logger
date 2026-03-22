import { getDb } from "../db.js";
import { MODEL_PRICING } from "../config.js";
import type { Session, CostBreakdown, ModelBreakdown, MessageCost, MessageOutlier } from "../types.js";
import { parseTranscript, parseFullTranscript, getPrimaryModel, sumTokens } from "./transcript.service.js";
import { calculateCost } from "./cost.service.js";

function findPricingForModel(model: string) {
  for (const [prefix, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(prefix)) return pricing;
  }
  return null;
}

function upsertAnalytics(sessionId: string, transcriptPath: string): void {
  const db = getDb();
  const parsed = parseFullTranscript(transcriptPath);

  db.prepare("DELETE FROM tool_uses WHERE session_id = ?").run(sessionId);
  db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
  db.prepare("DELETE FROM session_events WHERE session_id = ?").run(sessionId);

  let messageCount = 0;
  let toolUseCount = 0;
  let thinkingTokens = 0;

  const insertMessage = db.prepare(
    `INSERT INTO messages (session_id, message_id, request_id, model, timestamp, stop_reason,
      input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cost_usd, thinking_tokens, has_tool_use)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertToolUse = db.prepare(
    `INSERT INTO tool_uses (session_id, message_id, tool_use_id, tool_name, timestamp, input_json, duration_ms, total_tokens, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertEvent = db.prepare(
    `INSERT INTO session_events (session_id, type, timestamp, stop_reason, duration_ms)
     VALUES (?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    for (const msg of parsed.messages) {
      const pricing = findPricingForModel(msg.model);
      const costUsd = pricing
        ? (msg.input_tokens / 1_000_000) * pricing.input +
          (msg.output_tokens / 1_000_000) * pricing.output +
          (msg.cache_creation_tokens / 1_000_000) * pricing.cacheCreation +
          (msg.cache_read_tokens / 1_000_000) * pricing.cacheRead
        : 0;

      insertMessage.run(
        sessionId, msg.id, msg.requestId, msg.model, msg.timestamp, msg.stopReason,
        msg.input_tokens, msg.output_tokens, msg.cache_creation_tokens, msg.cache_read_tokens,
        costUsd, msg.thinking_tokens, msg.toolUses.length > 0 ? 1 : 0
      );

      messageCount++;
      thinkingTokens += msg.thinking_tokens;

      for (const tu of msg.toolUses) {
        const result = parsed.toolResults.get(tu.toolUseId);
        insertToolUse.run(
          sessionId, msg.id, tu.toolUseId, tu.toolName, msg.timestamp, tu.inputJson,
          result?.durationMs ?? null, result?.totalTokens ?? null, result?.status ?? null
        );
        toolUseCount++;
      }
    }

    for (const evt of parsed.events) {
      insertEvent.run(sessionId, evt.type, evt.timestamp, evt.stopReason, evt.durationMs);
    }

    db.prepare(
      `UPDATE sessions SET
        git_branch = COALESCE(?, git_branch),
        claude_version = COALESCE(?, claude_version),
        message_count = ?,
        tool_use_count = ?,
        thinking_tokens = ?
       WHERE session_id = ?`
    ).run(parsed.gitBranch, parsed.claudeVersion, messageCount, toolUseCount, thinkingTokens, sessionId);
  });

  tx();
}

export function upsertAnalyticsForDoctor(sessionId: string, transcriptPath: string): void {
  upsertAnalytics(sessionId, transcriptPath);
}

export function upsertModelBreakdownForDoctor(sessionId: string, costBreakdown: CostBreakdown): void {
  upsertModelBreakdown(sessionId, costBreakdown);
}

function upsertModelBreakdown(sessionId: string, costBreakdown: CostBreakdown): void {
  const db = getDb();
  db.prepare("DELETE FROM session_models WHERE session_id = ?").run(sessionId);

  const insert = db.prepare(
    `INSERT INTO session_models (session_id, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  for (const [model, data] of Object.entries(costBreakdown.byModel)) {
    insert.run(
      sessionId, model,
      data.input_tokens, data.output_tokens,
      data.cache_creation_tokens, data.cache_read_tokens,
      data.cost
    );
  }
}

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

  upsertModelBreakdown(sessionId, costBreakdown);
  upsertAnalytics(sessionId, transcriptPath);
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

  upsertModelBreakdown(sessionId, costBreakdown);
  upsertAnalytics(sessionId, session.transcript_path);

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

export function getModelBreakdown(sessionId: string): ModelBreakdown[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cost_usd
       FROM session_models WHERE session_id = ? ORDER BY cost_usd DESC`
    )
    .all(sessionId) as ModelBreakdown[];
}

export function getMessageOutliers(sessionId: string, limit = 10): MessageCost[] {
  const db = getDb();
  return db.prepare(
    `SELECT message_id, model, input_tokens, output_tokens,
      cache_creation_tokens, cache_read_tokens, cost_usd as cost
     FROM messages WHERE session_id = ?
     ORDER BY cost_usd DESC LIMIT ?`
  ).all(sessionId, limit) as MessageCost[];
}

export function getCrossSessionOutliers(options: {
  label?: string;
  days?: number;
  limit?: number;
}): MessageOutlier[] {
  const db = getDb();
  const { where, params } = buildSessionFilter(options);
  const limit = options.limit || 20;

  return db.prepare(
    `SELECT m.message_id, m.model, m.input_tokens, m.output_tokens,
      m.cache_creation_tokens, m.cache_read_tokens, m.cost_usd as cost,
      s.session_id, s.project_path
     FROM messages m
     JOIN sessions s ON m.session_id = s.session_id
     ${where}
     ORDER BY m.cost_usd DESC LIMIT ?`
  ).all(...params, limit) as MessageOutlier[];
}
