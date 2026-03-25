import { Suspense } from "react";
import { KpiCard } from "@/components/cards/kpi-card";
import { AnomalySpendChart } from "@/components/charts/anomaly-spend-chart";
import {
  getSessionAnomalies,
  getDailySpendAnomalies,
  getMessageCostSpikes,
  getAnomalySummary,
} from "@/lib/queries-anomalies";
import {
  formatCost,
  formatPercent,
  formatDate,
  formatDuration,
  formatActiveTime,
  formatTokens,
  shortSessionId,
  shortProjectPath,
} from "@/lib/format";
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

function zScoreColor(z: number): string {
  if (z > 4) return "text-red-500";
  if (z > 3) return "text-orange-500";
  return "text-yellow-500";
}

export default async function AnomaliesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);

  let summary;
  let sessionAnomalies;
  let dailyAnomalies;
  let messageSpikes;

  try {
    summary = getAnomalySummary(filters);
    sessionAnomalies = getSessionAnomalies(filters);
    dailyAnomalies = getDailySpendAnomalies(filters);
    messageSpikes = getMessageCostSpikes(filters);
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
        <p className="text-sm text-[var(--muted-foreground)]">Detect sessions and messages with unusual cost relative to their model+project cohort using z-score analysis. Flags spending spikes automatically.</p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            title="Anomalous Sessions"
            value={summary.anomalous_sessions.toString()}
            subtitle="sessions with z-score > 2"
            accent="red"
          />
          <KpiCard
            title="Anomaly Rate"
            value={formatPercent(summary.anomaly_rate)}
            subtitle="of all sessions"
            accent={summary.anomaly_rate > 0.1 ? "red" : "amber"}
          />
          <KpiCard
            title="Cost in Anomalies"
            value={formatCost(summary.cost_in_anomalies)}
            subtitle="total flagged spend"
            accent="amber"
          />
          <KpiCard
            title="Avg Z-Score"
            value={summary.avg_z_score.toFixed(1)}
            subtitle="average deviation"
            accent="red"
          />
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Session Anomalies</h3>
          {sessionAnomalies.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-[var(--muted-foreground)]">
              No session anomalies detected
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Session</th>
                    <th className="pb-2 pr-4 font-medium">Project</th>
                    <th className="pb-2 pr-4 font-medium">Model</th>
                    <th className="pb-2 pr-4 text-right font-medium">Cost</th>
                    <th className="pb-2 pr-4 text-right font-medium">Mean Cost</th>
                    <th className="pb-2 pr-4 text-right font-medium">Z-Score</th>
                    <th className="pb-2 pr-4 text-right font-medium">Messages</th>
                    <th className="pb-2 pr-4 text-right font-medium">Duration</th>
                    <th className="pb-2 font-medium">End Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionAnomalies.map((s) => (
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
                      <td className="py-2 pr-4 text-right font-medium">{formatCost(s.estimated_cost_usd)}</td>
                      <td className="py-2 pr-4 text-right text-[var(--muted-foreground)]">{formatCost(s.mean_cost)}</td>
                      <td className={`py-2 pr-4 text-right font-bold ${zScoreColor(s.z_score)}`}>
                        {s.z_score.toFixed(1)}
                      </td>
                      <td className="py-2 pr-4 text-right">{s.message_count}</td>
                      <td className="py-2 pr-4 text-right">
                        <span>{formatDuration(s.duration_seconds)}</span>
                        {s.active_seconds ? (
                          <span className="ml-1 text-xs text-[var(--muted-foreground)]">
                            / {formatActiveTime(s.active_seconds)}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2">{s.end_reason || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Daily Spend Anomalies</h3>
          <AnomalySpendChart data={dailyAnomalies} />
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Message Cost Spikes</h3>
          {messageSpikes.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-[var(--muted-foreground)]">
              No message cost spikes detected
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Session</th>
                    <th className="pb-2 pr-4 font-medium">Message ID</th>
                    <th className="pb-2 pr-4 font-medium">Model</th>
                    <th className="pb-2 pr-4 text-right font-medium">Cost</th>
                    <th className="pb-2 pr-4 text-right font-medium">Avg Msg Cost</th>
                    <th className="pb-2 pr-4 text-right font-medium">Multiplier</th>
                    <th className="pb-2 pr-4 text-right font-medium">Input Tokens</th>
                    <th className="pb-2 text-right font-medium">Thinking Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {messageSpikes.map((m, i) => (
                    <tr key={`${m.session_id}-${m.message_id}-${i}`} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2 pr-4">
                        <a
                          href={`/sessions/${m.session_id}`}
                          className="font-mono text-blue-500 hover:underline"
                        >
                          {shortSessionId(m.session_id)}
                        </a>
                      </td>
                      <td className="py-2 pr-4 font-mono">{shortSessionId(m.message_id)}</td>
                      <td className="py-2 pr-4">{m.model?.replace("claude-", "").replace(/-\d+.*/, "") || "?"}</td>
                      <td className="py-2 pr-4 text-right font-medium">{formatCost(m.cost_usd)}</td>
                      <td className="py-2 pr-4 text-right text-[var(--muted-foreground)]">{formatCost(m.avg_msg_cost)}</td>
                      <td className="py-2 pr-4 text-right font-bold text-orange-500">{m.multiplier.toFixed(1)}x</td>
                      <td className="py-2 pr-4 text-right">{formatTokens(m.input_tokens)}</td>
                      <td className="py-2 text-right">{formatTokens(m.thinking_tokens)}</td>
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
