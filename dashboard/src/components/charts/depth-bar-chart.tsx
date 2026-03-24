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

interface DepthBarChartProps {
  data: { bucket: string; count: number; avg_cost: number; total_cost: number }[];
}

const BUCKET_COLORS = ["#22C55E", "#0EA5E9", "#8B5CF6", "#F59E0B", "#EF4444"];

export function DepthBarChart({ data }: DepthBarChartProps) {
  if (data.every((d) => d.count === 0)) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--muted-foreground)]">
        No session data
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 60, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            type="category"
            dataKey="bucket"
            width={60}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number) => [value, "Sessions"]}
            labelFormatter={(label) => `${label} messages`}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((_, idx) => (
              <Cell key={idx} fill={BUCKET_COLORS[idx % BUCKET_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 grid grid-cols-5 gap-2 text-center text-[10px] text-[var(--muted-foreground)]">
        {data.map((d) => (
          <div key={d.bucket}>
            <span className="font-medium">{d.bucket}</span>
            <br />
            avg ${d.avg_cost.toFixed(4)}
          </div>
        ))}
      </div>
    </div>
  );
}
