import { getDb } from "./db";
import type {
  Session,
  SessionWithLabels,
  SessionSummary,
  LabelStats,
  ModelBreakdown,
  ModelSummary,
  MessageOutlier,
  DailyCostPoint,
  DailyCostByModel,
  ToolUsageStat,
  KpiData,
  DashboardFilters,
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

export function getSummary(filters: DashboardFilters): SessionSummary {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  return db.prepare(
    `SELECT
      COUNT(*) as sessions,
      COALESCE(SUM(s.input_tokens), 0) as input_tokens,
      COALESCE(SUM(s.output_tokens), 0) as output_tokens,
      COALESCE(SUM(s.cache_creation_tokens), 0) as cache_creation_tokens,
      COALESCE(SUM(s.cache_read_tokens), 0) as cache_read_tokens,
      COALESCE(SUM(s.estimated_cost_usd), 0) as total_cost
     FROM sessions s ${where}`
  ).get(...params) as SessionSummary;
}

export function getKpiData(filters: DashboardFilters): KpiData {
  const current = getSummary(filters);
  const prevDays = filters.days ? filters.days * 2 : undefined;
  const prevFilters: DashboardFilters = prevDays
    ? { ...filters, days: prevDays }
    : filters;
  const allPrev = getSummary(prevFilters);

  const previous: SessionSummary = {
    sessions: allPrev.sessions - current.sessions,
    input_tokens: allPrev.input_tokens - current.input_tokens,
    output_tokens: allPrev.output_tokens - current.output_tokens,
    cache_creation_tokens: allPrev.cache_creation_tokens - current.cache_creation_tokens,
    cache_read_tokens: allPrev.cache_read_tokens - current.cache_read_tokens,
    total_cost: allPrev.total_cost - current.total_cost,
  };

  const db = getDb();
  const { where, params } = buildFilter(filters);

  const unlabeled = db.prepare(
    `SELECT COUNT(*) as cnt FROM sessions s ${where} ${where ? "AND" : "WHERE"} s.session_id NOT IN (SELECT session_id FROM session_labels)`
  ).get(...params) as { cnt: number };

  const thinking = db.prepare(
    `SELECT COALESCE(SUM(s.thinking_tokens), 0) as total FROM sessions s ${where}`
  ).get(...params) as { total: number };

  return {
    current,
    previous,
    unlabeledCount: unlabeled.cnt,
    totalCount: current.sessions,
    totalThinkingTokens: thinking.total,
  };
}

export function getDailyCostSeries(filters: DashboardFilters): DailyCostPoint[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  return db.prepare(
    `SELECT
      date(s.started_at) as date,
      COALESCE(SUM(s.estimated_cost_usd), 0) as cost,
      COUNT(*) as sessions
     FROM sessions s ${where}
     GROUP BY date(s.started_at)
     ORDER BY date`
  ).all(...params) as DailyCostPoint[];
}

export function getDailyCostByModel(filters: DashboardFilters): DailyCostByModel[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  return db.prepare(
    `SELECT
      date(s.started_at) as date,
      sm.model,
      COALESCE(SUM(sm.cost_usd), 0) as cost
     FROM session_models sm
     JOIN sessions s ON sm.session_id = s.session_id
     ${where}
     GROUP BY date(s.started_at), sm.model
     ORDER BY date`
  ).all(...params) as DailyCostByModel[];
}

export function getCostByLabel(filters: DashboardFilters): LabelStats[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  return db.prepare(
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
     LEFT JOIN sessions s ON sl.session_id = s.session_id ${where ? "AND " + where.replace("WHERE ", "") : ""}
     GROUP BY l.id, l.name
     HAVING total_cost > 0
     ORDER BY total_cost DESC`
  ).all(...params) as LabelStats[];
}

export function getCostByProject(filters: DashboardFilters): { project_path: string; cost: number; sessions: number }[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  return db.prepare(
    `SELECT
      s.project_path,
      COALESCE(SUM(s.estimated_cost_usd), 0) as cost,
      COUNT(*) as sessions
     FROM sessions s ${where}
     GROUP BY s.project_path
     ORDER BY cost DESC`
  ).all(...params) as { project_path: string; cost: number; sessions: number }[];
}

export function getModelSummary(filters: DashboardFilters): ModelSummary[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  return db.prepare(
    `SELECT
      sm.model,
      COUNT(DISTINCT sm.session_id) as sessions,
      COALESCE(SUM(sm.input_tokens), 0) as input_tokens,
      COALESCE(SUM(sm.output_tokens), 0) as output_tokens,
      COALESCE(SUM(sm.cache_creation_tokens), 0) as cache_creation_tokens,
      COALESCE(SUM(sm.cache_read_tokens), 0) as cache_read_tokens,
      COALESCE(SUM(sm.cost_usd), 0) as total_cost
     FROM session_models sm
     JOIN sessions s ON sm.session_id = s.session_id
     ${where}
     GROUP BY sm.model
     ORDER BY total_cost DESC`
  ).all(...params) as ModelSummary[];
}

export function listSessions(filters: DashboardFilters & { limit?: number; offset?: number; search?: string }): SessionWithLabels[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.days) {
    conditions.push(`s.started_at >= datetime('now', ?)`);
    params.push(`-${filters.days} days`);
  }
  if (filters.label) {
    conditions.push(
      `s.session_id IN (SELECT sl.session_id FROM session_labels sl JOIN labels l ON sl.label_id = l.id WHERE l.name = ?)`
    );
    params.push(filters.label);
  }
  if (filters.project) {
    conditions.push(`s.project_path = ?`);
    params.push(filters.project);
  }
  if (filters.model) {
    conditions.push(`s.model LIKE ?`);
    params.push(`${filters.model}%`);
  }
  if (filters.search) {
    conditions.push(`(s.session_id LIKE ? OR s.project_path LIKE ?)`);
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit || 20;
  const offset = filters.offset || 0;

  return db.prepare(
    `SELECT s.*,
      COALESCE(GROUP_CONCAT(l.name, ', '), '') as labels
     FROM sessions s
     LEFT JOIN session_labels sl ON s.session_id = sl.session_id
     LEFT JOIN labels l ON sl.label_id = l.id
     ${where}
     GROUP BY s.session_id
     ORDER BY s.started_at DESC
     LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as SessionWithLabels[];
}

export function getSessionCount(filters: DashboardFilters & { search?: string }): number {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  let finalWhere = where;
  const finalParams = [...params];

  if (filters.search) {
    const searchClause = `(s.session_id LIKE ? OR s.project_path LIKE ?)`;
    finalWhere = finalWhere
      ? `${finalWhere} AND ${searchClause}`
      : `WHERE ${searchClause}`;
    finalParams.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  const result = db.prepare(
    `SELECT COUNT(*) as cnt FROM sessions s ${finalWhere}`
  ).get(...finalParams) as { cnt: number };
  return result.cnt;
}

export function getSession(sessionId: string): Session | undefined {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM sessions WHERE session_id = ? OR session_id LIKE ?"
  ).get(sessionId, `${sessionId}%`) as Session | undefined;
}

export function getSessionLabels(sessionId: string): string[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT l.name FROM labels l JOIN session_labels sl ON l.id = sl.label_id WHERE sl.session_id = ?`
  ).all(sessionId) as { name: string }[];
  return rows.map((r) => r.name);
}

export function getModelBreakdown(sessionId: string): ModelBreakdown[] {
  const db = getDb();
  return db.prepare(
    `SELECT model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cost_usd
     FROM session_models WHERE session_id = ? ORDER BY cost_usd DESC`
  ).all(sessionId) as ModelBreakdown[];
}

export function getMessageOutliers(sessionId: string, limit = 10): MessageOutlier[] {
  const db = getDb();
  return db.prepare(
    `SELECT m.message_id, m.model, m.input_tokens, m.output_tokens,
      m.cache_creation_tokens, m.cache_read_tokens, m.cost_usd as cost,
      ? as session_id, '' as project_path
     FROM messages m WHERE m.session_id = ?
     ORDER BY m.cost_usd DESC LIMIT ?`
  ).all(sessionId, sessionId, limit) as MessageOutlier[];
}

export function getCrossSessionOutliers(filters: DashboardFilters & { limit?: number }): MessageOutlier[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  const limit = filters.limit || 20;
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

export function getSessionMessageTimeline(sessionId: string) {
  const db = getDb();
  return db.prepare(
    `SELECT message_id, model, timestamp, input_tokens, output_tokens,
      cache_creation_tokens, cache_read_tokens, cost_usd, thinking_tokens, has_tool_use
     FROM messages WHERE session_id = ?
     ORDER BY timestamp`
  ).all(sessionId) as {
    message_id: string;
    model: string;
    timestamp: string;
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens: number;
    cache_read_tokens: number;
    cost_usd: number;
    thinking_tokens: number;
    has_tool_use: number;
  }[];
}

export function getToolUsageSummary(filters: DashboardFilters): ToolUsageStat[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  return db.prepare(
    `SELECT
      tu.tool_name,
      COUNT(*) as count,
      AVG(tu.duration_ms) as avg_duration_ms,
      COALESCE(SUM(tu.total_tokens), 0) as total_tokens
     FROM tool_uses tu
     JOIN sessions s ON tu.session_id = s.session_id
     ${where}
     GROUP BY tu.tool_name
     ORDER BY count DESC`
  ).all(...params) as ToolUsageStat[];
}

export function getSessionToolUsage(sessionId: string): ToolUsageStat[] {
  const db = getDb();
  return db.prepare(
    `SELECT
      tool_name,
      COUNT(*) as count,
      AVG(duration_ms) as avg_duration_ms,
      COALESCE(SUM(total_tokens), 0) as total_tokens
     FROM tool_uses WHERE session_id = ?
     GROUP BY tool_name
     ORDER BY count DESC`
  ).all(sessionId) as ToolUsageStat[];
}

export function getCacheEfficiencySeries(filters: DashboardFilters) {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  return db.prepare(
    `SELECT
      date(s.started_at) as date,
      COALESCE(SUM(s.cache_read_tokens), 0) as cache_read,
      COALESCE(SUM(s.input_tokens), 0) as input_tokens
     FROM sessions s ${where}
     GROUP BY date(s.started_at)
     ORDER BY date`
  ).all(...params) as { date: string; cache_read: number; input_tokens: number }[];
}

export function getAllLabels(): string[] {
  const db = getDb();
  const rows = db.prepare("SELECT name FROM labels ORDER BY name").all() as { name: string }[];
  return rows.map((r) => r.name);
}

export function getAllProjects(): string[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT DISTINCT project_path FROM sessions ORDER BY project_path"
  ).all() as { project_path: string }[];
  return rows.map((r) => r.project_path);
}

export function getAllModels(): string[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT DISTINCT model FROM sessions WHERE model IS NOT NULL ORDER BY model"
  ).all() as { model: string }[];
  return rows.map((r) => r.model);
}
