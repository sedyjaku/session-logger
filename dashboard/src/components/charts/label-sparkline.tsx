"use client";

import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface LabelSparklineProps {
  data: { date: string; cost: number }[];
  color?: string;
}

export function LabelSparkline({ data, color = "#0EA5E9" }: LabelSparklineProps) {
  if (data.length < 2) {
    return <div className="h-10 w-full" />;
  }

  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Area
          type="monotone"
          dataKey="cost"
          stroke={color}
          fill={color}
          fillOpacity={0.2}
          strokeWidth={1.5}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
