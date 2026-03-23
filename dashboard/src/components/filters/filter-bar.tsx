"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

interface FilterBarProps {
  labels: string[];
  projects: string[];
  models: string[];
}

const DATE_PRESETS = [
  { label: "7d", value: "7" },
  { label: "30d", value: "30" },
  { label: "90d", value: "90" },
  { label: "All", value: "" },
];

export function FilterBar({ labels, projects, models }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentDays = searchParams.get("days") || "30";
  const currentLabel = searchParams.get("label") || "";
  const currentProject = searchParams.get("project") || "";
  const currentModel = searchParams.get("model") || "";

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="sticky top-14 z-40 border-b border-[var(--border)] bg-[var(--background)]/95 px-6 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-[var(--muted)] p-0.5">
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => updateParam("days", preset.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                currentDays === preset.value || (!currentDays && preset.value === "")
                  ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <select
          value={currentLabel}
          onChange={(e) => updateParam("label", e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs"
        >
          <option value="">All Labels</option>
          {labels.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>

        <select
          value={currentProject}
          onChange={(e) => updateParam("project", e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs"
        >
          <option value="">All Projects</option>
          {projects.map((p) => (
            <option key={p} value={p}>{p.split("/").pop()}</option>
          ))}
        </select>

        <select
          value={currentModel}
          onChange={(e) => updateParam("model", e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs"
        >
          <option value="">All Models</option>
          {models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {(currentLabel || currentProject || currentModel) && (
          <button
            onClick={() => {
              const params = new URLSearchParams();
              if (currentDays) params.set("days", currentDays);
              router.push(`${pathname}?${params.toString()}`);
            }}
            className="rounded-md px-2 py-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
