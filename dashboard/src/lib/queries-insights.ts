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

export interface HourlyActivity {
  dow: number;
  hour: number;
  sessions: number;
  total_cost: number;
  avg_cost: number;
  avg_duration: number;
}

export interface DepthBucket {
  bucket: string;
  count: number;
  avg_cost: number;
  total_cost: number;
}

export interface PeakHour {
  dow: number;
  hour: number;
  sessions: number;
  avg_cost: number;
  total_cost: number;
}

export interface DailyCadencePoint {
  date: string;
  sessions: number;
  avg_cost: number;
}

export interface BranchActivity {
  branch: string;
  sessions: number;
  total_cost: number;
  avg_cost: number;
}

export function getHourlyActivity(filters: DashboardFilters): HourlyActivity[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  return db.prepare(
    `SELECT
      CAST(strftime('%w', s.started_at) AS INTEGER) as dow,
      CAST(strftime('%H', s.started_at) AS INTEGER) as hour,
      COUNT(*) as sessions,
      COALESCE(SUM(s.estimated_cost_usd), 0) as total_cost,
      COALESCE(AVG(s.estimated_cost_usd), 0) as avg_cost,
      COALESCE(AVG(s.duration_seconds), 0) as avg_duration
    FROM sessions s ${where}
    GROUP BY dow, hour
    ORDER BY dow, hour`
  ).all(...params) as HourlyActivity[];
}

export function getSessionDepthDistribution(filters: DashboardFilters): DepthBucket[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  const rows = db.prepare(
    `SELECT
      CASE
        WHEN s.message_count BETWEEN 1 AND 5 THEN '1-5'
        WHEN s.message_count BETWEEN 6 AND 15 THEN '6-15'
        WHEN s.message_count BETWEEN 16 AND 30 THEN '16-30'
        WHEN s.message_count BETWEEN 31 AND 60 THEN '31-60'
        ELSE '60+'
      END as bucket,
      COUNT(*) as count,
      COALESCE(AVG(s.estimated_cost_usd), 0) as avg_cost,
      COALESCE(SUM(s.estimated_cost_usd), 0) as total_cost
    FROM sessions s ${where}
    GROUP BY bucket
    ORDER BY MIN(s.message_count)`
  ).all(...params) as DepthBucket[];

  const bucketOrder = ["1-5", "6-15", "16-30", "31-60", "60+"];
  return bucketOrder.map((b) => {
    const found = rows.find((r) => r.bucket === b);
    return found || { bucket: b, count: 0, avg_cost: 0, total_cost: 0 };
  });
}

export function getPeakHours(filters: DashboardFilters): PeakHour[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  return db.prepare(
    `SELECT
      CAST(strftime('%w', s.started_at) AS INTEGER) as dow,
      CAST(strftime('%H', s.started_at) AS INTEGER) as hour,
      COUNT(*) as sessions,
      COALESCE(AVG(s.estimated_cost_usd), 0) as avg_cost,
      COALESCE(SUM(s.estimated_cost_usd), 0) as total_cost
    FROM sessions s ${where}
    GROUP BY dow, hour
    ORDER BY sessions DESC
    LIMIT 5`
  ).all(...params) as PeakHour[];
}

export function getDailySessionCadence(filters: DashboardFilters): DailyCadencePoint[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  return db.prepare(
    `SELECT
      date(s.started_at) as date,
      COUNT(*) as sessions,
      COALESCE(AVG(s.estimated_cost_usd), 0) as avg_cost
    FROM sessions s ${where}
    GROUP BY date(s.started_at)
    ORDER BY date`
  ).all(...params) as DailyCadencePoint[];
}

export function getBranchActivity(filters: DashboardFilters): BranchActivity[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  const extraCondition = where
    ? ` AND s.git_branch IS NOT NULL`
    : `WHERE s.git_branch IS NOT NULL`;

  return db.prepare(
    `SELECT
      s.git_branch as branch,
      COUNT(*) as sessions,
      COALESCE(SUM(s.estimated_cost_usd), 0) as total_cost,
      COALESCE(AVG(s.estimated_cost_usd), 0) as avg_cost
    FROM sessions s ${where}${extraCondition}
    GROUP BY s.git_branch
    HAVING sessions > 1
    ORDER BY total_cost DESC`
  ).all(...params) as BranchActivity[];
}
