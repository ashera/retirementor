"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RbdPoint, SurvivalLens } from "@/lib/au/survivalLens";
import { DualAgeTick, dualAgeLabel, type AgeGapInfo } from "@/components/ageAxis";

const pct = (x: number) => `${Math.round(x * 100)}%`;

function RbdTooltip({ active, payload, ages, couple }: { active?: boolean; payload?: { payload: RbdPoint }[]; ages: AgeGapInfo | null; couple?: boolean }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-white">{ages ? dualAgeLabel(ages, p.age) : `Age ${p.age}`}</div>
      <div className="mb-1.5 text-[11px] text-muted">Out of 100 {couple ? "couples" : "people"} like you, by this age:</div>
      <div className="flex items-center justify-between gap-4 text-emerald-300"><span>Still here, money still lasting</span><span className="tabular-nums">{pct(p.solvent)}</span></div>
      <div className="flex items-center justify-between gap-4 text-red-300"><span>Still here, but money ran out</span><span className="tabular-nums">{pct(p.broke)}</span></div>
      <div className="flex items-center justify-between gap-4 text-muted"><span>No longer alive</span><span className="tabular-nums">{pct(p.dead)}</span></div>
    </div>
  );
}

export default function SurvivalOverlay({
  lens,
  retirementAge,
  ages = null,
  couple = false,
  maxAge = 102,
}: {
  lens: SurvivalLens;
  retirementAge: number;
  ages?: AgeGapInfo | null;
  couple?: boolean;
  maxAge?: number;
}) {
  const data = lens.points.filter((p) => p.age >= Math.floor(retirementAge) && p.age <= maxAge);
  const risk = lens.outliveMoneyRisk;
  const naive = lens.fixedFailRate;

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel-2 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Chance you outlive your money</div>
          <div className="mt-1 text-3xl font-bold text-white tabular-nums">{(risk * 100).toFixed(risk < 0.1 ? 1 : 0)}%</div>
          <p className="mt-1 text-xs text-muted">
            The odds you’re still alive if and when the plan runs short — the Monte-Carlo shortfall risk ({(naive * 100).toFixed(0)}%)
            weighted by how likely you are to be there to see it.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-panel-2 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Why it’s lower than the shortfall rate</div>
          <p className="mt-1 text-xs text-muted">
            A run-out at, say, 95 is counted as a full failure by a run-to-life-expectancy test — but most people aren’t alive then.
            {lens.medianAgeAtDeath != null && ` There’s a 50/50 chance the household is still going at age ${lens.medianAgeAtDeath}.`} Weighting
            by survival gives the honest risk of being <em>alive and broke</em>.
          </p>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis
              dataKey="age"
              tick={ages ? (props) => <DualAgeTick {...props} ages={ages} /> : { fill: "#8b97ad", fontSize: 11 }}
              height={ages ? 34 : 20}
              stroke="#334155"
            />
            <YAxis tickFormatter={pct} domain={[0, 1]} tick={{ fill: "#8b97ad", fontSize: 11 }} stroke="#334155" width={44} />
            <Tooltip content={<RbdTooltip ages={ages} couple={couple} />} />
            {/* Stack bottom→top: solvent, then broke, then dead — sums to 100%. */}
            <Area type="monotone" dataKey="solvent" stackId="rbd" stroke="none" fill="#10b981" fillOpacity={0.55} isAnimationActive={false} name="Alive · money lasting" />
            <Area type="monotone" dataKey="broke" stackId="rbd" stroke="none" fill="#ef4444" fillOpacity={0.65} isAnimationActive={false} name="Alive · run out" />
            <Area type="monotone" dataKey="dead" stackId="rbd" stroke="none" fill="#475569" fillOpacity={0.45} isAnimationActive={false} name="No longer alive" />
            {lens.medianAgeAtDeath != null && (
              <ReferenceLine x={lens.medianAgeAtDeath} stroke="#8b97ad" strokeDasharray="2 3" strokeOpacity={0.7}
                label={{ value: "half are still here", position: "insideTopRight", fill: "#8b97ad", fontSize: 10 }} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#10b981" }} />Still here, money still lasting</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#ef4444" }} />Still here, but money ran out</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#475569" }} />No longer alive</span>
      </div>
    </div>
  );
}
