import { Suspense } from "react";
import { getCostByLabel, getCostByProject } from "@/lib/queries";
import { formatCost, shortProjectPath } from "@/lib/format";
import type { DashboardFilters } from "@/lib/types";
import { ViewToggle } from "@/components/filters/view-toggle";

export const dynamic = "force-dynamic";

function parseFilters(searchParams: Record<string, string | string[] | undefined>): DashboardFilters {
  return {
    days: searchParams.days ? Number(searchParams.days) : 30,
    label: (searchParams.label as string) || undefined,
    project: (searchParams.project as string) || undefined,
    model: (searchParams.model as string) || undefined,
  };
}

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const view = (params.view as string) || "Labels";

  let labelData;
  let projectData;

  try {
    labelData = getCostByLabel(filters);
    projectData = getCostByProject(filters);
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
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Labels & Projects</h1>
          <ViewToggle options={["Labels", "Projects"]} current={view} />
        </div>

        {view === "Labels" ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            {labelData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-[var(--muted-foreground)]">
                No labels found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                      <th className="pb-3 pr-4 font-medium">Label Name</th>
                      <th className="pb-3 pr-4 text-right font-medium">Sessions</th>
                      <th className="pb-3 pr-4 text-right font-medium">Total Cost</th>
                      <th className="pb-3 text-right font-medium">Avg Cost/Session</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labelData.map((l) => (
                      <tr key={l.name} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-3 pr-4 font-medium">{l.name}</td>
                        <td className="py-3 pr-4 text-right">{l.session_count}</td>
                        <td className="py-3 pr-4 text-right font-medium">{formatCost(l.total_cost)}</td>
                        <td className="py-3 text-right">
                          {l.session_count > 0 ? formatCost(l.total_cost / l.session_count) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            {projectData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-[var(--muted-foreground)]">
                No projects found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                      <th className="pb-3 pr-4 font-medium">Project Path</th>
                      <th className="pb-3 pr-4 text-right font-medium">Sessions</th>
                      <th className="pb-3 text-right font-medium">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectData.map((p) => (
                      <tr key={p.project_path} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-3 pr-4 font-medium" title={p.project_path}>
                          {shortProjectPath(p.project_path)}
                        </td>
                        <td className="py-3 pr-4 text-right">{p.sessions}</td>
                        <td className="py-3 text-right font-medium">{formatCost(p.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Suspense>
  );
}
