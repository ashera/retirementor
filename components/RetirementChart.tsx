"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SimResult, YearRow } from "@/lib/au/types";
import { fmtCompact, fmtCurrency } from "@/lib/au/format";
import { rowNetWorth } from "@/lib/au/networth";

export interface SpendingBand {
  x1: number;
  x2: number;
  label: string;
  fill: string;
}

type ChartRow = Partial<YearRow> & {
  age: number;
  baselineTotal?: number;
  propertyNW?: number;
  pensionSuper?: number; // tax-free pension pool (opening); pensionSuper + accumSuper = totalSuper
  accumSuper?: number; // taxed accumulation pool (opening)
};

function AssetsTooltip({
  active,
  payload,
  baselineLabel = "Saved plan",
  showHome = false,
}: {
  active?: boolean;
  payload?: { payload: ChartRow }[];
  baselineLabel?: string;
  showHome?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const home = showHome ? Math.max(0, r.homeEquity ?? 0) : 0;
  const property = showHome ? Math.max(0, r.propertyNW ?? 0) : 0;
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-sm shadow-xl">
      <div className="font-semibold text-white">Age {r.age}</div>
      {r.total !== undefined && (
        <div className="tabular-nums text-slate-200">
          {showHome ? "Net worth" : "Total"} {fmtCurrency(r.total + home + property)}
        </div>
      )}
      {showHome && r.homeEquity !== undefined && (
        <div className="tabular-nums text-slate-400">
          Home equity {fmtCurrency(home)}
        </div>
      )}
      {showHome && property > 0 && (
        <div className="tabular-nums" style={{ color: "#fb923c" }}>
          Investment property {fmtCurrency(property)}
        </div>
      )}
      {r.totalSuper !== undefined &&
        ((r.accumSuper ?? 0) > 1 ? (
          <>
            <div className="tabular-nums text-emerald-400">
              Pension {fmtCurrency(r.pensionSuper ?? 0)}
            </div>
            <div className="tabular-nums text-yellow-500">
              Accumulation {fmtCurrency(r.accumSuper ?? 0)}
            </div>
          </>
        ) : (
          <div className="tabular-nums text-emerald-400">
            Super {fmtCurrency(r.totalSuper)}
          </div>
        ))}
      {r.outside !== undefined && (
        <div className="tabular-nums text-sky-400">
          Outside {fmtCurrency(r.outside)}
        </div>
      )}
      {r.baselineTotal !== undefined && (
        <div className="tabular-nums text-slate-400">
          {baselineLabel} {fmtCurrency(r.baselineTotal)}
        </div>
      )}
      {r.phase && (
        <div className="mt-0.5 text-xs capitalize text-muted">{r.phase} phase</div>
      )}
      {r.total !== undefined && (
        <div className="mt-1 text-[11px] text-accent">Click for a full breakdown →</div>
      )}
    </div>
  );
}

