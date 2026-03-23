"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface TimelinePoint {
  index: number;
  cost: number;
  model: string;
}

const MODEL_COLORS: Record<string, string> = {
  opus: "#7C3AED",
  sonnet: "#0EA5E9",
  haiku: "#14B8A6",
};

function getBarColor(model: string): string {
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (model.includes(key)) return color;
  }
  return "#6B7280";
}

export function MessageTimelineChart({ data }: { data: TimelinePoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--muted-foreground)]">
        No message data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="index"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          label={{
            value: "Message #",
            position: "insideBottomRight",
            offset: -5,
            fontSize: 11,
            fill: "var(--muted-foreground)",
          }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(v) => `$${v.toFixed(2)}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: number) => [`$${value.toFixed(4)}`, "Cost"]}
          labelFormatter={(label) => `Message #${label}`}
        />
        <Bar dataKey="cost" radius={[2, 2, 0, 0]}>
          {data.map((entry, idx) => (
            <Cell key={idx} fill={getBarColor(entry.model)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
