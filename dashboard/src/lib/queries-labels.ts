import { getDb } from "./db";
import type {
  DashboardFilters,
  LabelDetailedStats,
  ProjectDetailedStats,
  LabelDailyCost,
  LabelOutlierSession,
  ProjectOutlierSession,
  ExpensiveLabel,
  ExpensiveProject,
} from "./types";

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

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

export function getLabelDetailedStats(filters: DashboardFilters): LabelDetailedStats[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);

  const rows = db.prepare(
    `SELECT l.name,
      COUNT(DISTINCT s.session_id) as session_count,
      COALESCE(SUM(s.estimated_cost_usd), 0) as total_cost,
      COALESCE(AVG(s.estimated_cost_usd), 0) as avg_cost,
      COALESCE(MIN(s.estimated_cost_usd), 0) as min_cost,
      COALESCE(MAX(s.estimated_cost_usd), 0) as max_cost,
      COALESCE(SUM(s.input_tokens + s.output_tokens), 0) as total_tokens,
      COALESCE(SUM(s.duration_seconds), 0) as total_duration,
      COALESCE(SUM((SELECT SUM(se.duration_ms) / 1000.0 FROM session_events se WHERE se.session_id = s.session_id AND se.type = 'turn_duration')), 0) as total_active_seconds,
      MAX(s.started_at) as last_active
     FROM labels l
     JOIN session_labels sl ON l.id = sl.label_id
     JOIN sessions s ON sl.session_id = s.session_id
     ${where}
     GROUP BY l.name
     ORDER BY total_cost DESC`
  ).all(...params) as Omit<LabelDetailedStats, "median_cost" | "recent_sessions" | "older_sessions">[];

  const costsPerLabel = db.prepare(
    `SELECT l.name, s.estimated_cost_usd as cost
     FROM labels l
     JOIN session_labels sl ON l.id = sl.label_id
     JOIN sessions s ON sl.session_id = s.session_id
     ${where}
     ORDER BY l.name, s.estimated_cost_usd`
  ).all(...params) as { name: string; cost: number }[];

  const costMap = new Map<string, number[]>();
  for (const row of costsPerLabel) {
    if (!costMap.has(row.name)) costMap.set(row.name, []);
    costMap.get(row.name)!.push(row.cost);
  }

  const midpointDates = db.prepare(
    `SELECT l.name, s.started_at
     FROM labels l
     JOIN session_labels sl ON l.id = sl.label_id
     JOIN sessions s ON sl.session_id = s.session_id
     ${where}
     ORDER BY l.name, s.started_at`
  ).all(...params) as { name: string; started_at: string }[];

  const datesMap = new Map<string, string[]>();
  for (const row of midpointDates) {
    if (!datesMap.has(row.name)) datesMap.set(row.name, []);
    datesMap.get(row.name)!.push(row.started_at);
  }

  return rows.map((row) => {
    const costs = costMap.get(row.name) || [];
    const dates = datesMap.get(row.name) || [];
    const midIdx = Math.floor(dates.length / 2);
    const midDate = dates[midIdx] || "";

    let recentSessions = 0;
    let olderSessions = 0;
    for (const d of dates) {
      if (d >= midDate) recentSessions++;
      else olderSessions++;
    }

    return {
      ...row,
      median_cost: computeMedian(costs),
      recent_sessions: recentSessions,
      older_sessions: olderSessions,
    };
  });
}

