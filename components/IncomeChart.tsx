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
import { breakSpans, breakSpanLabel } from "@/lib/au/breakSpans";

function IncomeTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: YearRow }[];
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  // Net rent AFTER income tax (a negative-gearing loss is reduced by its tax benefit)
  // — consistent with take-home being after-tax. NEGATIVE for a geared property.
  const rentRaw = (r.rentIncome ?? 0) - (r.breakdown?.rentTax ?? 0);
  const rent = Math.max(0, rentRaw);
  const shortfall = Math.max(0, -rentRaw);
  const salary = Math.max(0, r.salaryIncome ?? 0);
  const takeHome = Math.max(0, r.takeHome ?? 0);
  const work = Math.max(0, r.workIncome ?? 0);
  // Net the after-tax rent so a geared property's shortfall isn't double-counted: the
  // extra drawdown that covers it is already in super/outside, so the household's
  // real income is that drawdown LESS the shortfall (i.e. it equals spending).
  const total = takeHome + work + r.agePension + r.superDrawn + r.outsideDrawn + rentRaw;
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-sm shadow-xl">
      <div className="font-semibold text-white">Age {r.age}</div>
      {takeHome > 0 && (
        <div className="tabular-nums text-yellow-400">
          Take-home pay {fmtCurrency(takeHome)}
          {salary > 0 && <span className="text-muted"> (from {fmtCurrency(salary)} salary)</span>}
        </div>
      )}
      {work > 0 && (
        <div className="tabular-nums text-pink-400">
          Part-time work {fmtCurrency(work)}
        </div>
      )}
      {r.agePension > 0 && (
        <div className="tabular-nums text-violet-400">
          Age Pension {fmtCurrency(r.agePension)}
        </div>
      )}
      {rent > 0 && (
        <div className="tabular-nums text-orange-400">
          Net rent (after tax) {fmtCurrency(rent)}
        </div>
      )}
      {shortfall > 0 && (
        <div className="tabular-nums text-orange-400">
          Rental shortfall −{fmtCurrency(shortfall)}
          <span className="text-muted"> (funded from drawdown)</span>
        </div>
      )}
      {r.superDrawn > 0 &&
        ((r.breakdown?.accumDrawn ?? 0) > 1 ? (
          <>
            <div className="tabular-nums text-emerald-400">
              From pension {fmtCurrency((r.breakdown?.minDrawdown ?? 0) + (r.breakdown?.pensionExtraDrawn ?? 0))}
            </div>
            <div className="tabular-nums text-yellow-500">
              From accumulation {fmtCurrency(r.breakdown?.accumDrawn ?? 0)}
            </div>
          </>
        ) : (
          <div className="tabular-nums text-emerald-400">
            From super {fmtCurrency(r.superDrawn)}
          </div>
        ))}
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
  minDrawdownBands,
}: {
  result: SimResult;
  animate?: boolean;
  height?: number;
  onSelectYear?: (age: number) => void;
  minDrawdownBands?: readonly { minAge: number; rate: number }[];
}) {
  // Show the full timeline (income is $0 through the accumulation years) so this
  // chart's x-axis lines up with the balance chart above it.
  const rows = result.rows;
  // Split the "from super" band into pension vs accumulation drawdown only when
  // accumulation is actually DRAWN as income; an accumulation balance that's never
  // tapped would otherwise show an empty band + legend entry.
  const hasSplit = rows.some((r) => (r.breakdown?.accumDrawn ?? 0) > 1);
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
        margin={{ top: 18, right: 8, left: 8, bottom: 0 }}
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
        {/* Career-break ("gap year") spans — shaded so a multi-year break reads as its
            full length (the stepped income bands sit half a column off their ticks). */}
        {breakSpans(rows).map((s) => (
          <ReferenceArea
            key={`brk-${s.from}`}
            x1={s.from}
            x2={s.to + 1}
            fill="#f59e0b"
            fillOpacity={0.12}
            stroke="#f59e0b"
            strokeOpacity={0.35}
            strokeDasharray="3 3"
            label={{ value: breakSpanLabel(s), position: "insideTop", fill: "#fbbf24", fontSize: 10 }}
          />
        ))}
        {/* Super's minimum drawdown % steps up at these ages, which forces more out
            of super — nudging the super-vs-savings split and causing visible steps. */}
        {(minDrawdownBands ?? [])
          .filter((b) => b.minAge > result.retirementAge && b.minAge > rows[0].age && b.minAge < rows[rows.length - 1].age)
          .map((b) => (
            <ReferenceLine
              key={`dd-${b.minAge}`}
              x={b.minAge}
              stroke="#64748b"
              strokeDasharray="2 3"
              strokeOpacity={0.45}
              label={{ value: `min ${Math.round(b.rate * 100)}%`, position: "top", fill: "#64748b", fontSize: 10 }}
            />
          ))}
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
          dataKey={(r: YearRow) => Math.max(0, r.takeHome ?? 0)}
          stackId="1"
          stroke="#facc15"
          fill="#facc15"
          fillOpacity={0.35}
          name="Take-home pay"
          isAnimationActive={animate}
        />
        <Area
          type="stepAfter"
          dataKey={(r: YearRow) => Math.max(0, r.workIncome ?? 0)}
          stackId="1"
          stroke="#f472b6"
          fill="#f472b6"
          fillOpacity={0.35}
          name="Part-time work"
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
        {!hasSplit && (
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
        )}
        {hasSplit && (
          <Area
            type="stepAfter"
            dataKey={(r: YearRow) => Math.max(0, (r.breakdown?.accumDrawn ?? 0))}
            stackId="1"
            stroke="#eab308"
            fill="#eab308"
            fillOpacity={0.35}
            name="Super — accumulation"
            isAnimationActive={animate}
          />
        )}
        {hasSplit && (
          <Area
            type="stepAfter"
            dataKey={(r: YearRow) => Math.max(0, (r.breakdown?.minDrawdown ?? 0) + (r.breakdown?.pensionExtraDrawn ?? 0))}
            stackId="1"
            stroke="#34d399"
            fill="#34d399"
            fillOpacity={0.35}
            name="Super — pension"
            isAnimationActive={animate}
          />
        )}
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
          dataKey={(r: YearRow) => Math.max(0, (r.rentIncome ?? 0) - (r.breakdown?.rentTax ?? 0))}
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
