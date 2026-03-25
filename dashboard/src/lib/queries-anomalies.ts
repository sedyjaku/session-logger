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

export interface SessionAnomaly {
  session_id: string;
  project_path: string;
  model: string;
  estimated_cost_usd: number;
  started_at: string;
  message_count: number;
  tool_use_count: number;
  duration_seconds: number;
  active_seconds: number;
  end_reason: string | null;
  mean_cost: number;
  z_score: number;
}

export interface DailySpendAnomaly {
  date: string;
  cost: number;
  sessions: number;
  rolling_avg: number;
  is_anomaly: number;
}

export interface MessageCostSpike {
  message_id: string;
  session_id: string;
  model: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  avg_msg_cost: number;
  multiplier: number;
}

export interface AnomalySummary {
  anomalous_sessions: number;
  anomalous_days: number;
  cost_in_anomalies: number;
  anomaly_rate: number;
  avg_z_score: number;
}

export function getSessionAnomalies(filters: DashboardFilters): SessionAnomaly[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  const filterCondition = where ? where.replace("WHERE ", "AND ") : "";

  return db.prepare(
    `WITH stats AS (
      SELECT model, project_path,
        AVG(estimated_cost_usd) as mean_cost,
        AVG(estimated_cost_usd * estimated_cost_usd) - AVG(estimated_cost_usd) * AVG(estimated_cost_usd) as variance
      FROM sessions s
      WHERE estimated_cost_usd > 0 ${filterCondition}
      GROUP BY model, project_path
      HAVING COUNT(*) >= 3
    )
    SELECT s.session_id, s.project_path, s.model, s.estimated_cost_usd, s.started_at,
      s.message_count, s.tool_use_count, s.duration_seconds,
      COALESCE((SELECT SUM(se.duration_ms) / 1000.0 FROM session_events se WHERE se.session_id = s.session_id AND se.type = 'turn_duration'), 0) as active_seconds,
      s.end_reason,
      st.mean_cost,
      CASE WHEN st.variance > 0 THEN (s.estimated_cost_usd - st.mean_cost) / SQRT(st.variance) ELSE 0 END as z_score
    FROM sessions s
    JOIN stats st ON s.model = st.model AND s.project_path = st.project_path
    WHERE z_score > 2.0 ${filterCondition}
    ORDER BY z_score DESC`
  ).all(...params, ...params) as SessionAnomaly[];
}

export function getDailySpendAnomalies(filters: DashboardFilters): DailySpendAnomaly[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);

  return db.prepare(
    `WITH daily AS (
      SELECT
        date(s.started_at) as date,
        COALESCE(SUM(s.estimated_cost_usd), 0) as cost,
        COUNT(*) as sessions
      FROM sessions s ${where}
      GROUP BY date(s.started_at)
      ORDER BY date
    ),
    rolling AS (
      SELECT
        d.date,
        d.cost,
        d.sessions,
        (
          SELECT AVG(d2.cost)
          FROM daily d2
          WHERE d2.date >= date(d.date, '-7 days')
            AND d2.date < d.date
        ) as rolling_avg
      FROM daily d
    )
    SELECT
      date,
      cost,
      sessions,
      COALESCE(rolling_avg, cost) as rolling_avg,
      CASE WHEN rolling_avg > 0 AND cost > rolling_avg * 2 THEN 1 ELSE 0 END as is_anomaly
    FROM rolling
    ORDER BY date`
  ).all(...params) as DailySpendAnomaly[];
}

export function getMessageCostSpikes(filters: DashboardFilters): MessageCostSpike[] {
  const db = getDb();
  const { where, params } = buildFilter(filters);

  return db.prepare(
    `WITH session_avg AS (
      SELECT
        m.session_id,
        AVG(m.cost_usd) as avg_msg_cost
      FROM messages m
      JOIN sessions s ON m.session_id = s.session_id
      ${where}
      GROUP BY m.session_id
      HAVING COUNT(*) >= 2 AND avg_msg_cost > 0
    )
    SELECT
      m.message_id,
      m.session_id,
      m.model,
      m.cost_usd,
      m.input_tokens,
      m.output_tokens,
      m.thinking_tokens,
      sa.avg_msg_cost,
      m.cost_usd / sa.avg_msg_cost as multiplier
    FROM messages m
    JOIN session_avg sa ON m.session_id = sa.session_id
    JOIN sessions s ON m.session_id = s.session_id
    WHERE m.cost_usd > sa.avg_msg_cost * 3 ${where ? where.replace("WHERE ", "AND ") : ""}
    ORDER BY multiplier DESC
    LIMIT 50`
  ).all(...params, ...params) as MessageCostSpike[];
}

export function getAnomalySummary(filters: DashboardFilters): AnomalySummary {
  const db = getDb();
  const { where, params } = buildFilter(filters);
  const filterCondition = where ? where.replace("WHERE ", "AND ") : "";

  const sessionAnomalies = db.prepare(
    `WITH stats AS (
      SELECT model, project_path,
        AVG(estimated_cost_usd) as mean_cost,
        AVG(estimated_cost_usd * estimated_cost_usd) - AVG(estimated_cost_usd) * AVG(estimated_cost_usd) as variance
      FROM sessions s
      WHERE estimated_cost_usd > 0 ${filterCondition}
      GROUP BY model, project_path
      HAVING COUNT(*) >= 3
    )
    SELECT
      COUNT(*) as anomalous_sessions,
      COALESCE(SUM(s.estimated_cost_usd), 0) as cost_in_anomalies,
      COALESCE(AVG(CASE WHEN st.variance > 0 THEN (s.estimated_cost_usd - st.mean_cost) / SQRT(st.variance) ELSE 0 END), 0) as avg_z_score
    FROM sessions s
    JOIN stats st ON s.model = st.model AND s.project_path = st.project_path
    WHERE CASE WHEN st.variance > 0 THEN (s.estimated_cost_usd - st.mean_cost) / SQRT(st.variance) ELSE 0 END > 2.0
    ${filterCondition}`
  ).get(...params, ...params) as { anomalous_sessions: number; cost_in_anomalies: number; avg_z_score: number };

  const totalSessions = db.prepare(
    `SELECT COUNT(*) as cnt FROM sessions s ${where}`
  ).get(...params) as { cnt: number };

  const dailyAnomalies = db.prepare(
    `WITH daily AS (
      SELECT
        date(s.started_at) as date,
        COALESCE(SUM(s.estimated_cost_usd), 0) as cost
      FROM sessions s ${where}
      GROUP BY date(s.started_at)
    ),
    rolling AS (
      SELECT
        d.date,
        d.cost,
        (
          SELECT AVG(d2.cost)
          FROM daily d2
          WHERE d2.date >= date(d.date, '-7 days')
            AND d2.date < d.date
        ) as rolling_avg
      FROM daily d
    )
    SELECT COUNT(*) as cnt
    FROM rolling
    WHERE rolling_avg > 0 AND cost > rolling_avg * 2`
  ).get(...params) as { cnt: number };

  return {
    anomalous_sessions: sessionAnomalies.anomalous_sessions,
    anomalous_days: dailyAnomalies.cnt,
    cost_in_anomalies: sessionAnomalies.cost_in_anomalies,
    anomaly_rate: totalSessions.cnt > 0 ? sessionAnomalies.anomalous_sessions / totalSessions.cnt : 0,
    avg_z_score: sessionAnomalies.avg_z_score,
  };
}
