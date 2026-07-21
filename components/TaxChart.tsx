"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SimResult, YearRow } from "@/lib/au/types";
import { fmtCompact, fmtCurrency } from "@/lib/au/format";
import { DualAgeTick, dualAgeLabel, type AgeGapInfo } from "@/components/ageAxis";
import { breakSpans, breakSpanLabel } from "@/lib/au/breakSpans";

// The tax the projection charges each year, re-sliced into non-overlapping types.
const CATS = [
  { key: "incomeTax", label: "Income tax", color: "#fbbf24" },
  { key: "medicare", label: "Medicare levy", color: "#f472b6" },
  { key: "contribTax", label: "Super contributions", color: "#34d399" },
  { key: "earningsTax", label: "Super earnings", color: "#a78bfa" },
  { key: "capitalGains", label: "Capital gains", color: "#38bdf8" },
] as const;

const catValue = (r: YearRow, key: string): number => {
  const b = r.breakdown;
  if (key === "contribTax") return Math.max(0, b.contribTax ?? 0);
  if (key === "earningsTax") return Math.max(0, b.earningsTax ?? 0);
  const v = (b as unknown as Record<string, unknown>)[key];
  return Math.max(0, typeof v === "number" ? v : 0);
};
const rowTotal = (r: YearRow): number => CATS.reduce((s, c) => s + catValue(r, c.key), 0);

function TaxTooltip({ active, payload, ages = null }: { active?: boolean; payload?: { payload: YearRow }[]; ages?: AgeGapInfo | null }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const ageLabel = ages ? dualAgeLabel(ages, r.age) : `Age ${r.age}`;
  const total = rowTotal(r);
  if (total < 1) {
    return (
      <div className="rounded-lg border border-line bg-panel px-3 py-2 text-sm shadow-xl">
        <div className="font-semibold text-white">{ageLabel}</div>
        <div className="text-muted">No tax this year</div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-sm shadow-xl">
      <div className="mb-0.5 font-semibold text-white">{ageLabel}</div>
      {CATS.map((c) => {
        const v = catValue(r, c.key);
        return v < 1 ? null : (
          <div key={c.key} className="flex items-center gap-2 tabular-nums" style={{ color: c.color }}>
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: c.color }} />
            {c.label} {fmtCurrency(v)}
          </div>
        );
      })}
      <div className="mt-1 border-t border-line pt-1 font-semibold tabular-nums text-white">
        Total tax {fmtCurrency(total)}
      </div>
    </div>
  );
}

export default function TaxChart({
  result,
  height = 200,
  animate = true,
  onSelectYear,
  ages = null,
}: {
  result: SimResult;
  height?: number;
  animate?: boolean;
  onSelectYear?: (age: number) => void;
  ages?: AgeGapInfo | null;
}) {
  const rows = result.rows;
  if (rows.length === 0 || rows.every((r) => rowTotal(r) < 1)) {
    return (
      <div className="flex h-[160px] items-center justify-center text-sm text-muted">
        No tax projected — super drawdowns and the Age Pension are tax-free.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={rows}
        margin={{ top: 18, right: 8, left: 8, bottom: 0 }}
        onClick={(state: { activeLabel?: string | number }) => {
          const age = Number(state?.activeLabel);
          if (onSelectYear && Number.isFinite(age)) onSelectYear(age);
        }}
        style={onSelectYear ? { cursor: "pointer" } : undefined}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#232c40" vertical={false} />
        <XAxis dataKey="age" stroke="#8b97ad" fontSize={12} tickLine={false} axisLine={{ stroke: "#232c40" }} height={ages ? 36 : 24} tick={ages ? <DualAgeTick gap={ages} /> : undefined} />
        <YAxis stroke="#8b97ad" fontSize={12} tickLine={false} axisLine={false} width={54} tickFormatter={fmtCompact} />
        <Tooltip content={<TaxTooltip ages={ages} />} />
        {breakSpans(rows).map((s) => (
          <ReferenceArea key={`brk-${s.from}`} x1={s.from} x2={s.to + 1} fill="#f59e0b" fillOpacity={0.08} stroke="#f59e0b" strokeOpacity={0.25} strokeDasharray="3 3"
            label={{ value: breakSpanLabel(s), position: "insideTop", fill: "#fbbf24", fontSize: 10 }} />
        ))}
        <ReferenceLine x={result.retirementAge} stroke="#f59e0b" strokeDasharray="6 4" strokeOpacity={0.5} />
        <ReferenceLine x={result.agePensionAge} stroke="#a78bfa" strokeDasharray="6 4" strokeOpacity={0.5} />
        {CATS.map((c) => (
          <Area
            key={c.key}
            type="stepAfter"
            dataKey={(r: YearRow) => catValue(r, c.key)}
            stackId="1"
            stroke={c.color}
            fill={c.color}
            fillOpacity={0.35}
            name={c.label}
            isAnimationActive={animate}
          />
        ))}
        {/* Bold total-tax outline over the stack. */}
        <Line
          type="stepAfter"
          dataKey={(r: YearRow) => rowTotal(r)}
          stroke="#e2e8f0"
          strokeWidth={2}
          dot={false}
          name="Total tax"
          isAnimationActive={animate}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
