import { Suspense } from "react";
import { KpiCard } from "@/components/cards/kpi-card";
import { CostAreaChart } from "@/components/charts/cost-area-chart";
import { LabelBarChart } from "@/components/charts/label-bar-chart";
import {
  getSummary,
  getDailyCostByModel,
  getModelSummary,
  getCostByLabel,
  getCostByProject,
  getCrossSessionOutliers,
} from "@/lib/queries";
import { formatCost, formatTokens, shortSessionId, shortProjectPath } from "@/lib/format";
import { cacheSavingsUsd } from "@/lib/derived-metrics";
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

export default async function CostPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);

  let summary;
  let costByModel: { date: string; [key: string]: string | number }[] = [];
  let modelList: string[] = [];
  let labelData: { name: string; cost: number }[] = [];
  let projectData: { project_path: string; cost: number; sessions: number }[] = [];
  let modelSummary: Awaited<ReturnType<typeof getModelSummary>> = [];
  let outliers: Awaited<ReturnType<typeof getCrossSessionOutliers>> = [];
  let totalCacheSavings = 0;

  try {
    summary = getSummary(filters);

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

    modelSummary = getModelSummary(filters);
    totalCacheSavings = modelSummary.reduce(
      (sum, m) => sum + cacheSavingsUsd(m.cache_read_tokens, m.model),
      0
    );

    const labelStats = getCostByLabel(filters);
    labelData = labelStats.map((l) => ({ name: l.name, cost: l.total_cost }));

    projectData = getCostByProject(filters);
    outliers = getCrossSessionOutliers({ ...filters, limit: 20 });
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

  const avgMessageCost =
    summary.sessions > 0 ? summary.total_cost / summary.sessions : 0;

  return (
    <Suspense>
      <div className="space-y-6">
        <p className="text-sm text-[var(--muted-foreground)]">Detailed cost breakdown by model, label, and project. Includes token-level analysis and identifies the costliest individual messages.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            title="Total Cost"
            value={formatCost(summary.total_cost)}
            subtitle={`${summary.sessions} sessions`}
            accent="amber"
          />
          <KpiCard
            title="Cache Savings"
            value={formatCost(totalCacheSavings)}
            subtitle="estimated vs full-price input"
            accent="emerald"
          />
          <KpiCard
            title="Avg Cost / Session"
            value={formatCost(avgMessageCost)}
            subtitle="across all sessions"
            accent="blue"
          />
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Daily Cost by Model</h3>
          <CostAreaChart data={costByModel} models={modelList} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="mb-4 text-sm font-semibold">Cost by Label</h3>
            <LabelBarChart data={labelData} />
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="mb-4 text-sm font-semibold">Cost by Project</h3>
            {projectData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-[var(--muted-foreground)]">
                No project data
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                      <th className="pb-2 pr-4 font-medium">Project</th>
                      <th className="pb-2 pr-4 text-right font-medium">Cost</th>
                      <th className="pb-2 text-right font-medium">Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectData.map((p) => (
                      <tr key={p.project_path} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-2 pr-4">{shortProjectPath(p.project_path)}</td>
                        <td className="py-2 pr-4 text-right font-medium">{formatCost(p.cost)}</td>
                        <td className="py-2 text-right">{p.sessions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Token Breakdown by Model</h3>
          {modelSummary.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-[var(--muted-foreground)]">
              No model data
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Model</th>
                    <th className="pb-2 pr-4 text-right font-medium">Input</th>
                    <th className="pb-2 pr-4 text-right font-medium">Output</th>
                    <th className="pb-2 pr-4 text-right font-medium">Cache Create</th>
                    <th className="pb-2 pr-4 text-right font-medium">Cache Read</th>
                    <th className="pb-2 pr-4 text-right font-medium">Sessions</th>
                    <th className="pb-2 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {modelSummary.map((m) => (
                    <tr key={m.model} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2 pr-4 font-mono">{m.model}</td>
                      <td className="py-2 pr-4 text-right">{formatTokens(m.input_tokens)}</td>
                      <td className="py-2 pr-4 text-right">{formatTokens(m.output_tokens)}</td>
                      <td className="py-2 pr-4 text-right">{formatTokens(m.cache_creation_tokens)}</td>
                      <td className="py-2 pr-4 text-right">{formatTokens(m.cache_read_tokens)}</td>
                      <td className="py-2 pr-4 text-right">{m.sessions}</td>
                      <td className="py-2 text-right font-medium">{formatCost(m.total_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Costliest Messages</h3>
          {outliers.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-[var(--muted-foreground)]">
              No message data
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Session</th>
                    <th className="pb-2 pr-4 font-medium">Project</th>
                    <th className="pb-2 pr-4 font-medium">Model</th>
                    <th className="pb-2 pr-4 text-right font-medium">Input</th>
                    <th className="pb-2 pr-4 text-right font-medium">Output</th>
                    <th className="pb-2 pr-4 text-right font-medium">Cache Read</th>
                    <th className="pb-2 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {outliers.map((o, i) => (
                    <tr key={`${o.session_id}-${o.message_id}-${i}`} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2 pr-4">
                        <a
                          href={`/sessions/${o.session_id}`}
                          className="font-mono text-blue-500 hover:underline"
                        >
                          {shortSessionId(o.session_id)}
                        </a>
                      </td>
                      <td className="py-2 pr-4">{shortProjectPath(o.project_path)}</td>
                      <td className="py-2 pr-4">{o.model?.replace("claude-", "").replace(/-\d+.*/, "") || "?"}</td>
                      <td className="py-2 pr-4 text-right">{formatTokens(o.input_tokens)}</td>
                      <td className="py-2 pr-4 text-right">{formatTokens(o.output_tokens)}</td>
                      <td className="py-2 pr-4 text-right">{formatTokens(o.cache_read_tokens)}</td>
                      <td className="py-2 text-right font-medium">{formatCost(o.cost)}</td>
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