export function getProjectDetailedStats(filters: DashboardFilters): ProjectDetailedStats[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);

  const rows = db.prepare(
    `SELECT s.project_path,
      COUNT(DISTINCT s.session_id) as session_count,
      COALESCE(SUM(s.estimated_cost_usd), 0) as total_cost,
      COALESCE(AVG(s.estimated_cost_usd), 0) as avg_cost,
      COALESCE(MIN(s.estimated_cost_usd), 0) as min_cost,
      COALESCE(MAX(s.estimated_cost_usd), 0) as max_cost,
      COALESCE(SUM(s.input_tokens + s.output_tokens), 0) as total_tokens,
      COALESCE(SUM(s.duration_seconds), 0) as total_duration,
      COALESCE(SUM((SELECT SUM(se.duration_ms) / 1000.0 FROM session_events se WHERE se.session_id = s.session_id AND se.type = 'turn_duration')), 0) as total_active_seconds,
      MAX(s.started_at) as last_active
     FROM sessions s
     ${where}
     GROUP BY s.project_path
     ORDER BY total_cost DESC`
  ).all(...params) as Omit<ProjectDetailedStats, "median_cost" | "recent_sessions" | "older_sessions">[];

  const costsPerProject = db.prepare(
    `SELECT s.project_path, s.estimated_cost_usd as cost
     FROM sessions s
     ${where}
     ORDER BY s.project_path, s.estimated_cost_usd`
  ).all(...params) as { project_path: string; cost: number }[];

  const costMap = new Map<string, number[]>();
  for (const row of costsPerProject) {
    if (!costMap.has(row.project_path)) costMap.set(row.project_path, []);
    costMap.get(row.project_path)!.push(row.cost);
  }

  const midpointDates = db.prepare(
    `SELECT s.project_path, s.started_at
     FROM sessions s
     ${where}
     ORDER BY s.project_path, s.started_at`
  ).all(...params) as { project_path: string; started_at: string }[];

  const datesMap = new Map<string, string[]>();
  for (const row of midpointDates) {
    if (!datesMap.has(row.project_path)) datesMap.set(row.project_path, []);
    datesMap.get(row.project_path)!.push(row.started_at);
  }

  return rows.map((row) => {
    const costs = costMap.get(row.project_path) || [];
    const dates = datesMap.get(row.project_path) || [];
    const midIdx = Math.floor(dates.length / 2);
    const midDate = dates[midIdx] || "";

    let recentSessions = 0;
    let olderSessions = 0;
    for (const d of dates) {
      if (d >= midDate) recentSessions++;
      else olderSessions++;
    }

    return {
      ...row,
      median_cost: computeMedian(costs),
      recent_sessions: recentSessions,
      older_sessions: olderSessions,
    };
  });
}

export function getLabelDailyCost(filters: DashboardFilters, limit = 6): LabelDailyCost[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);

  const topLabels = db.prepare(
    `SELECT l.name, SUM(s.estimated_cost_usd) as total_cost
     FROM labels l
     JOIN session_labels sl ON l.id = sl.label_id
     JOIN sessions s ON sl.session_id = s.session_id
     ${where ? `${where} AND s.started_at >= datetime('now', '-7 days')` : "WHERE s.started_at >= datetime('now', '-7 days')"}
     GROUP BY l.name
     ORDER BY total_cost DESC
     LIMIT ?`
  ).all(...params, limit) as { name: string; total_cost: number }[];

  if (topLabels.length === 0) return [];

  const placeholders = topLabels.map(() => "?").join(", ");
  const labelNames = topLabels.map((r) => r.name);

  return db.prepare(
    `SELECT l.name, date(s.started_at) as date, SUM(s.estimated_cost_usd) as cost
     FROM labels l
     JOIN session_labels sl ON l.id = sl.label_id
     JOIN sessions s ON sl.session_id = s.session_id
     ${where ? `${where} AND l.name IN (${placeholders})` : `WHERE l.name IN (${placeholders})`}
     GROUP BY l.name, date(s.started_at)
     ORDER BY date, l.name`
  ).all(...params, ...labelNames) as LabelDailyCost[];
}

export function getProjectDailyCost(filters: DashboardFilters, limit = 6): LabelDailyCost[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);

  const topProjects = db.prepare(
    `SELECT s.project_path as name, SUM(s.estimated_cost_usd) as total_cost
     FROM sessions s
     ${where ? `${where} AND s.started_at >= datetime('now', '-7 days')` : "WHERE s.started_at >= datetime('now', '-7 days')"}
     GROUP BY s.project_path
     ORDER BY total_cost DESC
     LIMIT ?`
  ).all(...params, limit) as { name: string; total_cost: number }[];

  if (topProjects.length === 0) return [];

  const placeholders = topProjects.map(() => "?").join(", ");
  const projectNames = topProjects.map((r) => r.name);

  return db.prepare(
    `SELECT s.project_path as name, date(s.started_at) as date, SUM(s.estimated_cost_usd) as cost
     FROM sessions s
     ${where ? `${where} AND s.project_path IN (${placeholders})` : `WHERE s.project_path IN (${placeholders})`}
     GROUP BY s.project_path, date(s.started_at)
     ORDER BY date, s.project_path`
  ).all(...params, ...projectNames) as LabelDailyCost[];
}

export function getLabelOutlierSessions(filters: DashboardFilters): LabelOutlierSession[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  const extraFilter = where ? `AND ${where.replace("WHERE ", "")}` : "";

  return db.prepare(
    `WITH label_avgs AS (
      SELECT l.name as label_name, AVG(s.estimated_cost_usd) as avg_cost, COUNT(*) as cnt
      FROM labels l
      JOIN session_labels sl ON l.id = sl.label_id
      JOIN sessions s ON sl.session_id = s.session_id
      ${where}
      GROUP BY l.name
      HAVING cnt >= 2
    )
    SELECT s.session_id, la.label_name, s.estimated_cost_usd as cost,
      la.avg_cost as label_avg, s.started_at, s.project_path
    FROM label_avgs la
    JOIN labels l ON l.name = la.label_name
    JOIN session_labels sl ON l.id = sl.label_id
    JOIN sessions s ON sl.session_id = s.session_id
    WHERE s.estimated_cost_usd > 2 * la.avg_cost ${extraFilter}
    ORDER BY s.estimated_cost_usd DESC
    LIMIT 20`
  ).all(...params, ...params) as LabelOutlierSession[];
}

