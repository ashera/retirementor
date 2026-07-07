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
import type { SimResult, YearRow } from "@/lib/au/types";
import { fmtCompact, fmtCurrency } from "@/lib/au/format";

function IncomeTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: YearRow }[];
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const rent = Math.max(0, r.rentIncome ?? 0);
  const salary = Math.max(0, r.salaryIncome ?? 0);
  const total = salary + r.agePension + r.superDrawn + r.outsideDrawn + rent;
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-sm shadow-xl">
      <div className="font-semibold text-white">Age {r.age}</div>
      {salary > 0 && (
        <div className="tabular-nums text-yellow-400">
          Salary {fmtCurrency(salary)}
        </div>
      )}
      {r.agePension > 0 && (
        <div className="tabular-nums text-violet-400">
          Age Pension {fmtCurrency(r.agePension)}
        </div>
      )}
      {rent > 0 && (
        <div className="tabular-nums text-orange-400">
          Net rent {fmtCurrency(rent)}
        </div>
      )}
      {r.superDrawn > 0 && (
        <div className="tabular-nums text-emerald-400">
          From super {fmtCurrency(r.superDrawn)}
        </div>
      )}
      {r.outsideDrawn > 0 && (
        <div className="tabular-nums text-sky-400">
          From outside {fmtCurrency(r.outsideDrawn)}
        </div>
      )}
      <div className="mt-0.5 tabular-nums text-slate-200">
        Total income {fmtCurrency(total)}
      </div>
    </div>
  );
}

export default function IncomeChart({
  result,
  animate = true,
  height = 220,
  onSelectYear,
}: {
  result: SimResult;
  animate?: boolean;
  height?: number;
  onSelectYear?: (age: number) => void;
}) {
  // Show the full timeline (income is $0 through the accumulation years) so this
  // chart's x-axis lines up with the balance chart above it.
  const rows = result.rows;
  if (rows.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted">
        No projection yet.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={rows}
        margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
        onClick={(state: { activeLabel?: string | number }) => {
          const age = Number(state?.activeLabel);
          if (onSelectYear && Number.isFinite(age)) onSelectYear(age);
        }}
        style={onSelectYear ? { cursor: "pointer" } : undefined}
      >
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
        <Tooltip content={<IncomeTooltip />} />
        {/* Guide lines matching the balance chart so the two align vertically. */}
        <ReferenceLine
          x={result.retirementAge}
          stroke="#f59e0b"
          strokeDasharray="6 4"
          strokeOpacity={0.6}
        />
        <ReferenceLine
          x={result.agePensionAge}
          stroke="#a78bfa"
          strokeDasharray="6 4"
          strokeOpacity={0.6}
        />
        <Area
          type="stepAfter"
          dataKey={(r: YearRow) => Math.max(0, r.salaryIncome ?? 0)}
          stackId="1"
          stroke="#facc15"
          fill="#facc15"
          fillOpacity={0.35}
          name="Salary"
          isAnimationActive={animate}
        />
        <Area
          type="stepAfter"
          dataKey="agePension"
          stackId="1"
          stroke="#a78bfa"
          fill="#a78bfa"
          fillOpacity={0.35}
          name="Age Pension"
          isAnimationActive={animate}
        />
        <Area
          type="stepAfter"
          dataKey="superDrawn"
          stackId="1"
          stroke="#34d399"
          fill="#34d399"
          fillOpacity={0.35}
          name="Super"
          isAnimationActive={animate}
        />
        <Area
          type="stepAfter"
          dataKey="outsideDrawn"
          stackId="1"
          stroke="#38bdf8"
          fill="#38bdf8"
          fillOpacity={0.35}
          name="Outside super"
          isAnimationActive={animate}
        />
        <Area
          type="stepAfter"
          dataKey={(r: YearRow) => Math.max(0, r.rentIncome ?? 0)}
          stackId="1"
          stroke="#fb923c"
          fill="#fb923c"
          fillOpacity={0.35}
          name="Net rent"
          isAnimationActive={animate}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
