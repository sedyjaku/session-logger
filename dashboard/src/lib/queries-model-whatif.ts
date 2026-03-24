import { getDb } from "./db";
import type { DashboardFilters } from "./types";

function buildFilter(filters: DashboardFilters, alias = "s") {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.days) {
    conditions.push(`${alias}.started_at >= datetime('now', ?)`);
    params.push(`-${filters.days} days`);
  }

  if (filters.label) {
    conditions.push(
      `${alias}.session_id IN (SELECT sl.session_id FROM session_labels sl JOIN labels l ON sl.label_id = l.id WHERE l.name = ?)`
    );
    params.push(filters.label);
  }

  if (filters.project) {
    conditions.push(`${alias}.project_path = ?`);
    params.push(filters.project);
  }

  if (filters.model) {
    conditions.push(`${alias}.model LIKE ?`);
    params.push(`${filters.model}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

export interface SessionModelData {
  session_id: string;
  project_path: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
  thinking_tokens: number;
  message_count: number;
  tool_use_count: number;
  started_at: string;
}

export interface ModelComparisonRow {
  model: string;
  sessions: number;
  avg_cost: number;
  avg_messages: number;
  avg_tool_uses: number;
  total_cost: number;
  total_thinking_tokens: number;
  total_output_tokens: number;
}

export function getSessionsByModel(filters: DashboardFilters): SessionModelData[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  return db.prepare(
    `SELECT
      sm.session_id,
      s.project_path,
      sm.model,
      COALESCE(sm.input_tokens, 0) as input_tokens,
      COALESCE(sm.output_tokens, 0) as output_tokens,
      COALESCE(sm.cache_creation_tokens, 0) as cache_creation_tokens,
      COALESCE(sm.cache_read_tokens, 0) as cache_read_tokens,
      COALESCE(sm.cost_usd, 0) as cost_usd,
      COALESCE(s.thinking_tokens, 0) as thinking_tokens,
      COALESCE(s.message_count, 0) as message_count,
      COALESCE(s.tool_use_count, 0) as tool_use_count,
      s.started_at
     FROM session_models sm
     JOIN sessions s ON sm.session_id = s.session_id
     ${where}
     ORDER BY sm.cost_usd DESC`
  ).all(...params) as SessionModelData[];
}

export function getModelComparison(filters: DashboardFilters): ModelComparisonRow[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  return db.prepare(
    `SELECT
      sm.model,
      COUNT(DISTINCT sm.session_id) as sessions,
      AVG(sm.cost_usd) as avg_cost,
      AVG(s.message_count) as avg_messages,
      AVG(s.tool_use_count) as avg_tool_uses,
      COALESCE(SUM(sm.cost_usd), 0) as total_cost,
      COALESCE(SUM(s.thinking_tokens), 0) as total_thinking_tokens,
      COALESCE(SUM(sm.output_tokens), 0) as total_output_tokens
     FROM session_models sm
     JOIN sessions s ON sm.session_id = s.session_id
     ${where}
     GROUP BY sm.model
     ORDER BY total_cost DESC`
  ).all(...params) as ModelComparisonRow[];
}
