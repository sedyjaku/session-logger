import { getDb } from "./db";
import type { DashboardFilters, DailyCostPoint } from "./types";

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

export interface BudgetStatus {
  monthTotal: number;
  monthSessions: number;
  dailySpend: DailyCostPoint[];
}

export interface PreviousMonthPace {
  totalAtSameDay: number;
  monthTotal: number;
  sessions: number;
}

export function getBudgetStatus(filters: DashboardFilters): BudgetStatus {
  const db = getDb();
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const monthStart = `${year}-${month}-01`;

  const baseConditions: string[] = [`${monthStart} <= date(s.started_at)`];
  const baseParams: unknown[] = [];

  const { where: filterWhere, params: filterParams } = buildFilter(filters);

  if (filterWhere) {
    const stripped = filterWhere.replace("WHERE ", "");
    baseConditions.push(stripped);
    baseParams.push(...filterParams);
  }

  const where = `WHERE ${baseConditions.join(" AND ")}`;
  const params = [...baseParams];

  const summary = db.prepare(
    `SELECT
      COALESCE(SUM(s.estimated_cost_usd), 0) as total_cost,
      COUNT(*) as sessions
     FROM sessions s ${where}`
  ).get(...params) as { total_cost: number; sessions: number };

  const dailySpend = db.prepare(
    `SELECT
      date(s.started_at) as date,
      COALESCE(SUM(s.estimated_cost_usd), 0) as cost,
      COUNT(*) as sessions
     FROM sessions s ${where}
     GROUP BY date(s.started_at)
     ORDER BY date`
  ).all(...params) as DailyCostPoint[];

  return {
    monthTotal: summary.total_cost,
    monthSessions: summary.sessions,
    dailySpend,
  };
}

export function getPreviousMonthPace(filters: DashboardFilters): PreviousMonthPace {
  const db = getDb();
  const now = new Date();
  const dayOfMonth = now.getDate();

  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYear = prevMonth.getFullYear();
  const prevMonthNum = String(prevMonth.getMonth() + 1).padStart(2, "0");
  const prevMonthStart = `${prevYear}-${prevMonthNum}-01`;

  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const prevMonthEndStr = prevMonthEnd.toISOString().split("T")[0];

  const prevPaceEnd = new Date(prevYear, prevMonth.getMonth(), Math.min(dayOfMonth, prevMonthEnd.getDate()));
  const prevPaceEndStr = prevPaceEnd.toISOString().split("T")[0];

  const { where: filterWhere, params: filterParams } = buildFilter(filters);
  const extraConditions = filterWhere ? filterWhere.replace("WHERE ", "") : "";

  const paceConditions = [
    `date(s.started_at) >= '${prevMonthStart}'`,
    `date(s.started_at) <= '${prevPaceEndStr}'`,
  ];
  if (extraConditions) paceConditions.push(extraConditions);

  const paceResult = db.prepare(
    `SELECT COALESCE(SUM(s.estimated_cost_usd), 0) as total_cost
     FROM sessions s WHERE ${paceConditions.join(" AND ")}`
  ).get(...filterParams) as { total_cost: number };

  const fullConditions = [
    `date(s.started_at) >= '${prevMonthStart}'`,
    `date(s.started_at) <= '${prevMonthEndStr}'`,
  ];
  if (extraConditions) fullConditions.push(extraConditions);

  const fullResult = db.prepare(
    `SELECT
      COALESCE(SUM(s.estimated_cost_usd), 0) as total_cost,
      COUNT(*) as sessions
     FROM sessions s WHERE ${fullConditions.join(" AND ")}`
  ).get(...filterParams) as { total_cost: number; sessions: number };

  return {
    totalAtSameDay: paceResult.total_cost,
    monthTotal: fullResult.total_cost,
    sessions: fullResult.sessions,
  };
}
