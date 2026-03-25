import { Suspense } from "react";
import {
  getLabelDetailedStats,
  getProjectDetailedStats,
  getLabelDailyCost,
  getProjectDailyCost,
  getLabelOutlierSessions,
  getProjectOutlierSessions,
  getExpensiveLabels,
  getExpensiveProjects,
  getLabelKpis,
  buildSparklineData,
} from "@/lib/queries-labels";
import { formatCost, formatTokens, formatDuration, formatRelativeDate, shortProjectPath } from "@/lib/format";
import type { DashboardFilters } from "@/lib/types";
import { ViewToggle } from "@/components/filters/view-toggle";
import { KpiCard } from "@/components/cards/kpi-card";
import { LabelSparkline } from "@/components/charts/label-sparkline";
import { TrendIndicator } from "@/components/cards/trend-indicator";

export const dynamic = "force-dynamic";

function parseFilters(searchParams: Record<string, string | string[] | undefined>): DashboardFilters {
  return {
    days: searchParams.days ? Number(searchParams.days) : undefined,
    label: (searchParams.label as string) || undefined,
    project: (searchParams.project as string) || undefined,
    model: (searchParams.model as string) || undefined,
  };
}

const SPARKLINE_COLORS = ["#0EA5E9", "#F59E0B", "#10B981", "#8B5CF6", "#EF4444", "#EC4899"];

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const view = (params.view as string) || "Labels";
  const isLabels = view === "Labels";
  const entityName = isLabels ? "Label" : "Project";

  let stats: (ReturnType<typeof getLabelDetailedStats> | ReturnType<typeof getProjectDetailedStats>);
  let dailyCost: ReturnType<typeof getLabelDailyCost>;
  let outlierSessions: (ReturnType<typeof getLabelOutlierSessions> | ReturnType<typeof getProjectOutlierSessions>);
  let expensiveItems: (ReturnType<typeof getExpensiveLabels> | ReturnType<typeof getExpensiveProjects>);

  try {
    stats = isLabels ? getLabelDetailedStats(filters) : getProjectDetailedStats(filters);
    dailyCost = isLabels ? getLabelDailyCost(filters) : getProjectDailyCost(filters);
    outlierSessions = isLabels ? getLabelOutlierSessions(filters) : getProjectOutlierSessions(filters);
    expensiveItems = isLabels ? getExpensiveLabels(filters) : getExpensiveProjects(filters);
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

  const kpis = getLabelKpis(stats);
  const sparklineEntries = buildSparklineData(dailyCost);

  const topOutliers = outlierSessions.slice(0, 8);
  const topExpensive = expensiveItems.slice(0, 8);
  const hasOutlierSection = topOutliers.length > 0 || topExpensive.length > 0;

  return (
    <Suspense>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Labels &amp; Projects</h1>
          <ViewToggle options={["Labels", "Projects"]} current={view} />
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard
            title={`Avg Cost per ${entityName}`}
            value={formatCost(kpis.avgCost)}
            accent="blue"
          />
          <KpiCard
            title={`Median Cost per ${entityName}`}
            value={formatCost(kpis.medianCost)}
            accent="green"
          />
          <KpiCard
            title="Max Session Cost"
            value={formatCost(kpis.maxCost)}
            accent="red"
          />
          <KpiCard
            title="Min Session Cost"
            value={formatCost(kpis.minCost)}
            accent="amber"
          />
        </div>

        {sparklineEntries.length > 0 && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="mb-3 text-sm font-semibold text-[var(--muted-foreground)]">
              Most Active (Last 7 Days)
            </h3>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {sparklineEntries.map((entry, i) => (
                <div key={entry.name} className="flex items-center gap-3 rounded-md border border-[var(--border)] p-3">
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-medium"
                      title={entry.name}
                    >
                      {isLabels ? entry.name : shortProjectPath(entry.name)}
                    </p>
                    <div className="my-1">
                      <LabelSparkline
                        data={entry.points}
                        color={SPARKLINE_COLORS[i % SPARKLINE_COLORS.length]}
                      />
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {formatCost(entry.total)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasOutlierSection && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
              <h3 className="mb-3 text-sm font-semibold text-[var(--muted-foreground)]">
                Outlier Sessions (&gt; 2x {entityName} Avg)
              </h3>
              {topOutliers.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">No outliers found</p>
              ) : (
                <div className="space-y-2">
                  {topOutliers.map((o) => {
                    const name = "label_name" in o ? o.label_name : shortProjectPath(o.project_path);
                    const avg = "label_avg" in o ? o.label_avg : o.project_avg;
                    return (
                      <a
                        key={o.session_id}
                        href={`/sessions/${o.session_id}`}
                        className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-[var(--muted)]"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-medium">{name}</span>
                          <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                            {formatRelativeDate(o.started_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-right">
                          <span className="font-medium text-red-500">{formatCost(o.cost)}</span>
                          <span className="text-xs text-[var(--muted-foreground)]">avg {formatCost(avg)}</span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
              <h3 className="mb-3 text-sm font-semibold text-[var(--muted-foreground)]">
                Globally Expensive {isLabels ? "Labels" : "Projects"} (&gt; 2x Global Avg)
              </h3>
              {topExpensive.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">None above threshold</p>
              ) : (
                <div className="space-y-2">
                  {topExpensive.map((e) => {
                    const name = "name" in e ? e.name : shortProjectPath(e.project_path);
                    const key = "name" in e ? e.name : e.project_path;
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-medium" title={"project_path" in e ? e.project_path : undefined}>
                            {name}
                          </span>
                          <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                            {e.session_count} sessions
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-right">
                          <span className="font-medium text-amber-500">{formatCost(e.avg_cost)}</span>
                          <span className="text-xs text-[var(--muted-foreground)]">{e.ratio.toFixed(1)}x</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          {stats.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-[var(--muted-foreground)]">
              No {isLabels ? "labels" : "projects"} found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                    <th className="pb-3 pr-4 font-medium">{entityName}</th>
                    <th className="pb-3 pr-4 text-right font-medium">Sessions</th>
                    <th className="pb-3 pr-4 text-center font-medium">Trend</th>
                    <th className="pb-3 pr-4 text-right font-medium">Total Cost</th>
                    <th className="pb-3 pr-4 text-right font-medium">Avg</th>
                    <th className="pb-3 pr-4 text-right font-medium">Median</th>
                    <th className="pb-3 pr-4 text-right font-medium">Min</th>
                    <th className="pb-3 pr-4 text-right font-medium">Max</th>
                    <th className="pb-3 pr-4 text-right font-medium">Tokens</th>
                    <th className="pb-3 pr-4 text-right font-medium">Duration</th>
                    <th className="pb-3 text-right font-medium">Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((row) => {
                    const name = "name" in row ? row.name : row.project_path;
                    const displayName = "name" in row ? row.name : shortProjectPath(row.project_path);
                    return (
                      <tr key={name} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]">
                        <td
                          className="py-3 pr-4 font-medium"
                          title={"project_path" in row ? row.project_path : undefined}
                        >
                          {displayName}
                        </td>
                        <td className="py-3 pr-4 text-right">{row.session_count}</td>
                        <td className="py-3 pr-4 text-center">
                          <TrendIndicator recent={row.recent_sessions} older={row.older_sessions} />
                        </td>
                        <td className="py-3 pr-4 text-right font-bold">{formatCost(row.total_cost)}</td>
                        <td className="py-3 pr-4 text-right">{formatCost(row.avg_cost)}</td>
                        <td className="py-3 pr-4 text-right">{formatCost(row.median_cost)}</td>
                        <td className="py-3 pr-4 text-right">{formatCost(row.min_cost)}</td>
                        <td className="py-3 pr-4 text-right">{formatCost(row.max_cost)}</td>
                        <td className="py-3 pr-4 text-right">{formatTokens(row.total_tokens)}</td>
                        <td className="py-3 pr-4 text-right">{formatDuration(row.total_duration)}</td>
                        <td className="py-3 text-right text-[var(--muted-foreground)]">
                          {formatRelativeDate(row.last_active)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Suspense>
  );
}