export default function RetirementChart({
  result,
  bands,
  baseline,
  baselineLabel = "Saved plan",
  onSelectYear,
  selectedAge,
  animate = true,
  height = 320,
  showHome = false,
  showTooltip = true,
  wageInflationPct,
  cpiPct,
}: {
  result: SimResult;
  bands?: SpendingBand[];
  baseline?: SimResult | null;
  baselineLabel?: string;
  onSelectYear?: (age: number) => void;
  selectedAge?: number | null;
  animate?: boolean;
  height?: number;
  showHome?: boolean; // add the exempt-home band → a net-worth view
  showTooltip?: boolean; // false hides the floating hover info box ("Chris's Toggle")
  // RG 276 two-stage deflators. When supplied (and wage ≠ CPI) the whole balance
  // line is drawn on a single CPI basis so it stays continuous through retirement.
  wageInflationPct?: number;
  cpiPct?: number;
}) {
  const { retirementAge, partnerRetirementAge, depletedAge } = result;

  // The engine expresses accumulation in wage-indexed dollars and re-bases the
  // stock to CPI dollars at retirement (retiree spending and the Age Pension both
  // index to CPI). For one continuous trajectory we show the whole line on the
  // CPI basis: scale each accumulation point by ((1+wage)/(1+CPI))^t (t = years
  // from the start). Endpoints — today's balance and the retirement figure — are
  // unchanged; only the intermediate accumulation years lift onto the CPI basis.
  const wage = wageInflationPct ?? 0;
  const cpi = cpiPct ?? 0;
  const smooth = Math.abs(wage - cpi) > 1e-9;
  const cpiBasis = (rows: readonly YearRow[]): YearRow[] => {
    if (!smooth || rows.length === 0) return rows as YearRow[];
    const first = rows[0].age;
    const step = (1 + wage / 100) / (1 + cpi / 100);
    return rows.map((r) => {
      if (r.phase !== "accumulation") return r;
      const f = Math.pow(step, r.age - first);
      return { ...r, totalSuper: r.totalSuper * f, outside: r.outside * f, total: r.total * f };
    });
  };

  // Merge current + baseline rows by age so the ghost line can span its own range.
  const byAge = new Map<number, ChartRow>();
  // Net-worth property band = held equity plus, in the sale year only, the sale
  // proceeds (which land in the OUTSIDE opening balance next year, not this one) —
  // so a sale reallocates cleanly with no one-year dip.
  for (const r of cpiBasis(result.rows)) {
    // Split the super band into pension (tax-free) + accumulation (taxed). While
    // accumulating it's all in accumulation; in retirement use the engine's opening
    // split. cpiBasis has already scaled totalSuper, so accumulation-phase accum
    // rides that scaled figure and the two still stack to the plotted super band.
    const isAccum = r.phase === "accumulation";
    byAge.set(r.age, {
      ...r,
      propertyNW: Math.max(0, (r.propertyEquity ?? 0) + (r.breakdown?.propertyProceeds ?? 0)),
      pensionSuper: isAccum ? 0 : r.breakdown?.pensionSuper ?? 0,
      accumSuper: isAccum ? r.totalSuper ?? 0 : r.breakdown?.accumSuper ?? 0,
    });
  }
  if (baseline) {
    // In net-worth mode the ghost line must be baseline NET WORTH (incl. home +
    // property), not just its liquid total, so the two trajectories are comparable.
    for (const r of cpiBasis(baseline.rows)) {
      const ghost = showHome ? rowNetWorth(r) : r.total;
      const e = byAge.get(r.age);
      if (e) e.baselineTotal = ghost;
      else byAge.set(r.age, { age: r.age, baselineTotal: ghost });
    }
  }
  const data = [...byAge.values()].sort((a, b) => a.age - b.age);
  // Only split the super band when there's actually an accumulation balance (super
  // over the Transfer Balance Cap); otherwise it's one clean super band as before.
  const hasSplit = result.rows.some((r) => (r.breakdown?.accumSuper ?? 0) > 1);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={data}
        margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
        onClick={(state: { activeLabel?: string | number }) => {
          const age = Number(state?.activeLabel);
          if (onSelectYear && Number.isFinite(age)) onSelectYear(age);
        }}
        style={onSelectYear ? { cursor: "pointer" } : undefined}
      >
        {selectedAge != null && (
          <ReferenceLine x={selectedAge} stroke="#e2e8f0" strokeWidth={1} strokeOpacity={0.5} />
        )}
        {bands?.map((b) => (
          <ReferenceArea
            key={b.label}
            x1={b.x1}
            x2={b.x2}
            fill={b.fill}
            fillOpacity={0.08}
            stroke="none"
            label={{
              value: b.label,
              position: "insideBottom",
              fill: b.fill,
              fontSize: 11,
            }}
          />
        ))}
        <defs>
          <linearGradient id="superFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="outsideFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="accumFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#eab308" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#eab308" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="homeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#64748b" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#64748b" stopOpacity={0.04} />
          </linearGradient>
          <linearGradient id="propertyFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fb923c" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#fb923c" stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#232c40" vertical={false} />
        <XAxis
          dataKey="age"
          stroke="#8b97ad"
          fontSize={12}
          tickLine={false}
          axisLine={{ stroke: "#232c40" }}
        />
        <YAxis
          stroke="#8b97ad"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={54}
          tickFormatter={fmtCompact}
        />
        {showTooltip && <Tooltip content={<AssetsTooltip baselineLabel={baselineLabel} showHome={showHome} />} />}
        {/* Both labels are CENTERED on their own line (insideTop → textAnchor
            middle at the line's x) so it's obvious which line each names, and
            they're staggered vertically (Retire on top, Pension a row lower) so
            they never overlap even when the ages coincide (e.g. retire 65 vs
            pension 67, or identical). */}
        <ReferenceLine
          x={retirementAge}
          stroke="#f59e0b"
          strokeDasharray="6 4"
          label={{
            value: partnerRetirementAge != null ? `You ${retirementAge}` : `Retire ${retirementAge}`,
            position: "insideTop",
            fill: "#f59e0b",
            fontSize: 11,
            dy: 4,
          }}
        />
        {partnerRetirementAge != null && (
          <ReferenceLine
            x={partnerRetirementAge}
            stroke="#38bdf8"
            strokeDasharray="6 4"
            label={{
              value: `Partner ${partnerRetirementAge}`,
              position: "insideTop",
              fill: "#38bdf8",
              fontSize: 11,
              dy: 40,
            }}
          />
        )}
        <ReferenceLine
          x={result.agePensionAge}
          stroke="#a78bfa"
          strokeDasharray="6 4"
          label={{
            value: `Pension ${result.agePensionAge}`,
            position: "insideTop",
            fill: "#a78bfa",
            fontSize: 11,
            dy: 22,
          }}
        />
        {depletedAge !== null && (
          <ReferenceLine
            x={depletedAge}
            stroke="#ef4444"
            strokeDasharray="2 2"
            label={{
              value: `Depletes ${depletedAge}`,
              position: "center",
              fill: "#ef4444",
              fontSize: 11,
            }}
          />
        )}
        {showHome && (
          <Area
            type="monotone"
            dataKey="homeEquity"
            stackId="1"
            stroke="#64748b"
            strokeWidth={2}
            fill="url(#homeFill)"
            name="Home equity"
            isAnimationActive={animate}
          />
        )}
        {showHome && (
          <Area
            type="monotone"
            dataKey="propertyNW"
            stackId="1"
            stroke="#fb923c"
            strokeWidth={2}
            fill="url(#propertyFill)"
            name="Investment property"
            isAnimationActive={animate}
          />
        )}
        {hasSplit && (
          <Area
            type="monotone"
            dataKey="accumSuper"
            stackId="1"
            stroke="#eab308"
            strokeWidth={2}
            fill="url(#accumFill)"
            name="Accumulation (taxed)"
            isAnimationActive={animate}
          />
        )}
        {hasSplit && (
          <Area
            type="monotone"
            dataKey="pensionSuper"
            stackId="1"
            stroke="#34d399"
            strokeWidth={2}
            fill="url(#superFill)"
            name="Pension (tax-free)"
            isAnimationActive={animate}
          />
        )}
        {!hasSplit && (
          <Area
            type="monotone"
            dataKey="totalSuper"
            stackId="1"
            stroke="#34d399"
            strokeWidth={2}
            fill="url(#superFill)"
            name="Super"
            isAnimationActive={animate}
          />
        )}
        <Area
          type="monotone"
          dataKey="outside"
          stackId="1"
          stroke="#38bdf8"
          strokeWidth={2}
          fill="url(#outsideFill)"
          name="Outside super"
          isAnimationActive={animate}
        />
        {baseline && (
          <Area
            type="monotone"
            dataKey="baselineTotal"
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            fill="none"
            dot={false}
            isAnimationActive={false}
            name={baselineLabel}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
