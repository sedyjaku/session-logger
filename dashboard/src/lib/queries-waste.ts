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

export interface WasteSummary {
  total_waste_cost: number;
  total_spend: number;
  waste_percent: number;
  abandoned_count: number;
  context_limit_count: number;
  tool_failure_count: number;
}

export interface AbandonedSession {
  session_id: string;
  project_path: string;
  model: string | null;
  estimated_cost_usd: number;
  message_count: number;
  started_at: string;
  end_reason: string | null;
}

export interface ContextLimitSession {
  session_id: string;
  project_path: string;
  model: string | null;
  estimated_cost_usd: number;
  message_count: number;
  event_count: number;
  started_at: string;
}

export interface ToolFailureSession {
  session_id: string;
  project_path: string;
  model: string | null;
  estimated_cost_usd: number;
  total_tools: number;
  failed_tools: number;
  failure_rate: number;
}

export interface WasteTrendPoint {
  date: string;
  waste_cost: number;
}

export function getAbandonedSessions(filters: DashboardFilters): AbandonedSession[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  const extraCondition = where
    ? ` AND ((s.message_count <= 2 AND s.estimated_cost_usd > 0.10) OR s.end_reason LIKE '%interrupt%')`
    : `WHERE ((s.message_count <= 2 AND s.estimated_cost_usd > 0.10) OR s.end_reason LIKE '%interrupt%')`;

  return db.prepare(
    `SELECT s.session_id, s.project_path, s.model, s.estimated_cost_usd,
      s.message_count, s.started_at, s.end_reason
     FROM sessions s ${where}${extraCondition}
     ORDER BY s.estimated_cost_usd DESC`
  ).all(...params) as AbandonedSession[];
}

export function getContextLimitSessions(filters: DashboardFilters): ContextLimitSession[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  const joinCondition = where
    ? ` AND se.type = 'context_limit'`
    : `WHERE se.type = 'context_limit'`;

  return db.prepare(
    `SELECT s.session_id, s.project_path, s.model, s.estimated_cost_usd,
      s.message_count, COUNT(se.rowid) as event_count, s.started_at
     FROM sessions s
     JOIN session_events se ON s.session_id = se.session_id
     ${where}${joinCondition}
     GROUP BY s.session_id
     ORDER BY s.estimated_cost_usd DESC`
  ).all(...params) as ContextLimitSession[];
}

export function getToolFailureSessions(filters: DashboardFilters): ToolFailureSession[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);

  const rows = db.prepare(
    `SELECT s.session_id, s.project_path, s.model, s.estimated_cost_usd,
      COUNT(*) as total_tools,
      SUM(CASE WHEN tu.status != 'success' AND tu.status IS NOT NULL THEN 1 ELSE 0 END) as failed_tools
     FROM sessions s
     JOIN tool_uses tu ON s.session_id = tu.session_id
     ${where}
     GROUP BY s.session_id
     HAVING total_tools >= 3 AND (1.0 * failed_tools / total_tools) > 0.3
     ORDER BY s.estimated_cost_usd DESC`
  ).all(...params) as Omit<ToolFailureSession, "failure_rate">[];

  return rows.map((row) => ({
    ...row,
    failure_rate: row.total_tools > 0
      ? row.failed_tools / row.total_tools
      : 0,
  }));
}

export function getWasteSummary(filters: DashboardFilters): WasteSummary {
  const db = getDb();
  const { where, params } = buildFilter(filters);

  const totalSpend = db.prepare(
    `SELECT COALESCE(SUM(s.estimated_cost_usd), 0) as total FROM sessions s ${where}`
  ).get(...params) as { total: number };

  const abandoned = getAbandonedSessions(filters);
  const contextLimit = getContextLimitSessions(filters);
  const toolFailure = getToolFailureSessions(filters);

  const wasteSessionIds = new Set<string>();
  let totalWasteCost = 0;

  for (const s of abandoned) {
    if (!wasteSessionIds.has(s.session_id)) {
      wasteSessionIds.add(s.session_id);
      totalWasteCost += s.estimated_cost_usd;
    }
  }
  for (const s of contextLimit) {
    if (!wasteSessionIds.has(s.session_id)) {
      wasteSessionIds.add(s.session_id);
      totalWasteCost += s.estimated_cost_usd;
    }
  }
  for (const s of toolFailure) {
    if (!wasteSessionIds.has(s.session_id)) {
      wasteSessionIds.add(s.session_id);
      totalWasteCost += s.estimated_cost_usd;
    }
  }

  return {
    total_waste_cost: totalWasteCost,
    total_spend: totalSpend.total,
    waste_percent: totalSpend.total > 0 ? totalWasteCost / totalSpend.total : 0,
    abandoned_count: abandoned.length,
    context_limit_count: contextLimit.length,
    tool_failure_count: toolFailure.length,
  };
}

export function getWasteTrend(filters: DashboardFilters): WasteTrendPoint[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);

  const abandonedWhere = where
    ? `${where} AND ((s.message_count <= 2 AND s.estimated_cost_usd > 0.10) OR s.end_reason LIKE '%interrupt%')`
    : `WHERE ((s.message_count <= 2 AND s.estimated_cost_usd > 0.10) OR s.end_reason LIKE '%interrupt%')`;

  const contextWhere = where
    ? `${where} AND se.type = 'context_limit'`
    : `WHERE se.type = 'context_limit'`;

  const toolWhere = where || "";

  return db.prepare(
    `SELECT date, COALESCE(SUM(waste_cost), 0) as waste_cost
     FROM (
       SELECT date(s.started_at) as date, s.estimated_cost_usd as waste_cost, s.session_id
       FROM sessions s ${abandonedWhere}
       UNION
       SELECT date(s.started_at) as date, s.estimated_cost_usd as waste_cost, s.session_id
       FROM sessions s
       JOIN session_events se ON s.session_id = se.session_id
       ${contextWhere}
       GROUP BY s.session_id
       UNION
       SELECT date(sub.started_at) as date, sub.estimated_cost_usd as waste_cost, sub.session_id
       FROM (
         SELECT s.session_id, s.started_at, s.estimated_cost_usd,
           COUNT(*) as total_tools,
           SUM(CASE WHEN tu.status != 'success' AND tu.status IS NOT NULL THEN 1 ELSE 0 END) as failed_tools
         FROM sessions s
         JOIN tool_uses tu ON s.session_id = tu.session_id
         ${toolWhere}
         GROUP BY s.session_id
         HAVING total_tools >= 3 AND (1.0 * failed_tools / total_tools) > 0.3
       ) sub
     )
     GROUP BY date
     ORDER BY date`
  ).all(...params, ...params, ...params) as WasteTrendPoint[];
}
