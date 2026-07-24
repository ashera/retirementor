"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan } from "@/lib/au/types";
import { fmtCurrency, fmtCompact } from "@/lib/au/format";
import { guardrailsTimeline, guardrailsStoryMode, yearsBelowStart, type GuardrailsTimelinePoint } from "@/lib/au/guardrails";
import { runMonteCarlo, MC_CONFIDENCE_MC } from "@/lib/au/montecarlo";
import { essentialsFloor } from "@/lib/au/strategies";
import { retirementGoal } from "@/lib/au/goal";
import SpendingBreakdown from "@/components/SpendingBreakdown";

const toneClass = (pct: number) => (pct >= 85 ? "text-accent" : pct >= 60 ? "text-amber-400" : "text-red-400");

function SpendTooltip({ active, payload }: { active?: boolean; payload?: { payload: GuardrailsTimelinePoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const tag = p.action === "cut" ? "cut ▼" : p.action === "raise" ? "raise ▲" : p.action === "start" ? "start" : "held";
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold text-white">Age {p.age}</div>
      <div className="tabular-nums text-slate-200">{fmtCurrency(p.spend)}/yr</div>
      <div className="tabular-nums text-muted">rate {(p.rate * 100).toFixed(1)}% · {tag}</div>
    </div>
  );
}

/** One numbered step in the story. */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <div className="space-y-2 text-sm leading-relaxed text-slate-300">{children}</div>
      </div>
    </div>
  );
}

