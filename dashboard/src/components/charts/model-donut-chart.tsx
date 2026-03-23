"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

interface ModelDonutChartProps {
  data: { name: string; value: number }[];
}

const MODEL_COLORS: Record<string, string> = {
  "claude-opus-4": "#7C3AED",
  "claude-sonnet-4": "#0EA5E9",
  "claude-haiku-4": "#14B8A6",
};

function getColor(model: string): string {
  for (const [prefix, color] of Object.entries(MODEL_COLORS)) {
    if (model.startsWith(prefix)) return color;
  }
  return "#6B7280";
}

export function ModelDonutChart({ data }: ModelDonutChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--muted-foreground)]">
        No model data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={getColor(entry.name)} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: number) => [`$${value.toFixed(2)}`, ""]}
        />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          formatter={(value) => {
            const short = value.replace("claude-", "").replace(/-\d+.*/, "");
            return short.charAt(0).toUpperCase() + short.slice(1);
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
