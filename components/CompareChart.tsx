"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SimResult } from "@/lib/au/types";
import { fmtCompact, fmtCurrency } from "@/lib/au/format";
import { DualAgeTick, dualAgeLabel, type AgeGapInfo } from "@/components/ageAxis";

export interface CompareSeries {
  id: string;
  label: string;
  color: string;
  result: SimResult;
}

function CompareTooltip({
  active,
  payload,
  label,
  series,
  ages = null,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: number;
  series: CompareSeries[];
  ages?: AgeGapInfo | null;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold text-white">{ages && label != null ? dualAgeLabel(ages, label) : `Age ${label}`}</div>
      {series.map((s) => {
        const p = payload.find((x) => x.dataKey === s.id);
        if (p?.value === undefined) return null;
        return (
          <div key={s.id} className="flex items-center gap-1.5 tabular-nums" style={{ color: s.color }}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}: {fmtCurrency(p.value)}
          </div>
        );
      })}
    </div>
  );
}

/** Overlays each scenario's total balance (super + outside) by age. */
export default function CompareChart({
  series,
  height = 300,
  onSelectYear,
  ages = null,
}: {
  series: CompareSeries[];
  height?: number;
  onSelectYear?: (age: number) => void;
  ages?: AgeGapInfo | null;
}) {
  // Merge all scenarios' totals into one row per age.
  const byAge = new Map<number, Record<string, number>>();
  for (const s of series) {
    for (const r of s.result.rows) {
      const row = byAge.get(r.age) ?? { age: r.age };
      row[s.id] = Math.round(r.total);
      byAge.set(r.age, row);
    }
  }
  const data = [...byAge.values()].sort((a, b) => a.age - b.age);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={data}
        margin={{ top: 8, right: 12, left: 8, bottom: 0 }}
        onClick={onSelectYear ? (state: { activeLabel?: string | number }) => {
          const age = Number(state?.activeLabel);
          if (Number.isFinite(age)) onSelectYear(age);
        } : undefined}
        style={onSelectYear ? { cursor: "pointer" } : undefined}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#232c40" vertical={false} />
        <XAxis dataKey="age" stroke="#8b97ad" fontSize={12} tickLine={false} axisLine={{ stroke: "#232c40" }} height={ages ? 36 : 24} tick={ages ? <DualAgeTick gap={ages} /> : undefined} />
        <YAxis stroke="#8b97ad" fontSize={12} tickLine={false} axisLine={false} width={54} tickFormatter={fmtCompact} />
        <Tooltip content={<CompareTooltip series={series} ages={ages} />} />
        {series.map((s) => (
          <Line
            key={s.id}
            type="monotone"
            dataKey={s.id}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
