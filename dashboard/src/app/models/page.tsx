import { Suspense } from "react";
import { getModelSummary, getDailyCostByModel, getCacheEfficiencySeries } from "@/lib/queries";
import { formatCost, formatTokens, formatPercent } from "@/lib/format";
import { cacheHitRatio } from "@/lib/derived-metrics";
import type { DashboardFilters } from "@/lib/types";
import { CostAreaChart } from "@/components/charts/cost-area-chart";
import { CacheEfficiencyChart } from "@/components/charts/cache-efficiency-chart";

export const dynamic = "force-dynamic";

function parseFilters(searchParams: Record<string, string | string[] | undefined>): DashboardFilters {
  return {
    days: searchParams.days ? Number(searchParams.days) : 30,
    label: (searchParams.label as string) || undefined,
    project: (searchParams.project as string) || undefined,
    model: (searchParams.model as string) || undefined,
  };
}

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);

  let models;
  let costByModel: { date: string; [key: string]: string | number }[] = [];
  let modelList: string[] = [];
  let cacheData: { date: string; ratio: number }[] = [];

  try {
    models = getModelSummary(filters);

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
    costByModel = Array.from(dateMap.entries()).map(([date, m]) => ({
      date,
      ...m,
    }));

    const rawCache = getCacheEfficiencySeries(filters);
    cacheData = rawCache.map((d) => ({
      date: d.date,
      ratio: cacheHitRatio(d.cache_read, d.input_tokens),
    }));
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
        <h1 className="text-xl font-bold">Models</h1>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {models.map((m) => {
            const avgCost = m.sessions > 0 ? m.total_cost / m.sessions : 0;
            return (
              <div
                key={m.model}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5"
              >
                <p className="text-sm font-semibold">{m.model}</p>
                <p className="mt-3 text-2xl font-bold tracking-tight">{formatCost(m.total_cost)}</p>
                <div className="mt-2 flex items-center gap-4 text-xs text-[var(--muted-foreground)]">
                  <span>{m.sessions} sessions</span>
                  <span>{formatCost(avgCost)}/session</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Cost Over Time by Model</h3>
          <CostAreaChart data={costByModel} models={modelList} />
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Model Breakdown</h3>
          {models.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-[var(--muted-foreground)]">
              No model data found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                    <th className="pb-3 pr-4 font-medium">Model</th>
                    <th className="pb-3 pr-4 text-right font-medium">Sessions</th>
                    <th className="pb-3 pr-4 text-right font-medium">Input Tokens</th>
                    <th className="pb-3 pr-4 text-right font-medium">Output Tokens</th>
                    <th className="pb-3 pr-4 text-right font-medium">Cache Create</th>
                    <th className="pb-3 pr-4 text-right font-medium">Cache Read</th>
                    <th className="pb-3 pr-4 text-right font-medium">Total Cost</th>
                    <th className="pb-3 text-right font-medium">Cache Hit Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
                    <tr key={m.model} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-3 pr-4 font-medium">{m.model}</td>
                      <td className="py-3 pr-4 text-right">{m.sessions}</td>
                      <td className="py-3 pr-4 text-right">{formatTokens(m.input_tokens)}</td>
                      <td className="py-3 pr-4 text-right">{formatTokens(m.output_tokens)}</td>
                      <td className="py-3 pr-4 text-right">{formatTokens(m.cache_creation_tokens)}</td>
                      <td className="py-3 pr-4 text-right">{formatTokens(m.cache_read_tokens)}</td>
                      <td className="py-3 pr-4 text-right font-medium">{formatCost(m.total_cost)}</td>
                      <td className="py-3 text-right">
                        {formatPercent(cacheHitRatio(m.cache_read_tokens, m.input_tokens))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Cache Efficiency Over Time</h3>
          <CacheEfficiencyChart data={cacheData} />
        </div>
      </div>
    </Suspense>
  );
}
