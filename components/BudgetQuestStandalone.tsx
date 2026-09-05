"use client";

import { useMemo, useState } from "react";
import { fmtCurrency } from "@/lib/au/format";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { questPlanFromInputs } from "@/lib/au/budgetQuest";
import type { Household, RetirementPlan } from "@/lib/au/types";
import BudgetQuest from "@/components/BudgetQuest";

function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { v: T; l: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-panel-2 p-0.5 text-sm">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`rounded-md px-3 py-1.5 font-medium transition ${value === o.v ? "bg-accent/20 text-accent" : "text-muted hover:text-white"}`}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

// The standalone /budget experience: a few quick inputs make the "will it last?"
// constraint real, then Budget Quest plays inline. The CTA seeds the planner's
// localStorage so "See it in your full plan" opens the same budget in the full app.
export default function BudgetQuestStandalone() {
  const [household, setHousehold] = useState<Household>("single");
  const [superBalance, setSuperBalance] = useState(500_000);
  const [retirementAge, setRetirementAge] = useState(67);

  const plan = useMemo<RetirementPlan>(
    () => questPlanFromInputs({ household, superBalance, retirementAge }),
    [household, superBalance, retirementAge],
  );

  const handoff = (update: Partial<RetirementPlan>) => {
    const full: RetirementPlan = { ...plan, ...update };
    try {
      localStorage.setItem("au-retirement-plan", JSON.stringify(full));
      localStorage.setItem("au-retirement-baseline", JSON.stringify(full));
      localStorage.setItem("au-retirement-plan-ts", String(Date.now()));
      localStorage.setItem("au-retirement-plan-owner", "");
    } catch { /* ignore */ }
    window.location.href = "/";
  };

  return (
    <div className="space-y-5">
      {/* Quick inputs */}
      <div className="rounded-2xl border border-line bg-panel p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-accent">A few quick numbers</h3>
        <p className="mt-1 text-[12px] text-muted">So we can tell you whether the lifestyle you design will actually last.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-slate-200">Household</label>
            <div className="mt-2">
              <Segmented value={household} onChange={setHousehold}
                options={[{ v: "single", l: "Single" }, { v: "couple", l: "Couple" }]} />
            </div>
          </div>
          <div>
            <label htmlFor="bq-super" className="text-sm font-medium text-slate-200">Super at retirement</label>
            <div className="mt-2 flex items-baseline gap-1 text-lg font-bold text-white">
              <span className="text-muted">$</span>
              <input id="bq-super" type="text" inputMode="numeric" value={superBalance.toLocaleString("en-AU")}
                onChange={(e) => { const n = Number(e.target.value.replace(/[^\d]/g, "")); if (!Number.isNaN(n)) setSuperBalance(Math.min(n, 20_000_000)); }}
                aria-label="Super at retirement"
                className="w-32 bg-transparent tabular-nums text-white outline-none focus:border-b focus:border-accent" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-sm font-medium text-slate-200">Retire at</label>
              <span className="text-sm font-bold tabular-nums text-white">{retirementAge}</span>
            </div>
            <input type="range" min={55} max={75} step={1} value={retirementAge}
              onChange={(e) => setRetirementAge(Number(e.target.value))}
              aria-label="Retirement age" className="mt-2 w-full accent-emerald-500" />
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted">
          We model your household from {retirementAge} with {fmtCurrency(superBalance)} in super and the family home (exempt). A quick check — the full planner adds tax, the Age Pension, part-time work, and more.
        </p>
      </div>

      {/* The game */}
      <BudgetQuest plan={plan} config={DEFAULT_CONFIG} variant="inline" onCta={handoff} ctaLabel="See it in your full plan →" />

      <p className="text-[11px] leading-relaxed text-muted">
        General information only, using current-year figures in today&apos;s dollars — not personal financial advice. The lifestyle tiers are the ASFA Retirement Standard; whether a budget &ldquo;lasts&rdquo; is our projection on the numbers you enter, not a guarantee.
      </p>
    </div>
  );
}
