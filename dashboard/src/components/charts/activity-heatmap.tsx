"use client";

import { useState, useCallback, Fragment } from "react";

interface HeatmapCell {
  dow: number;
  hour: number;
  value: number;
}

interface ActivityHeatmapProps {
  data: HeatmapCell[];
  metric: string;
  formatValue?: (v: number) => string;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21];

function dowToRow(dow: number): number {
  return dow === 0 ? 6 : dow - 1;
}

function intensityColor(ratio: number): string {
  if (ratio === 0) return "rgba(34, 197, 94, 0.04)";
  if (ratio < 0.15) return "rgba(34, 197, 94, 0.15)";
  if (ratio < 0.3) return "rgba(34, 197, 94, 0.3)";
  if (ratio < 0.5) return "rgba(34, 197, 94, 0.5)";
  if (ratio < 0.7) return "rgba(34, 197, 94, 0.7)";
  if (ratio < 0.85) return "rgba(34, 197, 94, 0.85)";
  return "rgba(34, 197, 94, 1)";
}

export function ActivityHeatmap({ data, metric, formatValue }: ActivityHeatmapProps) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    dow: number;
    hour: number;
    value: number;
  } | null>(null);

  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let maxVal = 0;

  for (const cell of data) {
    const row = dowToRow(cell.dow);
    grid[row][cell.hour] = cell.value;
    if (cell.value > maxVal) maxVal = cell.value;
  }

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent, row: number, hour: number, value: number) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const parentRect = e.currentTarget.closest(".heatmap-container")?.getBoundingClientRect();
      if (!parentRect) return;
      setTooltip({
        x: rect.left - parentRect.left + rect.width / 2,
        y: rect.top - parentRect.top - 8,
        dow: row,
        hour,
        value,
      });
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const fmt = formatValue || ((v: number) => v.toString());

  return (
    <div className="heatmap-container relative">
      <div
        className="grid gap-[3px]"
        style={{
          gridTemplateColumns: "48px repeat(24, 1fr)",
          gridTemplateRows: "24px repeat(7, 1fr)",
        }}
      >
        <div />
        {Array.from({ length: 24 }, (_, i) => (
          <div
            key={`h-${i}`}
            className="flex items-end justify-center text-[10px] text-[var(--muted-foreground)]"
          >
            {HOUR_LABELS.includes(i) ? `${i}` : ""}
          </div>
        ))}

        {grid.map((row, rowIdx) => (
          <Fragment key={`row-${rowIdx}`}>
            <div
              className="flex items-center pr-2 text-xs font-medium text-[var(--muted-foreground)]"
            >
              {DAY_LABELS[rowIdx]}
            </div>
            {row.map((value, hour) => {
              const ratio = maxVal > 0 ? value / maxVal : 0;
              return (
                <div
                  key={`cell-${rowIdx}-${hour}`}
                  className="aspect-square cursor-pointer rounded-sm transition-transform hover:scale-110"
                  style={{ backgroundColor: intensityColor(ratio) }}
                  onMouseEnter={(e) => handleMouseEnter(e, rowIdx, hour, value)}
                  onMouseLeave={handleMouseLeave}
                />
              );
            })}
          </Fragment>
        ))}
      </div>

      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <p className="font-semibold">
            {DAY_LABELS[tooltip.dow]} {tooltip.hour}:00 - {tooltip.hour + 1}:00
          </p>
          <p className="mt-1 text-[var(--muted-foreground)]">
            {metric}: {fmt(tooltip.value)}
          </p>
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="text-[10px] text-[var(--muted-foreground)]">Less</span>
        {[0, 0.15, 0.3, 0.5, 0.7, 0.85, 1].map((ratio) => (
          <div
            key={ratio}
            className="h-3 w-3 rounded-sm"
            style={{ backgroundColor: intensityColor(ratio) }}
          />
        ))}
        <span className="text-[10px] text-[var(--muted-foreground)]">More</span>
      </div>
    </div>
  );
}
