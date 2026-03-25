import Link from "next/link";
import { listSessions, getSessionCount, getSummary } from "@/lib/queries";
import { formatCost, formatDate, formatDuration, formatActiveTime, shortSessionId } from "@/lib/format";
import type { DashboardFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function parseFilters(
  searchParams: Record<string, string | string[] | undefined>
): DashboardFilters & { search?: string; page: number } {
  return {
    days: searchParams.days ? Number(searchParams.days) : undefined,
    label: (searchParams.label as string) || undefined,
    project: (searchParams.project as string) || undefined,
    model: (searchParams.model as string) || undefined,
    search: (searchParams.search as string) || undefined,
    page: searchParams.page ? Number(searchParams.page) : 1,
  };
}

function buildQueryString(
  filters: Record<string, string | number | undefined>,
  overrides: Record<string, string | number | undefined> = {}
): string {
  const merged = { ...filters, ...overrides };
  const parts: string[] = [];
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== "") {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

function SearchForm({
  defaultValue,
  filters,
}: {
  defaultValue: string;
  filters: Record<string, string | number | undefined>;
}) {
  const qs = buildQueryString(filters, { search: undefined, page: undefined });
  const action = `/sessions${qs ? qs + "&" : "?"}`;

  return (
    <form action="/sessions" method="get" className="flex gap-2">
      {filters.days !== undefined && (
        <input type="hidden" name="days" value={filters.days} />
      )}
      {filters.label !== undefined && (
        <input type="hidden" name="label" value={filters.label} />
      )}
      {filters.project !== undefined && (
        <input type="hidden" name="project" value={filters.project} />
      )}
      {filters.model !== undefined && (
        <input type="hidden" name="model" value={filters.model} />
      )}
      <input
        type="text"
        name="search"
        defaultValue={defaultValue}
        placeholder="Search by session ID or project..."
        className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Search
      </button>
    </form>
  );
}

function shortModel(model: string | null): string {
  if (!model) return "?";
  return model.replace("claude-", "").replace(/-\d+.*/, "");
}

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { page, search, ...dashFilters } = parseFilters(params);
  const offset = (page - 1) * PAGE_SIZE;

  const filterParams: Record<string, string | number | undefined> = {
    days: dashFilters.days,
    label: dashFilters.label,
    project: dashFilters.project,
    model: dashFilters.model,
    search,
  };

  let sessions;
  let totalCount: number;
  let summary;

  try {
    sessions = listSessions({
      ...dashFilters,
      search,
      limit: PAGE_SIZE,
      offset,
    });
    totalCount = getSessionCount({ ...dashFilters, search });
    summary = getSummary(dashFilters);
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

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const totalDuration = sessions.reduce(
    (sum, s) => sum + (s.duration_seconds || 0),
    0
  );
  const avgDuration =
    sessions.length > 0 ? Math.round(totalDuration / sessions.length) : 0;
  const totalActive = sessions.reduce(
    (sum, s) => sum + (s.active_seconds || 0),
    0
  );
  const avgActive =
    sessions.length > 0 ? Math.round(totalActive / sessions.length) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Sessions</h2>
      </div>

      <SearchForm defaultValue={search || ""} filters={filterParams} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <p className="text-sm font-medium text-[var(--muted-foreground)]">
            Total Sessions
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            {totalCount}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <p className="text-sm font-medium text-[var(--muted-foreground)]">
            Total Duration
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            {formatDuration(totalDuration)}
          </p>
          {totalActive > 0 && (
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {formatActiveTime(totalActive)} active
            </p>
          )}
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <p className="text-sm font-medium text-[var(--muted-foreground)]">
            Avg Duration
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            {formatDuration(avgDuration)}
          </p>
          {avgActive > 0 && (
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {formatActiveTime(avgActive)} active
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        {sessions.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-[var(--muted-foreground)]">
            No sessions found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                  <th className="pb-3 pr-4 font-medium">Session ID</th>
                  <th className="pb-3 pr-4 font-medium">Started</th>
                  <th className="pb-3 pr-4 font-medium">Duration</th>
                  <th className="pb-3 pr-4 font-medium">Model</th>
                  <th className="pb-3 pr-4 text-right font-medium">Messages</th>
                  <th className="pb-3 pr-4 text-right font-medium">
                    Tool Uses
                  </th>
                  <th className="pb-3 pr-4 text-right font-medium">Cost</th>
                  <th className="pb-3 font-medium">Labels</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr
                    key={s.session_id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]"
                  >
                    <td className="py-3 pr-4">
                      <Link
                        href={`/sessions/${s.session_id}`}
                        className="font-mono text-sm text-blue-500 hover:underline"
                      >
                        {shortSessionId(s.session_id)}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-sm">
                      {formatDate(s.started_at)}
                    </td>
                    <td className="py-3 pr-4 text-sm">
                      <span>{formatDuration(s.duration_seconds)}</span>
                      {s.active_seconds ? (
                        <span className="ml-1 text-xs text-[var(--muted-foreground)]">
                          / {formatActiveTime(s.active_seconds)}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-sm">
                      {shortModel(s.model)}
                    </td>
                    <td className="py-3 pr-4 text-right text-sm">
                      {s.message_count}
                    </td>
                    <td className="py-3 pr-4 text-right text-sm">
                      {s.tool_use_count}
                    </td>
                    <td className="py-3 pr-4 text-right text-sm font-medium">
                      {formatCost(s.estimated_cost_usd)}
                    </td>
                    <td className="py-3 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {s.labels
                          ? s.labels.split(", ").map((label) => (
                              <span
                                key={label}
                                className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                              >
                                {label}
                              </span>
                            ))
                          : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/sessions${buildQueryString(filterParams, { page: page - 1 })}`}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm hover:bg-[var(--muted)]"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-[var(--muted-foreground)]">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/sessions${buildQueryString(filterParams, { page: page + 1 })}`}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm hover:bg-[var(--muted)]"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
