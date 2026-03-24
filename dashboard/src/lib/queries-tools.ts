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

export interface ToolOverviewRow {
  tool_name: string;
  total_count: number;
  avg_duration_ms: number | null;
  total_tokens: number;
  success_count: number;
  failure_count: number;
  failure_rate: number;
}

export function getToolOverview(filters: DashboardFilters): ToolOverviewRow[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  const rows = db.prepare(
    `SELECT
      tu.tool_name,
      COUNT(*) as total_count,
      AVG(tu.duration_ms) as avg_duration_ms,
      COALESCE(SUM(tu.total_tokens), 0) as total_tokens,
      SUM(CASE WHEN tu.status = 'success' OR tu.status IS NULL THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN tu.status = 'error' THEN 1 ELSE 0 END) as failure_count
     FROM tool_uses tu
     JOIN sessions s ON tu.session_id = s.session_id
     ${where}
     GROUP BY tu.tool_name
     ORDER BY total_count DESC`
  ).all(...params) as Omit<ToolOverviewRow, "failure_rate">[];

  return rows.map((r) => ({
    ...r,
    failure_rate: r.total_count > 0 ? r.failure_count / r.total_count : 0,
  }));
}

export interface ToolDurationOutlier {
  tool_name: string;
  session_id: string;
  duration_ms: number;
  total_tokens: number;
  status: string | null;
  timestamp: string;
}

export function getToolDurationOutliers(filters: DashboardFilters): ToolDurationOutlier[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  return db.prepare(
    `SELECT tu.tool_name, tu.session_id, tu.duration_ms, tu.total_tokens, tu.status, tu.timestamp
     FROM tool_uses tu
     JOIN sessions s ON tu.session_id = s.session_id
     ${where} ${where ? "AND" : "WHERE"} tu.duration_ms IS NOT NULL
       AND tu.duration_ms > (
         SELECT tu2.duration_ms
         FROM tool_uses tu2
         JOIN sessions s2 ON tu2.session_id = s2.session_id
         ${where.replace(/\btu\b/g, "tu2").replace(/\bs\b/g, "s2")}
         ${where ? "AND" : "WHERE"} tu2.duration_ms IS NOT NULL
         ORDER BY tu2.duration_ms DESC
         LIMIT 1 OFFSET (
           SELECT MAX(1, CAST(COUNT(*) * 0.01 AS INTEGER))
           FROM tool_uses tu3
           JOIN sessions s3 ON tu3.session_id = s3.session_id
           ${where.replace(/\btu\b/g, "tu3").replace(/\bs\b/g, "s3")}
           ${where ? "AND" : "WHERE"} tu3.duration_ms IS NOT NULL
         )
       )
     ORDER BY tu.duration_ms DESC
     LIMIT 50`
  ).all(...params, ...params, ...params) as ToolDurationOutlier[];
}

export interface ToolTrendPoint {
  date: string;
  tool_name: string;
  count: number;
}

export function getToolTrend(filters: DashboardFilters): ToolTrendPoint[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  return db.prepare(
    `SELECT
      date(tu.timestamp) as date,
      tu.tool_name,
      COUNT(*) as count
     FROM tool_uses tu
     JOIN sessions s ON tu.session_id = s.session_id
     ${where}
     GROUP BY date(tu.timestamp), tu.tool_name
     ORDER BY date`
  ).all(...params) as ToolTrendPoint[];
}

export interface ToolSequenceRow {
  from_tool: string;
  to_tool: string;
  freq: number;
}

export function getToolSequences(filters: DashboardFilters): ToolSequenceRow[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  return db.prepare(
    `WITH ordered_tools AS (
      SELECT
        tu.session_id,
        tu.tool_name,
        ROW_NUMBER() OVER (PARTITION BY tu.session_id ORDER BY tu.timestamp, tu.rowid) as rn
      FROM tool_uses tu
      JOIN sessions s ON tu.session_id = s.session_id
      ${where}
    )
    SELECT
      t1.tool_name as from_tool,
      t2.tool_name as to_tool,
      COUNT(*) as freq
    FROM ordered_tools t1
    JOIN ordered_tools t2
      ON t1.session_id = t2.session_id
      AND t2.rn = t1.rn + 1
    GROUP BY from_tool, to_tool
    ORDER BY freq DESC
    LIMIT 20`
  ).all(...params) as ToolSequenceRow[];
}

export interface ToolFailureDetail {
  tool_name: string;
  total: number;
  failures: number;
  failure_rate: number;
  avg_fail_duration_ms: number | null;
  avg_success_duration_ms: number | null;
}

export function getToolFailureDetails(filters: DashboardFilters): ToolFailureDetail[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  const rows = db.prepare(
    `SELECT
      tu.tool_name,
      COUNT(*) as total,
      SUM(CASE WHEN tu.status = 'error' THEN 1 ELSE 0 END) as failures,
      AVG(CASE WHEN tu.status = 'error' THEN tu.duration_ms END) as avg_fail_duration_ms,
      AVG(CASE WHEN tu.status = 'success' OR tu.status IS NULL THEN tu.duration_ms END) as avg_success_duration_ms
     FROM tool_uses tu
     JOIN sessions s ON tu.session_id = s.session_id
     ${where}
     GROUP BY tu.tool_name
     HAVING total >= 5 AND failures > 0
     ORDER BY failures DESC`
  ).all(...params) as Omit<ToolFailureDetail, "failure_rate">[];

  return rows.map((r) => ({
    ...r,
    failure_rate: r.total > 0 ? r.failures / r.total : 0,
  }));
}

export interface ToolKpiData {
  totalCalls: number;
  uniqueTools: number;
  overallFailureRate: number;
  avgDurationMs: number | null;
}

export function getToolKpis(filters: DashboardFilters): ToolKpiData {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  const row = db.prepare(
    `SELECT
      COUNT(*) as total_calls,
      COUNT(DISTINCT tu.tool_name) as unique_tools,
      SUM(CASE WHEN tu.status = 'error' THEN 1 ELSE 0 END) as failure_count,
      AVG(tu.duration_ms) as avg_duration_ms
     FROM tool_uses tu
     JOIN sessions s ON tu.session_id = s.session_id
     ${where}`
  ).get(...params) as {
    total_calls: number;
    unique_tools: number;
    failure_count: number;
    avg_duration_ms: number | null;
  };

  return {
    totalCalls: row.total_calls,
    uniqueTools: row.unique_tools,
    overallFailureRate: row.total_calls > 0 ? row.failure_count / row.total_calls : 0,
    avgDurationMs: row.avg_duration_ms,
  };
}
