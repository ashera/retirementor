"use client";

import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { fmtCompact } from "@/lib/au/format";
import type { StressTestResult } from "@/lib/au/stresstest";

// Light-theme, static overlay of each era's balance path plus the smooth (no-shock)
// projection — for the printable report. Survivors teal, a recovered gap amber,
// run-dry rose; the central projection in blue. No tooltip/interactivity (print).
export default function ReportStressChart({
  result,
  height = 170,
}: {
  result: StressTestResult;
  height?: number;
}) {
  const byId = new Map(result.eras.map((e) => [e.id, new Map(e.path.map((p) => [p.age, p.total]))]));
  const centralByAge = new Map(result.central.map((p) => [p.age, p.total]));
  const data = result.central.map((p) => {
    const row: Record<string, number> = { age: p.age, central: Math.round(centralByAge.get(p.age) ?? 0) };
    for (const e of result.eras) row[e.id] = Math.round(byId.get(e.id)?.get(p.age) ?? 0);
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 2, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="age" stroke="#cbd5e1" tick={{ fontSize: 10, fill: "#64748b" }} tickMargin={4} height={20} />
        <YAxis stroke="#cbd5e1" tick={{ fontSize: 10, fill: "#64748b" }} width={40} tickFormatter={fmtCompact} />
        <ReferenceLine x={result.retireAge} stroke="#7c3aed" strokeDasharray="4 3" strokeOpacity={0.55} />
        {result.eras.map((e) => (
          <Line
            key={e.id}
            type="monotone"
            dataKey={e.id}
            stroke={e.lasts ? "#0d9488" : e.recovered ? "#d97706" : "#e11d48"}
            strokeWidth={1}
            strokeOpacity={0.5}
            dot={false}
            isAnimationActive={false}
          />
        ))}
        <Line type="monotone" dataKey="central" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
