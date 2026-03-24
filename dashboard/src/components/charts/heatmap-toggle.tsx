"use client";

import { useState } from "react";
import { ActivityHeatmap } from "./activity-heatmap";

interface HeatmapData {
  dow: number;
  hour: number;
  sessions: number;
  total_cost: number;
}

interface HeatmapToggleProps {
  data: HeatmapData[];
}

export function HeatmapToggle({ data }: HeatmapToggleProps) {
  const [view, setView] = useState<"sessions" | "cost">("sessions");

  const heatmapData = data.map((d) => ({
    dow: d.dow,
    hour: d.hour,
    value: view === "sessions" ? d.sessions : d.total_cost,
  }));

  const formatValue = view === "cost"
    ? (v: number) => `$${v.toFixed(2)}`
    : (v: number) => v.toString();

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setView("sessions")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            view === "sessions"
              ? "bg-[var(--foreground)] text-[var(--background)]"
              : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
        >
          Sessions
        </button>
        <button
          onClick={() => setView("cost")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            view === "cost"
              ? "bg-[var(--foreground)] text-[var(--background)]"
              : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
        >
          Cost
        </button>
      </div>
      <ActivityHeatmap
        data={heatmapData}
        metric={view === "sessions" ? "Sessions" : "Cost"}
        formatValue={formatValue}
      />
    </div>
  );
}
