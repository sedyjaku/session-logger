import { Suspense } from "react";
import { KpiCard } from "@/components/cards/kpi-card";
import { ToolTrendChart } from "@/components/charts/tool-trend-chart";
import {
  getToolKpis,
  getToolOverview,
  getToolTrend,
  getToolFailureDetails,
  getToolDurationOutliers,
  getToolSequences,
} from "@/lib/queries-tools";
import { formatPercent, formatTokens, shortSessionId } from "@/lib/format";
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

function formatMs(ms: number | null): string {
  if (ms === null || ms === 0) return "-";
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

export default async function ToolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);

  let kpis;
  let overview;
  let trendChartData: { date: string; [key: string]: string | number }[] = [];
  let trendToolList: string[] = [];
  let failureDetails;
  let outliers;
  let sequences;

  try {
    kpis = getToolKpis(filters);
    overview = getToolOverview(filters);

    const rawTrend = getToolTrend(filters);
    const toolCounts = new Map<string, number>();
    for (const row of rawTrend) {
      toolCounts.set(row.tool_name, (toolCounts.get(row.tool_name) || 0) + row.count);
    }
    const sortedTools = Array.from(toolCounts.entries())
      .sort((a, b) => b[1] - a[1]);
    const top6 = sortedTools.slice(0, 6).map(([name]) => name);
    const hasOther = sortedTools.length > 6;
    trendToolList = hasOther ? [...top6, "Other"] : top6;

    const dateMap = new Map<string, Record<string, number>>();
    for (const row of rawTrend) {
      const entry = dateMap.get(row.date) || {};
      const key = top6.includes(row.tool_name) ? row.tool_name : "Other";
      entry[key] = (entry[key] || 0) + row.count;
      dateMap.set(row.date, entry);
    }
    trendChartData = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, tools]) => ({ date, ...tools }));

    failureDetails = getToolFailureDetails(filters);
    outliers = getToolDurationOutliers(filters);
    sequences = getToolSequences(filters);
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

  return (
    <Suspense>
      <div className="space-y-6">
        <p className="text-sm text-[var(--muted-foreground)]">Analyze which tools Claude uses most, their failure rates, execution duration outliers, and common tool-to-tool workflow sequences.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <KpiCard
            title="Total Tool Calls"
            value={kpis.totalCalls.toLocaleString()}
            subtitle="across all sessions"
            accent="blue"
          />
          <KpiCard
            title="Unique Tools Used"
            value={kpis.uniqueTools.toString()}
            subtitle="distinct tool names"
            accent="emerald"
          />
          <KpiCard
            title="Overall Failure Rate"
            value={formatPercent(kpis.overallFailureRate)}
            subtitle={kpis.overallFailureRate > 0.1 ? "above 10% threshold" : "of all tool calls"}
            accent={kpis.overallFailureRate > 0.1 ? "red" : "green"}
          />
          <KpiCard
            title="Avg Duration"
            value={formatMs(kpis.avgDurationMs)}
            subtitle="per tool call"
            accent="amber"
          />
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Tool Overview</h3>
          {overview.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-[var(--muted-foreground)]">
              No tool usage data
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Tool Name</th>
                    <th className="pb-2 pr-4 text-right font-medium">Calls</th>
                    <th className="pb-2 pr-4 text-right font-medium">Avg Duration</th>
                    <th className="pb-2 pr-4 text-right font-medium">Total Tokens</th>
                    <th className="pb-2 pr-4 text-right font-medium">Success</th>
                    <th className="pb-2 pr-4 text-right font-medium">Failures</th>
                    <th className="pb-2 text-right font-medium">Failure Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.map((t) => (
                    <tr key={t.tool_name} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2 pr-4 font-mono">{t.tool_name}</td>
                      <td className="py-2 pr-4 text-right">{t.total_count.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right">{formatMs(t.avg_duration_ms)}</td>
                      <td className="py-2 pr-4 text-right">{formatTokens(t.total_tokens)}</td>
                      <td className="py-2 pr-4 text-right">{t.success_count.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right">{t.failure_count.toLocaleString()}</td>
                      <td className={`py-2 text-right font-medium ${t.failure_rate > 0.1 ? "text-red-500" : ""}`}>
                        {formatPercent(t.failure_rate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Tool Usage Trend</h3>
          <ToolTrendChart data={trendChartData} tools={trendToolList} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="mb-4 text-sm font-semibold">Tool Failure Hotspots</h3>
            {failureDetails.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-[var(--muted-foreground)]">
                No tool failures recorded
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                      <th className="pb-2 pr-4 font-medium">Tool Name</th>
                      <th className="pb-2 pr-4 text-right font-medium">Total</th>
                      <th className="pb-2 pr-4 text-right font-medium">Failures</th>
                      <th className="pb-2 pr-4 text-right font-medium">Failure Rate</th>
                      <th className="pb-2 pr-4 text-right font-medium">Avg Fail Duration</th>
                      <th className="pb-2 text-right font-medium">Avg Success Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failureDetails.map((t) => (
                      <tr key={t.tool_name} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-2 pr-4 font-mono">{t.tool_name}</td>
                        <td className="py-2 pr-4 text-right">{t.total.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right">{t.failures.toLocaleString()}</td>
                        <td className={`py-2 pr-4 text-right font-medium ${t.failure_rate > 0.1 ? "text-red-500" : ""}`}>
                          {formatPercent(t.failure_rate)}
                        </td>
                        <td className="py-2 pr-4 text-right">{formatMs(t.avg_fail_duration_ms)}</td>
                        <td className="py-2 text-right">{formatMs(t.avg_success_duration_ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="mb-4 text-sm font-semibold">Tool Sequences</h3>
            {sequences.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-[var(--muted-foreground)]">
                No sequence data
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                      <th className="pb-2 pr-4 font-medium">From</th>
                      <th className="pb-2 pr-4 font-medium">To</th>
                      <th className="pb-2 text-right font-medium">Frequency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sequences.map((s, i) => (
                      <tr key={`${s.from_tool}-${s.to_tool}-${i}`} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-2 pr-4 font-mono">{s.from_tool}</td>
                        <td className="py-2 pr-4 font-mono">{s.to_tool}</td>
                        <td className="py-2 text-right font-medium">{s.freq.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Duration Outliers (P99+)</h3>
          {outliers.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-[var(--muted-foreground)]">
              No outlier data
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Tool</th>
                    <th className="pb-2 pr-4 font-medium">Session</th>
                    <th className="pb-2 pr-4 text-right font-medium">Duration</th>
                    <th className="pb-2 pr-4 text-right font-medium">Tokens</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {outliers.map((o, i) => (
                    <tr key={`${o.session_id}-${o.tool_name}-${i}`} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2 pr-4 font-mono">{o.tool_name}</td>
                      <td className="py-2 pr-4">
                        <a
                          href={`/sessions/${o.session_id}`}
                          className="font-mono text-blue-500 hover:underline"
                        >
                          {shortSessionId(o.session_id)}
                        </a>
                      </td>
                      <td className="py-2 pr-4 text-right font-medium">{formatMs(o.duration_ms)}</td>
                      <td className="py-2 pr-4 text-right">{formatTokens(o.total_tokens)}</td>
                      <td className={`py-2 ${o.status === "error" ? "text-red-500" : ""}`}>
                        {o.status || "success"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Suspense>
  );
}
