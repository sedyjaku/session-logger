import { Suspense } from "react";
import { KpiCard } from "@/components/cards/kpi-card";
import { CostAreaChart } from "@/components/charts/cost-area-chart";
import { ModelDonutChart } from "@/components/charts/model-donut-chart";
import { LabelBarChart } from "@/components/charts/label-bar-chart";
import {
  getKpiData,
  getDailyCostByModel,
  getModelSummary,
  getCostByLabel,
  listSessions,
} from "@/lib/queries";
import { formatCost, formatPercent, formatDelta, formatTokens, formatDate, formatDuration, shortSessionId, shortProjectPath } from "@/lib/format";
import { cacheHitRatio, thinkingRatio } from "@/lib/derived-metrics";
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

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);

  let kpi;
  let costByModel: { date: string; [key: string]: string | number }[] = [];
  let modelList: string[] = [];
  let modelDonutData: { name: string; value: number }[] = [];
  let labelData: { name: string; cost: number }[] = [];
  let recentSessions;

  try {
    kpi = getKpiData(filters);

    const rawCostByModel = getDailyCostByModel(filters);
    const modelsSet = new Set<string>();
    const dateMap = new Map<string, Record<string, number>>();
    for (const row of rawCostByModel) {
      modelsSet.add(row.model);
      const entry = dateMap.get(row.date) || {};
      entry[row.model] = (entry[row.model] || 0) + row.cost;
      dateMap.set(row.date, entry);
    }
    modelList = Array.from(modelsSet);
    costByModel = Array.from(dateMap.entries()).map(([date, models]) => ({
      date,
      ...models,
    }));

    const modelSummary = getModelSummary(filters);
    modelDonutData = modelSummary.map((m) => ({ name: m.model, value: m.total_cost }));

    const labelStats = getCostByLabel(filters);
    labelData = labelStats.map((l) => ({ name: l.name, cost: l.total_cost }));

    recentSessions = listSessions({ ...filters, limit: 10 });
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

  const costDelta = formatDelta(kpi.current.total_cost, kpi.previous.total_cost);
  const sessionDelta = formatDelta(kpi.current.sessions, kpi.previous.sessions);
  const avgCost = kpi.current.sessions > 0 ? kpi.current.total_cost / kpi.current.sessions : 0;
  const prevAvgCost = kpi.previous.sessions > 0 ? kpi.previous.total_cost / kpi.previous.sessions : 0;
  const avgCostDelta = formatDelta(avgCost, prevAvgCost);
  const cacheRatio = cacheHitRatio(kpi.current.cache_read_tokens, kpi.current.input_tokens);
  const thinkRatio = thinkingRatio(kpi.totalThinkingTokens, kpi.current.output_tokens);
  const unlabeledPct = kpi.totalCount > 0 ? kpi.unlabeledCount / kpi.totalCount : 0;

  return (
    <Suspense>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            title="Total Spend"
            value={formatCost(kpi.current.total_cost)}
            delta={costDelta}
            subtitle="vs prior period"
            accent="amber"
          />
          <KpiCard
            title="Sessions"
            value={kpi.current.sessions.toString()}
            delta={sessionDelta}
            subtitle="vs prior period"
            accent="blue"
          />
          <KpiCard
            title="Avg Cost/Session"
            value={formatCost(avgCost)}
            delta={avgCostDelta}
            subtitle="vs prior period"
          />
          <KpiCard
            title="Cache Hit Ratio"
            value={formatPercent(cacheRatio)}
            accent="emerald"
          />
          <KpiCard
            title="Unlabeled"
            value={formatPercent(unlabeledPct)}
            subtitle={`${kpi.unlabeledCount} of ${kpi.totalCount}`}
            accent={unlabeledPct > 0.3 ? "red" : "green"}
          />
          <KpiCard
            title="Thinking Ratio"
            value={`${thinkRatio.toFixed(1)}x`}
            subtitle={formatTokens(kpi.totalThinkingTokens) + " tokens"}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 lg:col-span-2">
            <h3 className="mb-4 text-sm font-semibold">Cost Over Time</h3>
            <CostAreaChart data={costByModel} models={modelList} />
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="mb-4 text-sm font-semibold">Cost by Model</h3>
            <ModelDonutChart data={modelDonutData} />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="mb-4 text-sm font-semibold">Cost by Label</h3>
            <LabelBarChart data={labelData} />
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="mb-4 text-sm font-semibold">Recent Sessions</h3>
            {!recentSessions || recentSessions.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-[var(--muted-foreground)]">
                No sessions found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                      <th className="pb-2 pr-4 font-medium">Session</th>
                      <th className="pb-2 pr-4 font-medium">Project</th>
                      <th className="pb-2 pr-4 font-medium">Model</th>
                      <th className="pb-2 pr-4 font-medium">Duration</th>
                      <th className="pb-2 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSessions.map((s) => (
                      <tr key={s.session_id} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-2 pr-4">
                          <a
                            href={`/sessions/${s.session_id}`}
                            className="font-mono text-blue-500 hover:underline"
                          >
                            {shortSessionId(s.session_id)}
                          </a>
                        </td>
                        <td className="py-2 pr-4">{shortProjectPath(s.project_path)}</td>
                        <td className="py-2 pr-4">{s.model?.replace("claude-", "").replace(/-\d+.*/, "") || "?"}</td>
                        <td className="py-2 pr-4">{formatDuration(s.duration_seconds)}</td>
                        <td className="py-2 text-right font-medium">{formatCost(s.estimated_cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </Suspense>
  );
}
