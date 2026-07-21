"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FanPoint } from "@/lib/au/montecarlo";
import { fmtCompact, fmtCurrency } from "@/lib/au/format";
import { DualAgeTick, dualAgeLabel, type AgeGapInfo } from "@/components/ageAxis";

interface FanRow {
  age: number;
  p10: number;
  band: number; // p90 - p10, stacked on p10 to draw the range
  p50: number;
}

function FanTooltip({
  active,
  payload,
  ages = null,
}: {
  active?: boolean;
  payload?: { payload: FanRow }[];
  ages?: AgeGapInfo | null;
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-sm shadow-xl">
      <div className="font-semibold text-white">{ages ? dualAgeLabel(ages, r.age) : `Age ${r.age}`}</div>
      <div className="tabular-nums text-emerald-400">
        Median {fmtCurrency(r.p50)}
      </div>
      <div className="tabular-nums text-slate-300">
        Range {fmtCurrency(r.p10)} – {fmtCurrency(r.p10 + r.band)}
      </div>
    </div>
  );
}

export default function FanChart({
  fan,
  retirementAge,
  agePensionAge,
  height = 280,
  onSelectAge,
  ages = null,
}: {
  fan: FanPoint[];
  retirementAge: number;
  agePensionAge: number;
  height?: number;
  onSelectAge?: (age: number) => void;
  ages?: AgeGapInfo | null;
}) {
  const data: FanRow[] = fan.map((f) => ({
    age: f.age,
    p10: f.p10,
    band: Math.max(0, f.p90 - f.p10),
    p50: f.p50,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={data}
        margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
        style={onSelectAge ? { cursor: "pointer" } : undefined}
        onClick={(state) => {
          const age = (state as { activeLabel?: string | number } | undefined)?.activeLabel;
          if (age != null && onSelectAge) onSelectAge(Number(age));
        }}
      >
        <defs>
          <linearGradient id="fanFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0.08} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#232c40" vertical={false} />
        <XAxis
          dataKey="age"
          stroke="#8b97ad"
          fontSize={12}
          tickLine={false}
          axisLine={{ stroke: "#232c40" }}
          height={ages ? 36 : 24}
          tick={ages ? <DualAgeTick gap={ages} /> : undefined}
        />
        <YAxis
          stroke="#8b97ad"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={54}
          tickFormatter={fmtCompact}
        />
        <Tooltip content={<FanTooltip ages={ages} />} />
        <ReferenceLine
          x={ages ? ages.anchor + (retirementAge - ages.you0) : retirementAge}
          stroke="#f59e0b"
          strokeDasharray="6 4"
          strokeOpacity={0.6}
        />
        {!ages && (
          <ReferenceLine x={agePensionAge} stroke="#a78bfa" strokeDasharray="6 4" strokeOpacity={0.6} />
        )}
        {ages && (
          <ReferenceLine x={ages.anchor + (agePensionAge - ages.you0)} stroke="#a78bfa" strokeDasharray="6 4" strokeOpacity={0.6} />
        )}
        {ages && (
          <ReferenceLine x={ages.anchor + (agePensionAge - ages.partner0)} stroke="#a78bfa" strokeDasharray="6 4" strokeOpacity={0.6} />
        )}
        {/* p10 baseline (invisible) + band stacked on top = 10th–90th percentile range */}
        <Area
          type="monotone"
          dataKey="p10"
          stackId="band"
          stroke="none"
          fill="none"
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="band"
          stackId="band"
          stroke="none"
          fill="url(#fanFill)"
          isAnimationActive={false}
        />
        {/* Median path */}
        <Area
          type="monotone"
          dataKey="p50"
          stroke="#34d399"
          strokeWidth={2.5}
          fill="none"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