export function getProjectOutlierSessions(filters: DashboardFilters): ProjectOutlierSession[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  const extraFilter = where ? `AND ${where.replace("WHERE ", "")}` : "";

  return db.prepare(
    `WITH project_avgs AS (
      SELECT s.project_path, AVG(s.estimated_cost_usd) as avg_cost, COUNT(*) as cnt
      FROM sessions s
      ${where}
      GROUP BY s.project_path
      HAVING cnt >= 2
    )
    SELECT s.session_id, s.project_path, s.estimated_cost_usd as cost,
      pa.avg_cost as project_avg, s.started_at
    FROM project_avgs pa
    JOIN sessions s ON s.project_path = pa.project_path
    WHERE s.estimated_cost_usd > 2 * pa.avg_cost ${extraFilter}
    ORDER BY s.estimated_cost_usd DESC
    LIMIT 20`
  ).all(...params, ...params) as ProjectOutlierSession[];
}

export function getExpensiveLabels(filters: DashboardFilters): ExpensiveLabel[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  const extraFilter = where ? `WHERE ${where.replace("WHERE ", "")}` : "";

  return db.prepare(
    `WITH global_avg AS (
      SELECT AVG(s.estimated_cost_usd) as avg_cost
      FROM sessions s
      ${where}
    )
    SELECT l.name,
      AVG(s.estimated_cost_usd) as avg_cost,
      (SELECT avg_cost FROM global_avg) as global_avg,
      AVG(s.estimated_cost_usd) / (SELECT avg_cost FROM global_avg) as ratio,
      COUNT(*) as session_count
    FROM labels l
    JOIN session_labels sl ON l.id = sl.label_id
    JOIN sessions s ON sl.session_id = s.session_id
    ${extraFilter}
    GROUP BY l.name
    HAVING session_count >= 2
      AND (SELECT avg_cost FROM global_avg) > 0
      AND avg_cost > 2 * (SELECT avg_cost FROM global_avg)
    ORDER BY ratio DESC`
  ).all(...params, ...params) as ExpensiveLabel[];
}

export interface LabelKpis {
  avgCost: number;
  medianCost: number;
  maxCost: number;
  minCost: number;
}

export function getLabelKpis(stats: (LabelDetailedStats | ProjectDetailedStats)[]): LabelKpis {
  if (stats.length === 0) return { avgCost: 0, medianCost: 0, maxCost: 0, minCost: 0 };
  const avgValues = stats.map((s) => s.avg_cost);
  return {
    avgCost: avgValues.reduce((a, b) => a + b, 0) / avgValues.length,
    medianCost: computeMedian(avgValues),
    maxCost: stats.reduce((m, s) => Math.max(m, s.max_cost), 0),
    minCost: stats.reduce((m, s) => Math.min(m, s.min_cost), Infinity),
  };
}

export interface SparklineEntry {
  name: string;
  points: { date: string; cost: number }[];
  total: number;
}

export function buildSparklineData(dailyCost: LabelDailyCost[], limit = 6): SparklineEntry[] {
  const map = new Map<string, { date: string; cost: number }[]>();
  for (const row of dailyCost) {
    if (!map.has(row.name)) map.set(row.name, []);
    map.get(row.name)!.push({ date: row.date, cost: row.cost });
  }
  const entries: SparklineEntry[] = [];
  for (const [name, points] of map) {
    entries.push({ name, points, total: points.reduce((sum, p) => sum + p.cost, 0) });
  }
  return entries.slice(0, limit);
}

export function getExpensiveProjects(filters: DashboardFilters): ExpensiveProject[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);

  return db.prepare(
    `WITH global_avg AS (
      SELECT AVG(s.estimated_cost_usd) as avg_cost
      FROM sessions s
      ${where}
    )
    SELECT s.project_path,
      AVG(s.estimated_cost_usd) as avg_cost,
      (SELECT avg_cost FROM global_avg) as global_avg,
      AVG(s.estimated_cost_usd) / (SELECT avg_cost FROM global_avg) as ratio,
      COUNT(*) as session_count
    FROM sessions s
    ${where}
    GROUP BY s.project_path
    HAVING session_count >= 2
      AND (SELECT avg_cost FROM global_avg) > 0
      AND avg_cost > 2 * (SELECT avg_cost FROM global_avg)
    ORDER BY ratio DESC`
  ).all(...params, ...params) as ExpensiveProject[];
}
