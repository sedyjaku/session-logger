import { getDb } from "../db.js";
import { JIRA_SYNC_ENDPOINT } from "../config.js";
import type {
  JiraSyncSessionDetail,
  JiraSyncRequest,
  JiraSyncResponse,
  JiraSyncRecord,
  SessionModelUsage,
} from "../jira-sync.types.js";

const TICKET_PATTERN = /^[A-Z]+-\d+$/;

export function getJiraTicketLabels(): string[] {
  const db = getDb();
  const labels = db
    .prepare("SELECT name FROM labels")
    .all() as { name: string }[];
  return labels
    .map((l) => l.name)
    .filter((name) => TICKET_PATTERN.test(name));
}

interface SessionRow {
  session_id: string;
  date: string;
  duration_seconds: number | null;
  active_seconds: number | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
  project_path: string;
}

export function getSessionsForTicket(ticketId: string): JiraSyncSessionDetail[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
        s.session_id,
        DATE(s.started_at) as date,
        s.duration_seconds,
        (SELECT CAST(SUM(se.duration_ms) / 1000 AS INTEGER)
         FROM session_events se
         WHERE se.session_id = s.session_id AND se.type = 'turn_duration') as active_seconds,
        s.model,
        s.input_tokens,
        s.output_tokens,
        s.cache_creation_tokens,
        s.cache_read_tokens,
        s.estimated_cost_usd as cost_usd,
        s.project_path
       FROM sessions s
       JOIN session_labels sl ON s.session_id = sl.session_id
       JOIN labels l ON sl.label_id = l.id
       WHERE l.name = ?
       ORDER BY s.started_at ASC`
    )
    .all(ticketId) as SessionRow[];

  const getModels = db.prepare(
    `SELECT model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cost_usd
     FROM session_models WHERE session_id = ?`
  );

  return rows.map((row) => ({
    ...row,
    models: getModels.all(row.session_id) as SessionModelUsage[],
  }));
}

export function getSyncRecord(ticketId: string): JiraSyncRecord | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM jira_syncs WHERE ticket_id = ?")
    .get(ticketId) as JiraSyncRecord | undefined;
}

export function saveSyncRecord(
  ticketId: string,
  commentId: string,
  totalCost: number,
  sessionCount: number
): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO jira_syncs (ticket_id, comment_id, last_synced_at, total_cost_usd, session_count)
     VALUES (?, ?, ?, ?, ?)`
  ).run(ticketId, commentId, new Date().toISOString(), totalCost, sessionCount);
}

export function hasChangedSinceLastSync(ticketId: string): boolean {
  const sessions = getSessionsForTicket(ticketId);
  const record = getSyncRecord(ticketId);
  if (!record) return true;
  const totalCost = sessions.reduce((sum, s) => sum + s.cost_usd, 0);
  return (
    sessions.length !== record.session_count ||
    Math.abs(totalCost - record.total_cost_usd) > 0.001
  );
}

export function buildSyncPayload(ticketId: string): JiraSyncRequest {
  const sessions = getSessionsForTicket(ticketId);
  const record = getSyncRecord(ticketId);
  const totalCost = sessions.reduce((sum, s) => sum + s.cost_usd, 0);

  return {
    ticket_id: ticketId,
    comment_id: record?.comment_id ?? undefined,
    total_cost_usd: totalCost,
    session_count: sessions.length,
    sessions,
  };
}

export async function syncTicket(ticketId: string): Promise<JiraSyncResponse> {
  if (!JIRA_SYNC_ENDPOINT) {
    throw new Error(
      "JIRA_SYNC_ENDPOINT environment variable not configured. Set it to your Lambda Function URL."
    );
  }

  const payload = buildSyncPayload(ticketId);
  if (payload.sessions.length === 0) {
    throw new Error(`No sessions found for ticket ${ticketId}`);
  }

  const response = await fetch(JIRA_SYNC_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lambda returned ${response.status}: ${text}`);
  }

  const result = (await response.json()) as JiraSyncResponse;
  if (!result.success) {
    throw new Error(result.error || "Sync failed with no error message");
  }

  saveSyncRecord(
    ticketId,
    result.comment_id,
    payload.total_cost_usd,
    payload.session_count
  );

  return result;
}

export async function syncAllTickets(force: boolean): Promise<{
  synced: string[];
  skipped: string[];
  errors: Array<{ ticket: string; error: string }>;
}> {
  const tickets = getJiraTicketLabels();
  const synced: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ ticket: string; error: string }> = [];

  for (const ticket of tickets) {
    if (!force && !hasChangedSinceLastSync(ticket)) {
      skipped.push(ticket);
      continue;
    }
    try {
      await syncTicket(ticket);
      synced.push(ticket);
    } catch (err) {
      errors.push({ ticket, error: (err as Error).message });
    }
  }

  return { synced, skipped, errors };
}
