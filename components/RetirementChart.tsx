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

export interface SpendingBand {
  x1: number;
  x2: number;
  label: string;
  fill: string;
}

type ChartRow = Partial<YearRow> & { age: number; baselineTotal?: number };

function AssetsTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartRow }[];
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-sm shadow-xl">
      <div className="font-semibold text-white">Age {r.age}</div>
      {r.total !== undefined && (
        <div className="tabular-nums text-slate-200">
          Total {fmtCurrency(r.total)}
        </div>
      )}
      {r.totalSuper !== undefined && (
        <div className="tabular-nums text-emerald-400">
          Super {fmtCurrency(r.totalSuper)}
        </div>
      )}
      {r.outside !== undefined && (
        <div className="tabular-nums text-sky-400">
          Outside {fmtCurrency(r.outside)}
        </div>
      )}
      {r.baselineTotal !== undefined && (
        <div className="tabular-nums text-slate-400">
          Saved plan {fmtCurrency(r.baselineTotal)}
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
  onSelectYear,
  selectedAge,
}: {
  result: SimResult;
  bands?: SpendingBand[];
  baseline?: SimResult | null;
  onSelectYear?: (age: number) => void;
  selectedAge?: number | null;
}) {
  const { retirementAge, depletedAge } = result;

  // Merge current + baseline rows by age so the ghost line can span its own range.
  const byAge = new Map<number, ChartRow>();
  for (const r of result.rows) byAge.set(r.age, { ...r });
  if (baseline) {
    for (const r of baseline.rows) {
      const e = byAge.get(r.age);
      if (e) e.baselineTotal = r.total;
      else byAge.set(r.age, { age: r.age, baselineTotal: r.total });
    }
  }
  const data = [...byAge.values()].sort((a, b) => a.age - b.age);

  return (
    <ResponsiveContainer width="100%" height={320}>
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
        <Tooltip content={<AssetsTooltip />} />
        <ReferenceLine
          x={retirementAge}
          stroke="#f59e0b"
          strokeDasharray="6 4"
          label={{
            value: `Retire ${retirementAge}`,
            position: "insideTopLeft",
            fill: "#f59e0b",
            fontSize: 11,
          }}
        />
        <ReferenceLine
          x={result.agePensionAge}
          stroke="#a78bfa"
          strokeDasharray="6 4"
          label={{
            value: "Pension 67",
            position: "insideTopRight",
            fill: "#a78bfa",
            fontSize: 11,
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
        <Area
          type="monotone"
          dataKey="totalSuper"
          stackId="1"
          stroke="#34d399"
          strokeWidth={2}
          fill="url(#superFill)"
          name="Super"
        />
        <Area
          type="monotone"
          dataKey="outside"
          stackId="1"
          stroke="#38bdf8"
          strokeWidth={2}
          fill="url(#outsideFill)"
          name="Outside super"
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
            name="Saved plan"
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
