"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan, SimResult } from "@/lib/au/types";
import { getInvestmentProperties } from "@/lib/au/types";
import { fmtCurrency } from "@/lib/au/format";
import { mortgageAnnualCost } from "@/lib/au/mortgage";
import { updateScenarioNotes } from "@/app/actions/plans";

const cur = (n: number) => fmtCurrency(Math.round(n));

/** A row in the key-aspects summary. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-1.5 last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-right text-sm font-medium tabular-nums text-slate-200">{value}</span>
    </div>
  );
}

/** A read-only summary of the scenario's key aspects + a free-text notes box that
 *  auto-saves to the scenario (owner-only). Launched from the scenario card. */
export default function ScenarioNotesModal({
  plan,
  result,
  successPct,
  applied,
  scenarioId,
  scenarioName,
  initialNotes,
  onSaved,
  onClose,
}: {
  plan: RetirementPlan;
  config: EngineConfig;
  result: SimResult;
  successPct: number;
  applied: { id: string; label: string }[];
  scenarioId: string;
  scenarioName: string;
  initialNotes: string;
  onSaved: (notes: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialNotes);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const savedValue = useRef(initialNotes);

  // Persist to the scenario; refs keep the latest props/text without re-arming effects.
  const flushRef = useRef(async (_val: string) => {});
  flushRef.current = async (val: string) => {
    if (val === savedValue.current) return;
    setStatus("saving");
    const res = await updateScenarioNotes(scenarioId, val);
    if (!res.error) { savedValue.current = val; onSaved(val); setStatus("saved"); }
    else setStatus("idle");
  };
  const latest = useRef(text);
  latest.current = text;

  // Debounced auto-save as the user types.
  useEffect(() => {
    if (text === savedValue.current) return;
    setStatus("idle");
    const t = setTimeout(() => void flushRef.current(text), 800);
    return () => clearTimeout(t);
  }, [text]);

  // Flush the latest on close / unmount (covers ✕ / backdrop / Escape).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); void flushRef.current(latest.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const facts = useMemo(() => {
    const people = plan.people;
    const couple = people.length > 1;
    const startSuper = plan.superMode === "joint" ? plan.jointSuperBalance ?? 0 : people.reduce((s, p) => s + (p.superBalance ?? 0), 0);
    const goal = plan.spendingMode === "stages" ? plan.spendingStages.goGo : plan.targetSpending;
    const props = getInvestmentProperties(plan);
    const mortgage = plan.mortgage;
    const retire = couple && people[1]?.retirementAge != null && people[1].retirementAge !== plan.retirementAge
      ? `You ${plan.retirementAge}, partner ${people[1].retirementAge}`
      : `${plan.retirementAge}`;

    const situation: { label: string; value: string }[] = [
      { label: "Household", value: couple ? "Couple" : "Single" },
      { label: couple ? "Ages now" : "Age now", value: couple ? `${people[0].currentAge} & ${people[1]?.currentAge}` : `${people[0].currentAge}` },
      { label: "Retirement age", value: retire },
      { label: "Super now", value: cur(startSuper) },
    ];
    if (plan.outsideSuper > 0) situation.push({ label: "Savings outside super", value: cur(plan.outsideSuper) });
    situation.push({
      label: "Home",
      value: !plan.homeowner ? "Renting" : mortgage && mortgage.strategy !== "clear_at_retirement" ? `Owned · loan ${cur(mortgageAnnualCost(mortgage))}/yr` : "Owned outright",
    });
    if (props.length) situation.push({ label: "Investment property", value: `${props.length} · ${cur(props.reduce((s, p) => s + (p.value ?? 0), 0))}` });
    situation.push({ label: "Spending goal", value: `${cur(goal)}/yr${plan.spendingMode === "stages" ? " (go-go)" : ""}` });
    situation.push({ label: "Planning to age", value: `${plan.lifeExpectancy}` });

    const outcome: { label: string; value: string }[] = [
      { label: "Money lasts", value: result.lastsToLifeExpectancy ? `projected beyond ${plan.lifeExpectancy}` : result.depletedAge != null ? `projected to run out ~${result.depletedAge}` : "—" },
      { label: "Super at retirement", value: cur(result.superAtRetirement) },
      { label: "Modelled success rate (Monte Carlo)", value: `${successPct}%` },
    ];
    return { situation, outcome };
  }, [plan, result, successPct]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Scenario notes</div>
            <h2 className="mt-0.5 truncate text-lg font-bold text-white">{scenarioName}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-xl leading-none text-muted transition hover:text-white" aria-label="Close">×</button>
        </div>

        <div className="grid gap-5 overflow-y-auto px-6 py-5 sm:grid-cols-2">
          {/* Key aspects */}
          <div className="space-y-4 sm:col-span-1">
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Your situation</h3>
              <div className="rounded-xl border border-line bg-panel-2 px-4 py-1.5">
                {facts.situation.map((f) => <Fact key={f.label} {...f} />)}
              </div>
            </section>
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Projected outcome</h3>
              <div className="rounded-xl border border-line bg-panel-2 px-4 py-1.5">
                {facts.outcome.map((f) => <Fact key={f.label} {...f} />)}
              </div>
            </section>
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Strategies applied</h3>
              <div className="rounded-xl border border-line bg-panel-2 px-4 py-2.5">
                {applied.length === 0 ? (
                  <span className="text-sm text-muted">None — base plan.</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {applied.map((a) => (
                      <span key={a.id} className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">{a.label}</span>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Notes */}
          <div className="flex flex-col sm:col-span-1">
            <div className="mb-1 flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Your notes</h3>
              <span className="text-[11px] text-muted">
                {status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : text !== savedValue.current ? "Unsaved" : ""}
              </span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Why this scenario, what you're testing, decisions, questions for your adviser…"
              className="min-h-[220px] flex-1 resize-y rounded-xl border border-line bg-panel-2 px-4 py-3 text-sm leading-relaxed text-slate-100 outline-none placeholder:text-muted/70 focus:border-accent"
            />
            <p className="mt-2 text-[11px] leading-snug text-muted">
              Private to you — notes are saved to this scenario and never appear in a shared link.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
