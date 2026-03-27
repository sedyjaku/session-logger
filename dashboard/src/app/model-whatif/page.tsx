import { Suspense } from "react";
import { KpiCard } from "@/components/cards/kpi-card";
import { SavingsBarChart } from "@/components/charts/savings-bar-chart";
import { getSessionsByModel, getModelComparison } from "@/lib/queries-model-whatif";
import { computeSavings, repriceSession } from "@/lib/model-whatif";
import { formatCost, formatTokens, shortSessionId, shortProjectPath } from "@/lib/format";
import { thinkingRatio } from "@/lib/derived-metrics";
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

export default async function ModelWhatIfPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);

  let sessions;
  let comparison;
  let savings;

  try {
    sessions = getSessionsByModel(filters);
    comparison = getModelComparison(filters);
    savings = computeSavings(sessions);
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

  const potentialSavings = savings.total_actual - savings.total_if_sonnet;
  const opusSessions = savings.breakdown.length;

  const chartData = comparison.map((m) => {
    const sonnetCost = sessions
      .filter((s) => s.model === m.model)
      .reduce((sum, s) => sum + repriceSession(s, "claude-sonnet-4-6"), 0);
    return {
      model: m.model,
      actual: m.total_cost,
      ifSonnet: sonnetCost,
    };
  });

  const downgradeCandidates = savings.breakdown.filter(
    (s) => s.thinking_tokens < 2000 && s.message_count < 20
  );

  return (
    <Suspense>
      <div className="space-y-6">
        <p className="text-sm text-[var(--muted-foreground)]">Compare actual model costs against hypothetical alternatives. See how much you'd save by running Opus sessions on Sonnet or Haiku instead.</p>
        <h1 className="text-xl font-bold">Model What-If Simulator</h1>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total Actual Spend"
            value={formatCost(savings.total_actual)}
            subtitle="across all models"
            accent="amber"
          />
          <KpiCard
            title="If All Sonnet"
            value={formatCost(savings.total_if_sonnet)}
            subtitle="hypothetical total"
            accent="blue"
          />
          <KpiCard
            title="Potential Savings"
            value={formatCost(potentialSavings)}
            subtitle="actual minus if-sonnet"
            accent="emerald"
          />
          <KpiCard
            title="Opus Sessions"
            value={String(opusSessions)}
            subtitle="could potentially downgrade"
            accent="red"
          />
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Model Comparison</h3>
          {comparison.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-[var(--muted-foreground)]">
              No model data found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                    <th className="pb-3 pr-4 font-medium">Model</th>
                    <th className="pb-3 pr-4 text-right font-medium">Sessions</th>
                    <th className="pb-3 pr-4 text-right font-medium">Avg Cost/Session</th>
                    <th className="pb-3 pr-4 text-right font-medium">Avg Messages</th>
                    <th className="pb-3 pr-4 text-right font-medium">Avg Tool Uses</th>
                    <th className="pb-3 pr-4 text-right font-medium">Thinking Ratio</th>
                    <th className="pb-3 text-right font-medium">Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((m) => (
                    <tr key={m.model} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-3 pr-4 font-medium">{m.model}</td>
                      <td className="py-3 pr-4 text-right">{m.sessions}</td>
                      <td className="py-3 pr-4 text-right">{formatCost(m.avg_cost)}</td>
                      <td className="py-3 pr-4 text-right">{Math.round(m.avg_messages)}</td>
                      <td className="py-3 pr-4 text-right">{Math.round(m.avg_tool_uses)}</td>
                      <td className="py-3 pr-4 text-right">
                        {(thinkingRatio(m.total_thinking_tokens, m.total_output_tokens) * 100).toFixed(1)}%
                      </td>
                      <td className="py-3 text-right font-medium">{formatCost(m.total_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">What-If Breakdown (Opus Sessions)</h3>
          {savings.breakdown.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-[var(--muted-foreground)]">
              No Opus sessions found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Session</th>
                    <th className="pb-2 pr-4 font-medium">Project</th>
                    <th className="pb-2 pr-4 text-right font-medium">Actual Cost</th>
                    <th className="pb-2 pr-4 text-right font-medium">If Sonnet</th>
                    <th className="pb-2 pr-4 text-right font-medium">If Haiku</th>
                    <th className="pb-2 pr-4 text-right font-medium">Savings</th>
                    <th className="pb-2 pr-4 text-right font-medium">Thinking</th>
                    <th className="pb-2 text-right font-medium">Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {savings.breakdown.map((s) => (
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
                      <td className="py-2 pr-4 text-right font-medium">{formatCost(s.actual_cost)}</td>
                      <td className="py-2 pr-4 text-right">{formatCost(s.if_sonnet)}</td>
                      <td className="py-2 pr-4 text-right">{formatCost(s.if_haiku)}</td>
                      <td className="py-2 pr-4 text-right font-medium text-emerald-500">
                        {formatCost(s.savings_sonnet)}
                      </td>
                      <td className="py-2 pr-4 text-right">{formatTokens(s.thinking_tokens)}</td>
                      <td className="py-2 text-right">{s.message_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Savings Summary by Model</h3>
          <SavingsBarChart data={chartData} />
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Downgrade Candidates</h3>
          <p className="mb-4 text-xs text-[var(--muted-foreground)]">
            Opus sessions with fewer than 2,000 thinking tokens and fewer than 20 messages — simple tasks that likely
            don&apos;t need Opus.
          </p>
          {downgradeCandidates.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-[var(--muted-foreground)]">
              No downgrade candidates found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Session</th>
                    <th className="pb-2 pr-4 font-medium">Project</th>
                    <th className="pb-2 pr-4 text-right font-medium">Actual Cost</th>
                    <th className="pb-2 pr-4 text-right font-medium">If Sonnet</th>
                    <th className="pb-2 pr-4 text-right font-medium">Savings</th>
                    <th className="pb-2 pr-4 text-right font-medium">Thinking</th>
                    <th className="pb-2 pr-4 text-right font-medium">Messages</th>
                    <th className="pb-2 font-medium">Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {downgradeCandidates.map((s) => (
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
                      <td className="py-2 pr-4 text-right font-medium">{formatCost(s.actual_cost)}</td>
                      <td className="py-2 pr-4 text-right">{formatCost(s.if_sonnet)}</td>
                      <td className="py-2 pr-4 text-right font-medium text-emerald-500">
                        {formatCost(s.savings_sonnet)}
                      </td>
                      <td className="py-2 pr-4 text-right">{formatTokens(s.thinking_tokens)}</td>
                      <td className="py-2 pr-4 text-right">{s.message_count}</td>
                      <td className="py-2">
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          Recommended for Sonnet
                        </span>
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
