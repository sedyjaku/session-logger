"use client";

import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string;
  delta?: { value: string; positive: boolean } | null;
  subtitle?: string;
  accent?: "amber" | "green" | "blue" | "red" | "emerald";
}

const accentColors = {
  amber: "border-t-amber-500",
  green: "border-t-emerald-500",
  blue: "border-t-blue-500",
  red: "border-t-red-500",
  emerald: "border-t-emerald-600",
};

export function KpiCard({ title, value, delta, subtitle, accent = "blue" }: KpiCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border-t-4 bg-[var(--card)] p-5 shadow-sm",
        accentColors[accent]
      )}
    >
      <p className="text-sm font-medium text-[var(--muted-foreground)]">{title}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
      <div className="mt-2 flex items-center gap-2">
        {delta && delta.value !== "N/A" && (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              delta.positive
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            )}
          >
            {delta.value}
          </span>
        )}
        {subtitle && (
          <span className="text-xs text-[var(--muted-foreground)]">{subtitle}</span>
        )}
      </div>
    </div>
  );
}
