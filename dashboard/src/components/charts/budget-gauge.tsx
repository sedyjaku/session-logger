"use client";

import { cn } from "@/lib/utils";

interface BudgetGaugeProps {
  spent: number;
  projected: number;
  label?: string;
}

function getBarColor(ratio: number): string {
  if (ratio >= 0.9) return "bg-red-500";
  if (ratio >= 0.7) return "bg-amber-500";
  return "bg-emerald-500";
}

function getLabelColor(ratio: number): string {
  if (ratio >= 0.9) return "text-red-500";
  if (ratio >= 0.7) return "text-amber-500";
  return "text-emerald-500";
}

export function BudgetGauge({ spent, projected, label = "Month Progress" }: BudgetGaugeProps) {
  const ratio = projected > 0 ? Math.min(spent / projected, 1) : 0;
  const percentUsed = Math.round(ratio * 100);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--muted-foreground)]">{label}</span>
        <span className={cn("text-sm font-semibold", getLabelColor(ratio))}>
          {percentUsed}% of projected
        </span>
      </div>
      <div className="h-4 w-full overflow-hidden rounded-full bg-[var(--muted)]">
        <div
          className={cn("h-full rounded-full transition-all duration-500", getBarColor(ratio))}
          style={{ width: `${percentUsed}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
        <span>$0</span>
        <div className="flex gap-4">
          <span>Actual: ${spent.toFixed(2)}</span>
          <span>Projected: ${projected.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
