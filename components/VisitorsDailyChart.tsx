"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyVisitors } from "@/lib/adminVisitors";

function DayTooltip({ active, payload }: { active?: boolean; payload?: { payload: DailyVisitors }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const date = new Date(`${d.day}T00:00:00`);
  const label = date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-sm shadow-xl">
      <div className="font-semibold text-white">{label}</div>
      <div className="tabular-nums text-emerald-400">
        {d.uniques} unique visitor{d.uniques === 1 ? "" : "s"}
      </div>
    </div>
  );
}

/** Bar chart of distinct human visitors active each day, for the top of the
 *  Anonymous visitors admin view. */
export default function VisitorsDailyChart({ data }: { data: DailyVisitors[] }) {
  const total = data.reduce((s, d) => s + d.uniques, 0);
  const peak = data.reduce((m, d) => Math.max(m, d.uniques), 0);
  return (
    <div className="mb-6 rounded-2xl border border-line bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Unique visitors per day</h2>
        <span className="text-xs text-muted">
          last {data.length} days · peak {peak}/day · excludes bots
        </span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={(d: string) => d.slice(5)}
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            interval="preserveStartEnd"
            minTickGap={24}
            tickLine={false}
            axisLine={{ stroke: "#ffffff12" }}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            width={32}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip cursor={{ fill: "#ffffff08" }} content={<DayTooltip />} />
          <Bar dataKey="uniques" fill="#34d399" radius={[2, 2, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
