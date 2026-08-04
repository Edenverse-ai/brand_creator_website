"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Mock data
const earningsData = [
  { month: "Jan", earnings: 2200, engagement: 3.2 },
  { month: "Feb", earnings: 2800, engagement: 3.8 },
  { month: "Mar", earnings: 2500, engagement: 3.5 },
  { month: "Apr", earnings: 3100, engagement: 4.2 },
  { month: "May", earnings: 2900, engagement: 4.5 },
  { month: "Jun", earnings: 3250, engagement: 4.8 },
];

export default function AnalyticsCharts() {
  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={earningsData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0, 0, 0, 0.05)" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis
            yAxisId="left"
            orientation="left"
            label={{ value: "Earnings ($)", angle: -90, position: "insideLeft" }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            label={{ value: "Engagement Rate (%)", angle: -90, position: "insideRight" }}
          />
          <Tooltip />
          <Legend verticalAlign="top" align="center" iconType="circle" iconSize={6} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="earnings"
            name="Monthly Earnings"
            stroke="rgb(147, 51, 234)"
            fill="rgb(147, 51, 234)"
            fillOpacity={0.1}
          />
          <Area
            yAxisId="right"
            type="monotone"
            dataKey="engagement"
            name="Engagement Rate"
            stroke="rgb(34, 197, 94)"
            fill="rgb(34, 197, 94)"
            fillOpacity={0.1}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
