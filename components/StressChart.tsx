"use client";

import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, ReferenceDot, ResponsiveContainer, Tooltip } from "recharts";
import { fmtCompact, fmtCurrency } from "@/lib/au/format";
import type { StressTestResult } from "@/lib/au/stresstest";

// Overlaid balance-over-time: the smooth (no-shock) projection plus each era's path.
// Survivors emerald, a recovered funding gap amber, permanent run-outs red; the
// selected era is highlighted, the rest faded.
//
// When the selected era has a locked-super bridge (an early retiree whose super
// hasn't unlocked yet), that era is drawn as a stacked area — a solid "spendable"
// band (outside super) under a hatched "locked in super" band — so you can watch
// the spendable band pinch toward zero at the funding gap while total wealth (the
// top of the stack) still looks healthy.
export default function StressChart({
  result,
  selectedId,
  revealed,
}: {
  result: StressTestResult;
  selectedId: string | null;
  revealed?: Set<string>; // when set, only draw these eras' lines (progressive reveal)
}) {
  const eras = revealed ? result.eras.filter((e) => revealed.has(e.id)) : result.eras;
  const selEra = selectedId ? result.eras.find((e) => e.id === selectedId) : null;
  const selByAge = selEra ? new Map(selEra.path.map((p) => [p.age, p])) : null;
  // Show the spendable/locked split only when the selected era actually has a locked
  // bridge (spendable < total for some year) — otherwise it adds nothing.
  const showBands = !!selEra && selEra.path.some((p) => p.spendable < p.total - 1);
  const selColor = selEra ? (selEra.lasts ? "#34d399" : selEra.recovered ? "#fbbf24" : "#ef4444") : "#fbbf24";

  // Merge all series onto one row per age.
  const ages = result.central.map((p) => p.age);
  const byId = new Map(result.eras.map((e) => [e.id, new Map(e.path.map((p) => [p.age, p.total]))]));
  const centralByAge = new Map(result.central.map((p) => [p.age, p.total]));
  const data = ages.map((age) => {
    const row: Record<string, number> = { age, central: Math.round(centralByAge.get(age) ?? 0) };
    for (const e of result.eras) row[e.id] = Math.round(byId.get(e.id)?.get(age) ?? 0);
    if (showBands && selByAge) {
      const p = selByAge.get(age);
      row.sel_spend = Math.round(p?.spendable ?? 0);
      row.sel_lock = Math.round(Math.max(0, (p?.total ?? 0) - (p?.spendable ?? 0)));
    }
    return row;
  });

  // Mark the funding-gap years — at the spendable level (near the axis), where the
  // spendable band ran dry. Only for a recovered bridge gap; a run-dry era's red line
  // hitting zero already tells its own story.
  const gapMarks =
    selEra && selEra.recovered
      ? selEra.gapAges.map((age) => ({ age, y: Math.round(selByAge?.get(age)?.spendable ?? 0) }))
      : [];

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Balance through each downturn</div>
      <p className="mb-2 text-xs text-muted">
        Today&apos;s dollars. The bright line is your smooth projection; each faint line is one era&apos;s actual path —
        {" "}amber dips then recovers, red runs dry.{" "}
        {showBands
          ? `Selected era split into what you could actually spend vs super still locked away${
              result.superUnlockAge ? ` until age ${result.superUnlockAge}` : ""
            } — watch the spendable band pinch toward zero at the gap.`
          : selectedId
            ? "Selected era highlighted."
            : "Tap a row above to highlight one."}
      </p>
      {showBands && (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-3.5 rounded-sm" style={{ background: selColor, opacity: 0.5 }} aria-hidden />
            Spendable (outside super)
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-3.5 rounded-sm border border-slate-500/50"
              style={{ backgroundImage: "repeating-linear-gradient(45deg, #7c8aa5 0 1.5px, transparent 1.5px 4px)" }}
              aria-hidden
            />
            Locked in super
          </span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 4, left: 8 }}>
          <defs>
            <pattern id="lockedHatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#334155" fillOpacity={0.35} />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#7c8aa5" strokeWidth={1.2} />
            </pattern>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#232c40" vertical={false} />
          <XAxis dataKey="age" stroke="#8b97ad" tick={{ fontSize: 11 }} tickMargin={6} />
          <YAxis stroke="#8b97ad" tick={{ fontSize: 11 }} width={44} tickFormatter={fmtCompact} />
          <Tooltip
            contentStyle={{ background: "#0f1523", border: "1px solid #232c40", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#e2e8f0" }}
            labelFormatter={(a) => `Age ${a}`}
            formatter={(v: number, name: string) => {
              if (name === "sel_spend") return [fmtCurrency(v), "Spendable"];
              if (name === "sel_lock") return [fmtCurrency(v), "Locked in super"];
              return [fmtCurrency(v), name === "central" ? "Projection" : name];
            }}
          />
          <ReferenceLine x={result.retireAge} stroke="#a78bfa" strokeDasharray="4 3" strokeOpacity={0.7} />
          {/* Super-unlock marker — where the locked bridge ends. */}
          {showBands && result.superUnlockAge != null && (
            <ReferenceLine
              x={result.superUnlockAge}
              stroke="#7c8aa5"
              strokeDasharray="2 3"
              strokeOpacity={0.8}
              label={{ value: "super unlocks", position: "insideTopRight", fill: "#8b97ad", fontSize: 10 }}
            />
          )}
          {/* Spendable + locked stack for the selected era (underneath the lines).
              NB: Recharts only detects series that are DIRECT children — do not wrap
              these Areas in a Fragment or they silently vanish. */}
          {showBands && (
            <Area type="monotone" dataKey="sel_spend" stackId="sel" stroke="none" fill={selColor} fillOpacity={0.4} isAnimationActive={false} />
          )}
          {showBands && (
            <Area type="monotone" dataKey="sel_lock" stackId="sel" stroke="none" fill="url(#lockedHatch)" fillOpacity={1} isAnimationActive={false} />
          )}
          {/* Era paths, then the central reference on top. */}
          {eras.map((e) => {
            const sel = selectedId === e.id;
            const dim = selectedId != null && !sel;
            return (
              <Line
                key={e.id}
                type="monotone"
                dataKey={e.id}
                stroke={e.lasts ? "#34d399" : e.recovered ? "#fbbf24" : "#ef4444"}
                strokeWidth={sel ? 2.5 : 1}
                strokeOpacity={dim ? 0.12 : sel ? 1 : 0.45}
                dot={false}
                isAnimationActive={false}
              />
            );
          })}
          <Line type="monotone" dataKey="central" stroke="#38bdf8" strokeWidth={2} dot={false} isAnimationActive={false} />
          {gapMarks.map((m) => (
            <ReferenceDot key={m.age} x={m.age} y={m.y} r={4} fill={selColor} stroke="#0f1523" strokeWidth={1.5} ifOverflow="extendDomain" />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
