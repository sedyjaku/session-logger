import Link from "next/link";
import {
  getSession,
  getSessionLabels,
  getModelBreakdown,
  getMessageOutliers,
  getSessionMessageTimeline,
  getSessionToolUsage,
} from "@/lib/queries";
import {
  formatCost,
  formatDate,
  formatDuration,
  formatTokens,
  shortSessionId,
  shortProjectPath,
  formatPercent,
} from "@/lib/format";
import { cacheHitRatio } from "@/lib/derived-metrics";
import { MessageTimelineChart } from "@/components/charts/message-timeline-chart";
import { ExpandableMessagesTable } from "@/components/cards/expandable-messages-table";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let session;
  try {
    session = getSession(id);
  } catch {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium">No database found</p>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Run{" "}
            <code className="rounded bg-[var(--muted)] px-2 py-0.5">
              session-log doctor
            </code>{" "}
            to import sessions
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium">Session not found</p>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            No session with ID{" "}
            <code className="rounded bg-[var(--muted)] px-2 py-0.5 font-mono">
              {id}
            </code>
          </p>
          <Link
            href="/sessions"
            className="mt-4 inline-block text-sm text-blue-500 hover:underline"
          >
            Back to sessions
          </Link>
        </div>
      </div>
    );
  }

  const labels = getSessionLabels(session.session_id);
  const modelBreakdown = getModelBreakdown(session.session_id);
  const allMessages = getMessageOutliers(session.session_id, 9999);
  const timeline = getSessionMessageTimeline(session.session_id);
  const toolUsage = getSessionToolUsage(session.session_id);

  const cacheRatio = cacheHitRatio(
    session.cache_read_tokens,
    session.input_tokens
  );

  const timelineData = timeline.map((m, idx) => ({
    index: idx + 1,
    cost: m.cost_usd,
    model: m.model,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/sessions"
          className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          Sessions
        </Link>
        <span className="text-sm text-[var(--muted-foreground)]">/</span>
        <h2 className="font-mono text-lg font-bold">
          {shortSessionId(session.session_id)}
        </h2>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-[var(--muted-foreground)]">
              Project
            </p>
            <p className="mt-1 text-sm font-medium">
              {shortProjectPath(session.project_path)}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {session.project_path}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--muted-foreground)]">
              Model
            </p>
            <p className="mt-1 text-sm font-medium">
              {session.model || "Unknown"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--muted-foreground)]">
              Git Branch
            </p>
            <p className="mt-1 text-sm font-medium">
              {session.git_branch || "-"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--muted-foreground)]">
              Started
            </p>
            <p className="mt-1 text-sm font-medium">
              {formatDate(session.started_at)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--muted-foreground)]">
              Ended
            </p>
            <p className="mt-1 text-sm font-medium">
              {session.ended_at ? formatDate(session.ended_at) : "-"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--muted-foreground)]">
              Duration
            </p>
            <p className="mt-1 text-sm font-medium">
              {formatDuration(session.duration_seconds)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--muted-foreground)]">
              End Reason
            </p>
            <p className="mt-1 text-sm font-medium">
              {session.end_reason || "-"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--muted-foreground)]">
              Labels
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {labels.length > 0 ? (
                labels.map((label) => (
                  <span
                    key={label}
                    className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  >
                    {label}
                  </span>
                ))
              ) : (
                <span className="text-sm text-[var(--muted-foreground)]">
                  -
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border-t-4 border-t-amber-500 bg-[var(--card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--muted-foreground)]">
            Cost
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            {formatCost(session.estimated_cost_usd)}
          </p>
        </div>
        <div className="rounded-lg border-t-4 border-t-blue-500 bg-[var(--card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--muted-foreground)]">
            Messages
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            {session.message_count}
          </p>
        </div>
        <div className="rounded-lg border-t-4 border-t-emerald-500 bg-[var(--card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--muted-foreground)]">
            Tool Uses
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            {session.tool_use_count}
          </p>
        </div>
        <div className="rounded-lg border-t-4 border-t-purple-500 bg-[var(--card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--muted-foreground)]">
            Cache Ratio
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            {formatPercent(cacheRatio)}
          </p>
        </div>
      </div>

      {modelBreakdown.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Model Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                  <th className="pb-3 pr-4 font-medium">Model</th>
                  <th className="pb-3 pr-4 text-right font-medium">
                    Input Tokens
                  </th>
                  <th className="pb-3 pr-4 text-right font-medium">
                    Output Tokens
                  </th>
                  <th className="pb-3 pr-4 text-right font-medium">
                    Cache Creation
                  </th>
                  <th className="pb-3 pr-4 text-right font-medium">
                    Cache Read
                  </th>
                  <th className="pb-3 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {modelBreakdown.map((m) => (
                  <tr
                    key={m.model}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="py-3 pr-4 font-medium">{m.model}</td>
                    <td className="py-3 pr-4 text-right">
                      {formatTokens(m.input_tokens)}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {formatTokens(m.output_tokens)}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {formatTokens(m.cache_creation_tokens)}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {formatTokens(m.cache_read_tokens)}
                    </td>
                    <td className="py-3 text-right font-medium">
                      {formatCost(m.cost_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <h3 className="mb-4 text-sm font-semibold">
          Message Cost Timeline
        </h3>
        <MessageTimelineChart data={timelineData} />
      </div>

      <ExpandableMessagesTable messages={allMessages} />

      {toolUsage.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Tool Usage</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                  <th className="pb-3 pr-4 font-medium">Tool</th>
                  <th className="pb-3 pr-4 text-right font-medium">Count</th>
                  <th className="pb-3 pr-4 text-right font-medium">
                    Avg Duration
                  </th>
                  <th className="pb-3 text-right font-medium">
                    Total Tokens
                  </th>
                </tr>
              </thead>
              <tbody>
                {toolUsage.map((t) => (
                  <tr
                    key={t.tool_name}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="py-3 pr-4 font-mono text-sm">
                      {t.tool_name}
                    </td>
                    <td className="py-3 pr-4 text-right">{t.count}</td>
                    <td className="py-3 pr-4 text-right">
                      {t.avg_duration_ms !== null
                        ? `${Math.round(t.avg_duration_ms)}ms`
                        : "-"}
                    </td>
                    <td className="py-3 text-right">
                      {formatTokens(t.total_tokens)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
