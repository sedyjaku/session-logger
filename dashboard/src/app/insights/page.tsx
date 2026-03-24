import { Suspense } from "react";
import { KpiCard } from "@/components/cards/kpi-card";
import { HeatmapToggle } from "@/components/charts/heatmap-toggle";
import { DepthBarChart } from "@/components/charts/depth-bar-chart";
import { CadenceLineChart } from "@/components/charts/cadence-line-chart";
import {
  getHourlyActivity,
  getSessionDepthDistribution,
  getPeakHours,
  getDailySessionCadence,
  getBranchActivity,
} from "@/lib/queries-insights";
import { formatCost } from "@/lib/format";
import type { DashboardFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseFilters(searchParams: Record<string, string | string[] | undefined>): DashboardFilters {
  return {
    days: searchParams.days ? Number(searchParams.days) : undefined,
    label: (searchParams.label as string) || undefined,
    project: (searchParams.project as string) || undefined,
    model: (searchParams.model as string) || undefined,
  };
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);

  let hourlyData;
  let depthData;
  let peakHours;
  let cadenceData;
  let branchData;

  try {
    hourlyData = getHourlyActivity(filters);
    depthData = getSessionDepthDistribution(filters);
    peakHours = getPeakHours(filters);
    cadenceData = getDailySessionCadence(filters);
    branchData = getBranchActivity(filters);
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

  const peakHourSlot = peakHours.length > 0 ? peakHours[0] : null;
  const peakHourLabel = peakHourSlot
    ? `${peakHourSlot.hour.toString().padStart(2, "0")}:00 - ${(peakHourSlot.hour + 1).toString().padStart(2, "0")}:00`
    : "-";

  const sessionsByDow = new Map<number, number>();
  for (const h of hourlyData) {
    sessionsByDow.set(h.dow, (sessionsByDow.get(h.dow) || 0) + h.sessions);
  }
  let peakDow = 0;
  let peakDowCount = 0;
  for (const [dow, count] of sessionsByDow) {
    if (count > peakDowCount) {
      peakDow = dow;
      peakDowCount = count;
    }
  }
  const peakDayLabel = hourlyData.length > 0 ? DAY_NAMES[peakDow] : "-";

  const distinctDays = new Set(cadenceData.map((d) => d.date)).size;
  const totalSessions = cadenceData.reduce((sum, d) => sum + d.sessions, 0);
  const avgSessionsPerDay = distinctDays > 0 ? (totalSessions / distinctDays).toFixed(1) : "0";

  const activeBranches = branchData.length;

  return (
    <Suspense>
      <div className="space-y-6">
        <p className="text-sm text-[var(--muted-foreground)]">Discover when you're most productive with Claude — activity patterns by hour and day, session depth distribution, and branch-level cost breakdown.</p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            title="Peak Hour"
            value={peakHourLabel}
            subtitle={peakHourSlot ? `${peakHourSlot.sessions} sessions` : undefined}
            accent="amber"
          />
          <KpiCard
            title="Peak Day"
            value={peakDayLabel}
            subtitle={peakDowCount > 0 ? `${peakDowCount} sessions` : undefined}
            accent="blue"
          />
          <KpiCard
            title="Avg Sessions/Day"
            value={avgSessionsPerDay}
            subtitle={`${distinctDays} active days`}
            accent="emerald"
          />
          <KpiCard
            title="Active Branches"
            value={activeBranches.toString()}
            subtitle="with 2+ sessions"
            accent="green"
          />
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Activity Heatmap</h3>
          {hourlyData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-[var(--muted-foreground)]">
              No activity data
            </div>
          ) : (
            <HeatmapToggle data={hourlyData} />
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="mb-4 text-sm font-semibold">Session Depth Distribution</h3>
            <DepthBarChart data={depthData} />
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="mb-4 text-sm font-semibold">Peak Hours</h3>
            {peakHours.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-[var(--muted-foreground)]">
                No peak hour data
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                      <th className="pb-2 pr-4 font-medium">Day</th>
                      <th className="pb-2 pr-4 font-medium">Hour Range</th>
                      <th className="pb-2 pr-4 text-right font-medium">Sessions</th>
                      <th className="pb-2 pr-4 text-right font-medium">Avg Cost</th>
                      <th className="pb-2 text-right font-medium">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {peakHours.map((p, i) => (
                      <tr key={i} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-2 pr-4">{DAY_NAMES[p.dow]}</td>
                        <td className="py-2 pr-4 font-mono">
                          {p.hour.toString().padStart(2, "0")}:00 - {(p.hour + 1).toString().padStart(2, "0")}:00
                        </td>
                        <td className="py-2 pr-4 text-right">{p.sessions}</td>
                        <td className="py-2 pr-4 text-right">{formatCost(p.avg_cost)}</td>
                        <td className="py-2 text-right font-medium">{formatCost(p.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Branch Activity</h3>
          {branchData.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-[var(--muted-foreground)]">
              No branch data
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Branch</th>
                    <th className="pb-2 pr-4 text-right font-medium">Sessions</th>
                    <th className="pb-2 pr-4 text-right font-medium">Total Cost</th>
                    <th className="pb-2 text-right font-medium">Avg Cost/Session</th>
                  </tr>
                </thead>
                <tbody>
                  {branchData.map((b) => (
                    <tr key={b.branch} className="border-b border-[var(--border)] last:border-0">
                      <td className="max-w-[200px] truncate py-2 pr-4 font-mono" title={b.branch}>
                        {b.branch}
                      </td>
                      <td className="py-2 pr-4 text-right">{b.sessions}</td>
                      <td className="py-2 pr-4 text-right font-medium">{formatCost(b.total_cost)}</td>
                      <td className="py-2 text-right">{formatCost(b.avg_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h3 className="mb-4 text-sm font-semibold">Daily Session Cadence</h3>
          <CadenceLineChart data={cadenceData} />
        </div>
      </div>
    </Suspense>
  );
}
