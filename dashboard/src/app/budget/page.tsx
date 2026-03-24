import { Suspense } from "react";
import { KpiCard } from "@/components/cards/kpi-card";
import { BudgetGauge } from "@/components/charts/budget-gauge";
import { DailySpendChart } from "@/components/charts/daily-spend-chart";
import { getBudgetStatus, getPreviousMonthPace } from "@/lib/queries-budget";
import { projectedMonthlySpend } from "@/lib/derived-metrics";
import { formatCost } from "@/lib/format";
import type { DashboardFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseFilters(searchParams: Record<string, string | string[] | undefined>): DashboardFilters {
  return {
    days: searchParams.days ? Number(searchParams.days) : undefined,
    label: (searchParams.label as string) || undefined,
    project: (searchParams.project as string) || undefined,
    model: (searchParams.model as string) || undefined,
  };
}

function computeRollingAverage(dailyCosts: { date: string; cost: number }[], window: number): number {
  if (dailyCosts.length === 0) return 0;
  const slice = dailyCosts.slice(-window);
  return slice.reduce((sum, d) => sum + d.cost, 0) / slice.length;
}

function getDaysRemainingInMonth(now: Date): number {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return daysInMonth - now.getDate();
}

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);

  let budgetStatus;
  let previousMonth;

  try {
    budgetStatus = getBudgetStatus(filters);
    previousMonth = getPreviousMonthPace(filters);
  } catch {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium">No database found</p>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Run <code className="rounded bg-[var(--muted)] px-2 py-0.5">session-log doctor</code> to import sessions
          </p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const projected = projectedMonthlySpend(budgetStatus.dailySpend, now);
  const burnRate = computeRollingAverage(budgetStatus.dailySpend, 7);
  const daysRemaining = getDaysRemainingInMonth(now);

  const cumulativeData = budgetStatus.dailySpend.reduce<
    { date: string; cost: number; sessions: number; cumulative: number }[]
  >((acc, day) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].cumulative : 0;
    acc.push({ ...day, cumulative: prev + day.cost });
    return acc;
  }, []);

  const prevPaceDiff = budgetStatus.monthTotal - previousMonth.totalAtSameDay;
  const prevPacePct = previousMonth.totalAtSameDay > 0
    ? ((prevPaceDiff / previousMonth.totalAtSameDay) * 100)
    : 0;

  return (
    <Suspense>
      <div className="space-y-6">
        <p className="text-sm text-[var(--muted-foreground)]">Track your monthly AI spend against projections. Shows burn rate, daily breakdown, and month-over-month pace comparison.</p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            title="Month-to-Date Spend"
            value={formatCost(budgetStatus.monthTotal)}
            subtitle={`${budgetStatus.monthSessions} sessions`}
            accent="amber"
          />
          <KpiCard
            title="Projected Monthly Spend"
            value={projected !== null ? formatCost(projected) : "N/A"}
            subtitle={projected !== null ? "based on 7-day avg" : "not enough data"}
            accent="blue"
          />
          <KpiCard
            title="Daily Burn Rate"
            value={formatCost(burnRate)}
            subtitle="7-day rolling average"
            accent="red"
          />
          <KpiCard
            title="Days Remaining"
            value={daysRemaining.toString()}
            subtitle={`est. ${formatCost(burnRate * daysRemaining)} remaining`}
            accent="green"
          />
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Budget Progress</h3>
          {projected !== null ? (
            <BudgetGauge
              spent={budgetStatus.monthTotal}
              projected={projected}
            />
          ) : (
            <div className="flex h-16 items-center justify-center text-sm text-[var(--muted-foreground)]">
              Need at least 3 days of data to project
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Daily Spend</h3>
          <DailySpendChart data={budgetStatus.dailySpend} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="mb-4 text-sm font-semibold">Daily Spend Breakdown</h3>
            {cumulativeData.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-[var(--muted-foreground)]">
                No spend data this month
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                      <th className="pb-2 pr-4 font-medium">Date</th>
                      <th className="pb-2 pr-4 text-right font-medium">Cost</th>
                      <th className="pb-2 pr-4 text-right font-medium">Sessions</th>
                      <th className="pb-2 text-right font-medium">Cumulative</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cumulativeData.map((d) => (
                      <tr key={d.date} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-2 pr-4 font-mono">{d.date}</td>
                        <td className="py-2 pr-4 text-right font-medium">{formatCost(d.cost)}</td>
                        <td className="py-2 pr-4 text-right">{d.sessions}</td>
                        <td className="py-2 text-right font-medium">{formatCost(d.cumulative)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="mb-4 text-sm font-semibold">Spend Pace Comparison</h3>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-[var(--muted)] p-4">
                  <p className="text-xs font-medium text-[var(--muted-foreground)]">This Month (to date)</p>
                  <p className="mt-1 text-2xl font-bold">{formatCost(budgetStatus.monthTotal)}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {budgetStatus.monthSessions} sessions
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--muted)] p-4">
                  <p className="text-xs font-medium text-[var(--muted-foreground)]">Last Month (same day)</p>
                  <p className="mt-1 text-2xl font-bold">{formatCost(previousMonth.totalAtSameDay)}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    full month: {formatCost(previousMonth.monthTotal)}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Pace Difference</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      prevPaceDiff <= 0
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    }`}
                  >
                    {prevPaceDiff >= 0 ? "+" : ""}
                    {previousMonth.totalAtSameDay > 0
                      ? `${prevPacePct.toFixed(1)}%`
                      : "N/A"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                  {prevPaceDiff > 0
                    ? `Spending ${formatCost(prevPaceDiff)} more than last month at this point`
                    : prevPaceDiff < 0
                      ? `Spending ${formatCost(Math.abs(prevPaceDiff))} less than last month at this point`
                      : "On par with last month"}
                </p>
              </div>

              {previousMonth.monthTotal > 0 && projected !== null && (
                <div className="rounded-lg border border-[var(--border)] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Projected vs Last Month</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        projected <= previousMonth.monthTotal
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }`}
                    >
                      {projected > previousMonth.monthTotal ? "+" : ""}
                      {(((projected - previousMonth.monthTotal) / previousMonth.monthTotal) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                    Projected {formatCost(projected)} vs {formatCost(previousMonth.monthTotal)} last month
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Suspense>
  );
}
