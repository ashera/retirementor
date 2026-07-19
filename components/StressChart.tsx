"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ReferenceDot, ResponsiveContainer, Tooltip } from "recharts";
import { fmtCompact, fmtCurrency } from "@/lib/au/format";
import type { StressTestResult } from "@/lib/au/stresstest";

// Overlaid balance-over-time: the smooth (no-shock) projection plus each era's path.
// Survivors emerald, a recovered funding gap amber, permanent run-outs red; the
// selected era is highlighted, the rest faded.
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
  // Merge all series onto one row per age.
  const ages = result.central.map((p) => p.age);
  const byId = new Map(result.eras.map((e) => [e.id, new Map(e.path.map((p) => [p.age, p.total]))]));
  const centralByAge = new Map(result.central.map((p) => [p.age, p.total]));
  const data = ages.map((age) => {
    const row: Record<string, number> = { age, central: Math.round(centralByAge.get(age) ?? 0) };
    for (const e of result.eras) row[e.id] = Math.round(byId.get(e.id)?.get(age) ?? 0);
    return row;
  });
  // Mark the funding-gap years on the selected era — the years spending couldn't be
  // met even though the balance can look healthy (the wealth is locked in super).
  const selEra = selectedId ? result.eras.find((e) => e.id === selectedId) : null;
  const gapMarks = selEra?.gapAges.map((age) => ({ age, total: Math.round(byId.get(selEra.id)?.get(age) ?? 0) })) ?? [];

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Balance through each downturn</div>
      <p className="mb-3 text-xs text-muted">
        Today&apos;s dollars. The bright line is your smooth projection; each faint line is one era&apos;s actual path —
        {" "}amber dips then recovers, red runs dry.{" "}
        {gapMarks.length > 0
          ? "The amber dots mark years spending couldn't be fully met — the balance can look healthy here because that wealth is still preserved in super and can't be drawn yet."
          : selectedId
            ? "Selected era highlighted."
            : "Tap a row above to highlight one."}
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#232c40" vertical={false} />
          <XAxis dataKey="age" stroke="#8b97ad" tick={{ fontSize: 11 }} tickMargin={6} />
          <YAxis stroke="#8b97ad" tick={{ fontSize: 11 }} width={44} tickFormatter={fmtCompact} />
          <Tooltip
            contentStyle={{ background: "#0f1523", border: "1px solid #232c40", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#e2e8f0" }}
            labelFormatter={(a) => `Age ${a}`}
            formatter={(v: number, name: string) => [fmtCurrency(v), name === "central" ? "Projection" : name]}
          />
          <ReferenceLine x={result.retireAge} stroke="#a78bfa" strokeDasharray="4 3" strokeOpacity={0.7} />
          {/* Era paths first (underneath), then the central reference on top. */}
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
          <Line
            type="monotone"
            dataKey="central"
            stroke="#38bdf8"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {gapMarks.map((m) => (
            <ReferenceDot
              key={m.age}
              x={m.age}
              y={m.total}
              r={4}
              fill="#fbbf24"
              stroke="#0f1523"
              strokeWidth={1.5}
              ifOverflow="extendDomain"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
