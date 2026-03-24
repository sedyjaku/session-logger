import { Suspense } from "react";
import { KpiCard } from "@/components/cards/kpi-card";
import { WasteTrendChart } from "@/components/charts/waste-trend-chart";
import {
  getWasteSummary,
  getAbandonedSessions,
  getContextLimitSessions,
  getToolFailureSessions,
  getWasteTrend,
} from "@/lib/queries-waste";
import { formatCost, formatPercent, formatDate, shortSessionId, shortProjectPath } from "@/lib/format";
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

export default async function WastePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);

  let summary;
  let abandoned;
  let contextLimit;
  let toolFailure;
  let trendData;

  try {
    summary = getWasteSummary(filters);
    abandoned = getAbandonedSessions(filters);
    contextLimit = getContextLimitSessions(filters);
    toolFailure = getToolFailureSessions(filters);
    trendData = getWasteTrend(filters);
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
        <p className="text-sm text-[var(--muted-foreground)]">Identify sessions that consumed tokens without delivering value — abandoned early, hit context limits, or got stuck in tool failure loops.</p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            title="Estimated Waste"
            value={formatCost(summary.total_waste_cost)}
            subtitle={`across ${summary.abandoned_count + summary.context_limit_count + summary.tool_failure_count} sessions`}
            accent="red"
          />
          <KpiCard
            title="Waste %"
            value={formatPercent(summary.waste_percent)}
            subtitle="of total spend"
            accent="red"
          />
          <KpiCard
            title="Context Limit Hits"
            value={summary.context_limit_count.toString()}
            subtitle="sessions hit limit"
            accent="amber"
          />
          <KpiCard
            title="Abandoned Sessions"
            value={summary.abandoned_count.toString()}
            subtitle="ended early with cost"
            accent="amber"
          />
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Daily Waste Trend</h3>
          <WasteTrendChart data={trendData} />
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Abandoned Sessions</h3>
          {abandoned.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-[var(--muted-foreground)]">
              No abandoned sessions found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Session</th>
                    <th className="pb-2 pr-4 font-medium">Project</th>
                    <th className="pb-2 pr-4 font-medium">Model</th>
                    <th className="pb-2 pr-4 text-right font-medium">Messages</th>
                    <th className="pb-2 pr-4 text-right font-medium">Cost</th>
                    <th className="pb-2 pr-4 font-medium">End Reason</th>
                    <th className="pb-2 font-medium">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {abandoned.map((s) => (
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
                      <td className="py-2 pr-4 text-right">{s.message_count}</td>
                      <td className="py-2 pr-4 text-right font-medium">{formatCost(s.estimated_cost_usd)}</td>
                      <td className="py-2 pr-4">{s.end_reason || "-"}</td>
                      <td className="py-2">{formatDate(s.started_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Context Limit Blowouts</h3>
          {contextLimit.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-[var(--muted-foreground)]">
              No context limit sessions found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Session</th>
                    <th className="pb-2 pr-4 font-medium">Project</th>
                    <th className="pb-2 pr-4 font-medium">Model</th>
                    <th className="pb-2 pr-4 text-right font-medium">Messages</th>
                    <th className="pb-2 pr-4 text-right font-medium">Limit Hits</th>
                    <th className="pb-2 pr-4 text-right font-medium">Cost</th>
                    <th className="pb-2 font-medium">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {contextLimit.map((s) => (
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
                      <td className="py-2 pr-4 text-right">{s.message_count}</td>
                      <td className="py-2 pr-4 text-right">{s.event_count}</td>
                      <td className="py-2 pr-4 text-right font-medium">{formatCost(s.estimated_cost_usd)}</td>
                      <td className="py-2">{formatDate(s.started_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Tool Failure Loops</h3>
          {toolFailure.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-[var(--muted-foreground)]">
              No tool failure sessions found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Session</th>
                    <th className="pb-2 pr-4 font-medium">Project</th>
                    <th className="pb-2 pr-4 font-medium">Model</th>
                    <th className="pb-2 pr-4 text-right font-medium">Total Tools</th>
                    <th className="pb-2 pr-4 text-right font-medium">Failed</th>
                    <th className="pb-2 pr-4 text-right font-medium">Failure Rate</th>
                    <th className="pb-2 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {toolFailure.map((s) => (
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
                      <td className="py-2 pr-4 text-right">{s.total_tools}</td>
                      <td className="py-2 pr-4 text-right">{s.failed_tools}</td>
                      <td className="py-2 pr-4 text-right">{formatPercent(s.failure_rate)}</td>
                      <td className="py-2 text-right font-medium">{formatCost(s.estimated_cost_usd)}</td>
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
