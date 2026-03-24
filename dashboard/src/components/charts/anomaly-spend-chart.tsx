"use client";

import {
  ComposedChart,
  Area,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
} from "recharts";

interface AnomalySpendChartProps {
  data: {
    date: string;
    cost: number;
    rolling_avg: number;
    is_anomaly: number;
  }[];
}

export function AnomalySpendChart({ data }: AnomalySpendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--muted-foreground)]">
        No data for selected period
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    anomalyCost: d.is_anomaly ? d.cost : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
          formatter={(value: number, name: string) => {
            if (name === "cost") return [`$${value.toFixed(2)}`, "Daily Spend"];
            if (name === "rolling_avg") return [`$${value.toFixed(2)}`, "7-Day Avg"];
            if (name === "anomalyCost") return [`$${value.toFixed(2)}`, "Anomaly"];
            return [`$${value.toFixed(2)}`, name];
          }}
          labelFormatter={(label) => {
            const d = new Date(label);
            return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          }}
        />
        <Area
          type="monotone"
          dataKey="cost"
          stroke="#0EA5E9"
          fill="#0EA5E9"
          fillOpacity={0.2}
          strokeWidth={2}
          name="cost"
        />
        <Line
          type="monotone"
          dataKey="rolling_avg"
          stroke="#6B7280"
          strokeDasharray="5 5"
          strokeWidth={1.5}
          dot={false}
          name="rolling_avg"
        />
        <Scatter
          dataKey="anomalyCost"
          fill="#EF4444"
          name="anomalyCost"
          r={6}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