export default function GuardrailsTimelineModal({
  open,
  onClose,
  plan,
  config,
}: {
  open: boolean;
  onClose: () => void;
  plan: RetirementPlan;
  config: EngineConfig;
}) {
  const [showRate, setShowRate] = useState(false);

  const d = useMemo(() => {
    if (!open) return null;
    const flexPlan = { ...plan, guardrails: plan.guardrails ?? {} };
    const fixedPlan = { ...plan, guardrails: undefined };
    const flexTl = guardrailsTimeline(flexPlan, config);
    const fixedTl = guardrailsTimeline(fixedPlan, config);
    const fixedSuccess = Math.round(runMonteCarlo(fixedPlan, config, MC_CONFIDENCE_MC).successRate * 100);
    const flexSuccess = Math.round(runMonteCarlo(flexPlan, config, MC_CONFIDENCE_MC).successRate * 100);
    const goal = retirementGoal(flexPlan);
    const essential = Math.min(essentialsFloor(flexPlan, config), goal.living);
    const discretionary = Math.max(0, goal.living - essential);
    const minSpend = flexTl.points.length ? Math.min(...flexTl.points.map((p) => p.spend)) : flexTl.start;
    return {
      tl: flexTl,
      fixedTl,
      fixedSuccess,
      flexSuccess,
      goal,
      essential,
      discretionary,
      loan: goal.loanCost,
      minSpend,
      estimated: !flexPlan.budget,
    };
  }, [open, plan, config]);

  if (!open || !d) return null;
  const { tl, fixedTl, fixedSuccess, flexSuccess, goal, essential, discretionary, loan, minSpend, estimated } = d;

  const flexFails = tl.failsAtAge != null;
  const fixedFails = fixedTl.failsAtAge != null;
  const allEssentials = tl.floor >= tl.start * 0.9;
  // Which narrative to tell — a pure, shared, unit-tested decision (guardrails.ts).
  // "raised" (comfortably-funded upside) requires staying at/above start for most of
  // retirement, not merely ending above it; "recovers" = trim then ease back;
  // "holds" = trim and stay there. yrsBelow measures how long the rough run bites.
  const story = guardrailsStoryMode(tl);
  const raised = story === "raised";
  const recovers = story === "recovers";
  const yrsBelow = yearsBelowStart(tl);
  // The timeline works in LIVING spend (what flexes); add the fixed home loan so
  // the story shows TOTAL spend, consistent with the spending bar (step 2). The
  // loan is never trimmed, so the total cut % is smaller than the living cut %.
  const startTotal = tl.start + loan;
  const floorTotal = tl.floor + loan;
  const minTotal = minSpend + loan;
  const cutPct = startTotal > 0 ? Math.round((1 - minTotal / startTotal) * 100) : 0;
  const coinFlip = fixedSuccess <= 60 && flexSuccess >= 88;

  // Chart data for step 3.
  const plotEnd = flexFails ? tl.failsAtAge! : Infinity;
  const rateCap = Math.max(0.25, tl.upperRail * 3);
  const dipStart = tl.points.length ? tl.points[0].age : 0;
  const dipEnd = dipStart + tl.dipYears;
  const spendData = tl.points.filter((p) => p.age <= plotEnd).map((p) => ({ ...p, spend: p.spend + loan }));
  const rateData = tl.points
    .filter((p) => p.age <= plotEnd && p.funded)
    .map((p) => ({ ...p, ratePct: +(Math.min(p.rate, rateCap) * 100).toFixed(2) }));

  // Step ①: the return sequence being tested — a few normal years, the downturn at
  // retirement, then a few more normal years. Green above the line, red below.
  const retireAge = dipStart;
  const returnsData: { age: number; ret: number }[] = [];
  for (let age = retireAge - 3; age < retireAge + tl.dipYears + 5; age++) {
    const inDip = age >= retireAge && age < retireAge + tl.dipYears;
    returnsData.push({ age, ret: inDip ? tl.dip : tl.meanReturn });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/whatif-icon.png" alt="" aria-hidden className="h-7 w-7 shrink-0" style={{ mixBlendMode: "lighten" }} />
            <h2 className="truncate text-base font-bold text-white">How guardrails work for your plan</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted transition hover:bg-panel-2 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4">
          <p className="text-sm text-muted">
            Guardrails let your spending flex with the markets. Here&apos;s what that means for your plan, in four
            steps — stress-tested by retiring straight into a {tl.dipYears}-year downturn.
          </p>

          {/* ① The risk */}
          <Step n={1} title="The risk in your plan">
            <p>
              {fixedFails ? (
                <>
                  Retire into a bad run of markets and a fixed <strong className="text-white">{fmtCurrency(goal.total)}/yr</strong>{" "}
                  can run you short — in this stress test it runs out around <strong className="text-white">age {fixedTl.failsAtAge}</strong>.
                </>
              ) : (
                <>
                  Even in a bad run, a fixed <strong className="text-white">{fmtCurrency(goal.total)}/yr</strong> holds up here — but a
                  rough start in your first years is the main danger.
                </>
              )}{" "}
              Across all market scenarios, a fixed spend lasts{" "}
              <strong className={toneClass(fixedSuccess)}>{fixedSuccess}%</strong> of the time.
            </p>
            <div className="rounded-xl border border-line bg-panel-2 p-3">
              <ResponsiveContainer width="100%" height={152}>
                <BarChart data={returnsData} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#232c40" vertical={false} />
                  <XAxis dataKey="age" stroke="#8b97ad" fontSize={10} tickLine={false} axisLine={{ stroke: "#232c40" }} />
                  <YAxis stroke="#8b97ad" fontSize={10} tickLine={false} axisLine={false} width={34} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    cursor={{ fill: "#ffffff10" }}
                    formatter={(v: number) => [`${v}%`, "Return"]}
                    labelFormatter={(l) => `Age ${l}`}
                    contentStyle={{ background: "#0f1520", border: "1px solid #232c40", borderRadius: 8, fontSize: 12 }}
                  />
                  <ReferenceLine y={0} stroke="#475569" />
                  <ReferenceLine x={retireAge} stroke="#a78bfa" strokeDasharray="3 3" label={{ value: "Retire", position: "top", fill: "#a78bfa", fontSize: 9 }} />
                  <Bar dataKey="ret" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                    {returnsData.map((r) => (
                      <Cell key={r.age} fill={r.ret < 0 ? "#f87171" : "#34d399"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-1 text-[10px] text-muted">
                The market path we&apos;re testing: {Math.abs(tl.dip)}% falls for {tl.dipYears} years right as you retire,
                then {tl.meanReturn}%/yr. It&apos;s the <em>timing</em> — a crash just as you start drawing on your savings,
                when your withdrawals stop them recovering — that does the damage.
              </p>
            </div>
          </Step>

          {/* ② The lever */}
          <Step n={2} title="The lever you already have">
            <p>
              {allEssentials ? (
                <>
                  Almost all of your spending is <strong className="text-white">essentials</strong> — there&apos;s very little
                  discretionary to ease off, which limits what guardrails can do.
                </>
              ) : (
                <>
                  You don&apos;t have to spend the same no matter what. <strong className="text-white">{fmtCurrency(discretionary)}/yr</strong>{" "}
                  of your spend is <strong className="text-white">discretionary</strong> — the part you can dial down. Essentials
                  {loan > 0 ? " and your home loan" : ""} stay fixed.
                </>
              )}
            </p>
            <SpendingBreakdown essential={essential} discretionary={discretionary} loan={loan} estimated={estimated} />
          </Step>

          {/* ③ How it trims */}
          <Step n={3} title="How guardrails pull the lever">
            <p>
              {flexFails ? (
                allEssentials ? (
                  <>
                    With so little discretionary to trim, guardrails can only ease spending slightly — and in this bad run it
                    still runs short around <strong className="text-white">age {tl.failsAtAge}</strong>.
                  </>
                ) : (
                  <>
                    Guardrails trim the discretionary part down to your <strong className="text-white">{fmtCurrency(tl.floor)}</strong>{" "}
                    floor, but even that isn&apos;t enough here — it still runs short around{" "}
                    <strong className="text-white">age {tl.failsAtAge}</strong>.
                  </>
                )
              ) : raised ? (
                <>
                  Your savings comfortably outpace your spending, so guardrails mostly hand you <strong className="text-white">raises</strong> —
                  spending climbs to about <strong className="text-white">{fmtCurrency(tl.plateauSpend)}</strong> by the end.
                </>
              ) : recovers ? (
                <>
                  After a bad start, guardrails trim total spend to about{" "}
                  <strong className="text-amber-300">{fmtCurrency(minTotal)}</strong> (−{cutPct}%), and it stays below your{" "}
                  <strong className="text-white">{fmtCurrency(startTotal)}</strong> start for about{" "}
                  <strong className="text-white">{yrsBelow} years</strong> — then, once the Age Pension arrives
                  {tl.pensionAge != null ? ` at ${tl.pensionAge}` : ""}, spending eases back up, reaching about{" "}
                  <strong className="text-white">{fmtCurrency(tl.plateauSpend + loan)}</strong> by the end. Essentials{loan > 0 ? " and your home loan" : ""} never get cut.
                </>
              ) : (
                <>
                  After the downturn, guardrails trim the discretionary part ~10% a year — total spend down to about{" "}
                  <strong className="text-amber-300">{fmtCurrency(floorTotal)}</strong> (−{cutPct}%) — and{" "}
                  <strong className="text-white">hold there for the rest of retirement</strong>. At this spending level the
                  Age Pension is too small a slice to lift the draw back below the rail, so there&apos;s no raise back — you
                  can see the withdrawal rate keep climbing in the rate view. Essentials{loan > 0 ? " and your home loan" : ""} never get cut.
                </>
              )}
            </p>

            <div className="rounded-xl border border-line bg-panel-2 p-3">
              <ResponsiveContainer width="100%" height={210}>
                {showRate ? (
                  <LineChart data={rateData} margin={{ top: 20, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#232c40" vertical={false} />
                    <ReferenceArea x1={dipStart} x2={dipEnd} fill="#f87171" fillOpacity={0.09} />
                    <XAxis dataKey="age" type="number" domain={["dataMin", "dataMax"]} stroke="#8b97ad" fontSize={11} tickLine={false} axisLine={{ stroke: "#232c40" }} />
                    <YAxis stroke="#8b97ad" fontSize={11} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(v: number) => [`${v}%`, "Withdrawal rate"]} labelFormatter={(l) => `Age ${l}`} contentStyle={{ background: "#0f1520", border: "1px solid #232c40", borderRadius: 8, fontSize: 12 }} />
                    <ReferenceLine y={+(tl.upperRail * 100).toFixed(2)} stroke="#f87171" strokeDasharray="5 4" label={{ value: "Cut above", position: "insideTopRight", fill: "#f87171", fontSize: 10 }} />
                    <ReferenceLine y={+(tl.lowerRail * 100).toFixed(2)} stroke="#34d399" strokeDasharray="5 4" label={{ value: "Raise below", position: "insideBottomLeft", fill: "#34d399", fontSize: 10 }} />
                    {tl.pensionAge != null && <ReferenceLine x={tl.pensionAge} stroke="#a78bfa" strokeDasharray="4 3" label={{ value: "Age Pension", position: "top", fill: "#a78bfa", fontSize: 10 }} />}
                    {flexFails && <ReferenceLine x={tl.failsAtAge!} stroke="#f87171" strokeDasharray="2 3" label={{ value: "Runs short", position: "top", fill: "#f87171", fontSize: 10 }} />}
                    <Line type="monotone" dataKey="ratePct" stroke="#38bdf8" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                ) : (
                  <LineChart data={spendData} margin={{ top: 20, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#232c40" vertical={false} />
                    <ReferenceArea x1={dipStart} x2={dipEnd} fill="#f87171" fillOpacity={0.09} />
                    <XAxis dataKey="age" type="number" domain={["dataMin", "dataMax"]} stroke="#8b97ad" fontSize={11} tickLine={false} axisLine={{ stroke: "#232c40" }} />
                    <YAxis stroke="#8b97ad" fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={fmtCompact} />
                    <Tooltip content={<SpendTooltip />} />
                    <ReferenceLine y={startTotal} stroke="#94a3b8" strokeDasharray="5 4" label={{ value: `Started ${fmtCompact(startTotal)}`, position: "insideTopLeft", fill: "#94a3b8", fontSize: 10 }} />
                    {/* A single floor line only makes sense for a flat plan — with a
                        spending smile the floor declines with each stage, so drawing one
                        fixed line would sit above the natural no-go spend and mislead. */}
                    {plan.spendingMode !== "stages" && tl.floor < tl.start * 0.98 && <ReferenceLine y={floorTotal} stroke="#f59e0b" strokeDasharray="5 4" label={{ value: `Floor ${fmtCompact(floorTotal)}`, position: "insideBottomLeft", fill: "#f59e0b", fontSize: 10 }} />}
                    {tl.pensionAge != null && <ReferenceLine x={tl.pensionAge} stroke="#a78bfa" strokeDasharray="4 3" label={{ value: "Age Pension", position: "top", fill: "#a78bfa", fontSize: 10 }} />}
                    {flexFails && <ReferenceLine x={tl.failsAtAge!} stroke="#f87171" strokeDasharray="2 3" label={{ value: "Runs short", position: "top", fill: "#f87171", fontSize: 10 }} />}
                    <Line type="stepAfter" dataKey="spend" stroke="#34d399" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                )}
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-3.5 rounded-sm bg-[#f87171]/25" />
                  {tl.dip}%/yr for the first {tl.dipYears} years, then {tl.meanReturn}%/yr (your assumed return).
                </span>
                <button type="button" onClick={() => setShowRate((v) => !v)} className="font-medium text-accent hover:underline">
                  {showRate ? "← Back to spending" : "Show the rate mechanism →"}
                </button>
              </div>
            </div>
          </Step>

          {/* ④ The result */}
          <Step n={4} title="The result">
            <p>
              {flexFails ? (
                <>
                  Even with that flexibility, this plan still runs short. Flexibility narrows the gap —{" "}
                  <strong className="text-white">{fixedSuccess}% → {flexSuccess}%</strong> likely to last — but can&apos;t close
                  it: you&apos;d need to spend less, retire later, or save more.
                </>
              ) : raised ? (
                <>
                  You&apos;re comfortably funded — flexibility is <strong className="text-white">upside</strong> here, not a
                  rescue. You stay <strong className={toneClass(flexSuccess)}>{flexSuccess}%</strong> likely to last while
                  spending more in the good years.
                </>
              ) : (
                <>
                  {coinFlip ? "That flexibility turns a coin-flip into near-certain: " : "That flexibility lifts your odds: "}
                  <strong className="text-white">{fixedSuccess}% → {flexSuccess}%</strong> likely to last.{" "}
                  {recovers ? (
                    <>The cost — the belt-tightening in step 3 — is real but eases: the Age Pension does much of the recovery.</>
                  ) : (
                    <>The cost sticks, though: spending holds at the trimmed level for the rest of retirement — that permanent trim is exactly what keeps the plan from running short.</>
                  )}
                </>
              )}
            </p>
            <div className="space-y-2 rounded-lg border border-line bg-ink/40 px-3 py-2.5">
              {[
                { label: "Fixed spending", pct: fixedSuccess, color: "#f59e0b" },
                { label: "With guardrails", pct: flexSuccess, color: "#34d399" },
              ].map((b) => (
                <div key={b.label} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted">{b.label}</span>
                    <span className={`font-semibold tabular-nums ${toneClass(b.pct)}`}>{b.pct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-panel">
                    <div className="h-full rounded-full" style={{ width: `${b.pct}%`, backgroundColor: b.color }} />
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-muted">Chance your money lasts to age {plan.lifeExpectancy}, across many market scenarios.</p>
            </div>
          </Step>
        </div>
      </div>
    </div>
  );
}
