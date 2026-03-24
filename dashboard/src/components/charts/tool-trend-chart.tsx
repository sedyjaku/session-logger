"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface ToolTrendChartProps {
  data: { date: string; [tool: string]: string | number }[];
  tools: string[];
}

const TOOL_COLORS = [
  "#7C3AED",
  "#0EA5E9",
  "#14B8A6",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#6B7280",
];

export function ToolTrendChart({ data, tools }: ToolTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--muted-foreground)]">
        No tool usage data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(v) => {
            const d = new Date(v);
            return `${d.getMonth() + 1}/${d.getDate()}`;
          }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {tools.map((tool, i) => (
          <Bar
            key={tool}
            dataKey={tool}
            stackId="1"
            fill={TOOL_COLORS[i % TOOL_COLORS.length]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
