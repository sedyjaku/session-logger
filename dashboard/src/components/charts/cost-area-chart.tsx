"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface CostAreaChartProps {
  data: { date: string; [model: string]: string | number }[];
  models: string[];
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

export function CostAreaChart({ data, models }: CostAreaChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--muted-foreground)]">
        No data for selected period
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
          tickFormatter={(v) => `$${v.toFixed(0)}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: number) => [`$${value.toFixed(2)}`, ""]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {models.map((model) => (
          <Area
            key={model}
            type="monotone"
            dataKey={model}
            stackId="1"
            stroke={getColor(model)}
            fill={getColor(model)}
            fillOpacity={0.6}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
