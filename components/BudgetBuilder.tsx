"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import type { EngineConfig } from "@/lib/au/config";
import { fmtCurrency } from "@/lib/au/format";
import { simulate } from "@/lib/au/simulate";
import {
  BUDGET_CATEGORY_META,
  budgetSplit,
  budgetToStages,
  budgetTotal,
  presetCategories,
  type BudgetCategoryMeta,
} from "@/lib/au/budget";
import { mortgageAnnualCost } from "@/lib/au/mortgage";
import type {
  BudgetLifestyle,
  HomeDetail,
  HomeTenure,
  MortgageDetail,
  RetirementBudget,
  RetirementPlan,
  SpendingStages,
} from "@/lib/au/types";
import Field from "@/components/Field";
import { DEFAULT_HOME, defaultMortgage } from "@/components/HomeEditor";
import BudgetCategoryIcon, { CATEGORY_COLOR } from "@/components/BudgetCategoryIcon";
import TrimSpendingModal from "@/components/TrimSpendingModal";
import BoostSpendingModal from "@/components/BoostSpendingModal";
import CategoryQuiz from "@/components/CategoryQuiz";
import { boostSpending } from "@/lib/au/goalseek";


interface BudgetBuilderProps {
  plan: RetirementPlan;
  config: EngineConfig;
  onApply: (update: Partial<RetirementPlan>) => void;
  onProgress?: (update: Partial<RetirementPlan>) => void; // continuous save — apply without closing
  onClose: () => void;
  onSwitchToPlay?: () => void; // switch to the Budget Quest play mode (opt-in)
}

const LIFESTYLES: { key: BudgetLifestyle; label: string; blurb: string }[] = [
  { key: "modest", label: "Modest", blurb: "Covers the basics with a little for fun" },
  { key: "comfortable", label: "Comfortable", blurb: "The ASFA benchmark — travel, dining, hobbies" },
  { key: "premium", label: "Premium", blurb: "A generous lifestyle with room to spare" },
];

// The "home" step only appears when the user owns their home (see stepKeys below).
const STEP_TITLES: Record<string, string> = {
  setup: "Setup",
  budget: "Your budget",
  phases: "Later years",
  goal: "Your goal",
};

/** Debounce a value so heavy derived work (full projections / Monte-Carlo solvers)
 *  runs only after the user pauses — keeping sliders and numeric fields responsive
 *  while typing/dragging, instead of re-simulating on every keystroke or frame. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function BudgetBuilder({ plan, config, onApply, onProgress, onClose, onSwitchToPlay }: BudgetBuilderProps) {
  const household = plan.household;
  const oldestAtRetire =
    Math.max(...plan.people.map((p) => p.currentAge)) +
    Math.max(0, plan.retirementAge - plan.people[0].currentAge);

  // Returning to edit an existing budget? Jump straight to the last (goal) page
  // — safeStep clamps this to the real last index. New budgets start at Setup.
  const [step, setStep] = useState(plan.budget ? 99 : 0);
  // The family home now lives in the plan (its own "Your home" wizard step). The budget
  // only READS it — to drive the ASFA presets, model any loan, and show a summary — so
  // there's one place to edit it. Tenure is derived from the plan's home fields.
  const tenure: HomeTenure = !plan.homeowner ? "rent" : plan.mortgage ? "mortgage" : "own";
  const mortgage: MortgageDetail = plan.mortgage ?? defaultMortgage(oldestAtRetire);
  const home: HomeDetail = plan.home ?? DEFAULT_HOME;
  const [lifestyle, setLifestyle] = useState<BudgetLifestyle>(
    plan.budget?.lifestyle ?? "comfortable",
  );
  const homeowner = tenure !== "rent";
  const [categories, setCategories] = useState<Record<string, number>>(
    () =>
      plan.budget?.categories ??
      presetCategories(config, household, plan.homeowner, plan.budget?.lifestyle ?? "comfortable"),
  );
  const [applyPhases, setApplyPhases] = useState(plan.budget?.applyPhases ?? true);
  const [monthly, setMonthly] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  // Directly-editable total: type a figure and every category scales by the same
  // factor, so the essentials/discretionary mix (the pie) stays put — lets people
  // dial the whole budget without opening individual line items.
  const [editingTotal, setEditingTotal] = useState(false);
  const [totalText, setTotalText] = useState("");
  // Per-category "work it out" quiz — which category's quiz is open (null = none).
  const [quizKey, setQuizKey] = useState<string | null>(null);
  // Snapshot of the category mix taken when total-editing starts, so every
  // keystroke scales from the ORIGINAL mix (not the already-scaled interim, which
  // would collapse the shares to zero as you type the first digits).
  const baseCatsRef = useRef<Record<string, number> | null>(null);

  const total = budgetTotal(categories);
  const { essential, discretionary } = budgetSplit(categories);
  const stages = useMemo(() => budgetToStages(config, categories), [config, categories]);

  // The loan the engine should model (undefined unless the user has a mortgage).
  const activeMortgage = tenure === "mortgage" ? mortgage : undefined;
  // The home asset (undefined for renters). Exempt, so it doesn't affect the sim.
  const activeHome = homeowner ? home : undefined;

  // Build a working plan at a given spend, honouring phases + any mortgage.
  const workingPlan = useMemo(() => {
    const base: RetirementPlan = applyPhases
      ? { ...plan, spendingMode: "stages", spendingStages: stages, targetSpending: total }
      : { ...plan, spendingMode: "flat", targetSpending: total };
    return { ...base, homeowner, mortgage: activeMortgage, home: activeHome };
  }, [plan, stages, total, applyPhases, homeowner, activeMortgage, activeHome]);

  // The heavy simulations (impact / boost / strategy compare) run off a DEBOUNCED
  // plan, so dragging a slider or typing a figure stays responsive. boostSpending in
  // particular runs a Monte-Carlo binary search (~thousands of simulate() calls,
  // ~250ms) — far too expensive to run on every keystroke/drag frame; debouncing
  // recomputes these once, ~300ms after the user pauses.
  const debouncedWorkingPlan = useDebounced(workingPlan, 300);

  // "Money lasts" impact of the current budget (+ mortgage).
  const impact = useMemo(() => simulate(debouncedWorkingPlan, config), [debouncedWorkingPlan, config]);

  // The working plan carrying the in-progress budget, so the trim can scale the
  // discretionary categories (and we apply the result straight back into them).
  const [trimOpen, setTrimOpen] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);
  const budgetPlan = useMemo(
    () => ({ ...workingPlan, budget: { tenure, lifestyle, categories, applyPhases } }),
    [workingPlan, tenure, lifestyle, categories, applyPhases],
  );
  // Cheap when the budget doesn't last (boostSpending short-circuits after one
  // sim); the ~binary-search cost is only paid when there's genuine headroom. Also
  // debounced — a slider drag shouldn't run the MC solver every frame.
  const debouncedBudgetPlan = useDebounced(budgetPlan, 300);
  const boost = useMemo(() => boostSpending(debouncedBudgetPlan, config), [debouncedBudgetPlan, config]);
  const applyBudgetPatch = (patch: Partial<RetirementPlan>) => {
    if (patch.budget?.categories) setCategories(patch.budget.categories);
  };

  const setCat = (key: string, annual: number) =>
    setCategories((prev) => ({ ...prev, [key]: Math.max(0, Math.round(annual)) }));

  // Scale a base category mix so it lands on a typed annual total, preserving each
  // category's share. The rounding residual goes on the largest category so the
  // total is exact.
  const scaleFrom = (base: Record<string, number>, newAnnual: number) => {
    const cur = budgetTotal(base);
    if (cur <= 0 || !Number.isFinite(newAnnual) || newAnnual < 0) return;
    const f = newAnnual / cur;
    const keys = Object.keys(base);
    const next: Record<string, number> = {};
    let sum = 0;
    for (const k of keys) {
      next[k] = Math.max(0, Math.round(base[k] * f));
      sum += next[k];
    }
    const residual = Math.round(newAnnual) - sum;
    if (residual !== 0 && keys.length) {
      const big = keys.reduce((a, b) => (next[b] > next[a] ? b : a), keys[0]);
      next[big] = Math.max(0, next[big] + residual);
    }
    setCategories(next);
  };

  const applyPreset = (ls: BudgetLifestyle) => {
    setLifestyle(ls);
    setCategories(presetCategories(config, household, homeowner, ls));
  };

  const toggleOpen = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // The plan patch this budget produces — used both by the explicit Apply button
  // and the continuous auto-save below, so they can never disagree.
  // The budget no longer owns the home — it doesn't write homeowner/home/mortgage (the
  // plan's "Your home" step does). It keeps `budget.tenure` as a derived mirror so old
  // plans and the presets stay consistent.
  const budgetUpdate: Partial<RetirementPlan> = {
    targetSpending: total,
    spendingMode: applyPhases ? "stages" : "flat",
    ...(applyPhases ? { spendingStages: stages } : {}),
    budget: { tenure, lifestyle, categories, applyPhases } as RetirementBudget,
  };
  const handleApply = () => onApply(budgetUpdate);

  // Save progress continuously — mirror the current budget back to the plan as the
  // user edits (debounced) and flush on close, so nothing is lost if they close via
  // ✕ / the backdrop / backing out before clicking the final Apply button.
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;
  const updateRef = useRef(budgetUpdate);
  updateRef.current = budgetUpdate;
  const budgetKey = JSON.stringify(budgetUpdate);
  // The budget as it was when the builder opened. Comparing against this (rather than
  // skipping the first effect run, which React StrictMode double-invokes) means a
  // peek-and-close saves nothing, and only genuine edits are mirrored/flushed.
  const initialKey = useRef(budgetKey).current;
  useEffect(() => {
    if (budgetKey === initialKey) return; // nothing changed yet
    const t = setTimeout(() => progressRef.current?.(updateRef.current), 500);
    return () => clearTimeout(t);
  }, [budgetKey, initialKey]);
  // Flush the latest on unmount (covers ✕ / backdrop / back-out close), but only if
  // the budget actually changed from what they opened with.
  useEffect(() => () => {
    if (JSON.stringify(updateRef.current) !== initialKey) progressRef.current?.(updateRef.current);
  }, [initialKey]);

  const essentials = BUDGET_CATEGORY_META.filter((m) => m.essential);
  const discretionaries = BUDGET_CATEGORY_META.filter((m) => !m.essential);

  // The home is set in the plan's own "Your home" step now, so the budget has no home
  // step — just a read-only summary on Setup.
  const stepKeys = ["setup", "budget", "phases", "goal"];
  const safeStep = Math.min(step, stepKeys.length - 1);
  const currentKey = stepKeys[safeStep];
  const isLast = safeStep === stepKeys.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      {quizKey && (
        <CategoryQuiz
          categoryKey={quizKey}
          categoryLabel={BUDGET_CATEGORY_META.find((c) => c.key === quizKey)?.label ?? "Category"}
          household={household}
          config={config}
          onApply={(t) => { setCat(quizKey, t); setQuizKey(null); }}
          onClose={() => setQuizKey(null)}
        />
      )}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-[760px] max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-accent">
              Build your budget · {STEP_TITLES[currentKey]}
            </div>
            <h2 className="mt-0.5 text-lg font-bold text-white">
              What will retirement cost you?
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {onSwitchToPlay && (
              <button
                onClick={onSwitchToPlay}
                className="rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[11px] font-semibold text-accent transition hover:bg-accent/20"
                title="Try Budget Quest — the same budget as a game"
              >
                🎮 Play mode
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-muted transition hover:bg-panel-2 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex gap-1.5 px-6 pt-4">
          {stepKeys.map((k, i) => (
            <button
              key={k}
              type="button"
              onClick={() => setStep(i)}
              aria-current={i === safeStep ? "step" : undefined}
              className={`h-1.5 flex-1 rounded-full transition ${
                i <= safeStep ? "bg-accent" : "bg-line"
              }`}
              title={STEP_TITLES[k]}
            />
          ))}
        </div>

        {/* Live total bar — visible on every step after Setup */}
        {currentKey !== "setup" && (
          <div className="mx-6 mt-4 flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Your budget
              </div>
              {(() => {
                const disp = monthly ? Math.round(total / 12) : total;
                const shown = editingTotal ? totalText : disp.toLocaleString();
                return (
                  <div className="flex items-baseline text-2xl font-bold tabular-nums text-accent">
                    <span className="text-lg">$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label={`Total budget per ${monthly ? "month" : "year"}`}
                      title="Type a total — every category scales to match"
                      value={shown}
                      size={Math.max(5, shown.length + 1)}
                      onFocus={() => {
                        setEditingTotal(true);
                        setTotalText(String(disp));
                        baseCatsRef.current = categories;
                      }}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, "");
                        setTotalText(raw);
                        const v = parseFloat(raw);
                        if (!Number.isNaN(v)) scaleFrom(baseCatsRef.current ?? categories, monthly ? v * 12 : v);
                      }}
                      onBlur={() => setEditingTotal(false)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="border-b border-dashed border-accent/40 bg-transparent text-accent outline-none focus:border-accent"
                    />
                    <span className="ml-1 text-sm font-medium text-muted">
                      {monthly ? "/mo" : "/yr"}
                    </span>
                  </div>
                );
              })()}
            </div>
            <div className="text-right">
              <button
                onClick={() => setMonthly((m) => !m)}
                className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:border-accent/50 hover:text-white"
              >
                Show {monthly ? "yearly" : "monthly"}
              </button>
              <div className="mt-1.5 text-xs text-muted">
                {impact.lastsToLifeExpectancy ? (
                  <span className="text-accent">projected to last to {plan.lifeExpectancy}+</span>
                ) : (
                  <span className="text-amber-400">projected to last to {impact.depletedAge}</span>
                )}
              </div>
            </div>
          </div>
        )}
        {currentKey !== "setup" && activeMortgage && activeMortgage.strategy === "carry" && (
          <p className="mx-6 mt-1.5 text-xs text-amber-300/90">
            ＋ {fmtCurrency(Math.round(mortgageAnnualCost(activeMortgage) / (monthly ? 12 : 1)))}
            {monthly ? "/mo" : "/yr"} home loan on top
            {activeMortgage.type === "principal_interest" && activeMortgage.payoffAge
              ? ` until age ${activeMortgage.payoffAge}`
              : " (interest-only)"}{" "}
            — not part of the ASFA budget above.
          </p>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {currentKey === "setup" && (
            <SetupStep
              household={household}
              tenure={tenure}
              home={home}
              mortgage={mortgage}
              lifestyle={lifestyle}
              categories={categories}
              applyPreset={applyPreset}
              config={config}
            />
          )}

          {currentKey === "budget" && (
            <div className="space-y-5">
              <CategoryGroup
                title="Essentials"
                caption="The things you can't skip — your floor."
                metas={essentials}
                categories={categories}
                household={household}
                config={config}
                monthly={monthly}
                open={open}
                toggleOpen={toggleOpen}
                setCat={setCat}
                onQuiz={setQuizKey}
              />
              <CategoryGroup
                title="Lifestyle & discretionary"
                caption="The fun stuff — where your budget flexes most."
                metas={discretionaries}
                categories={categories}
                household={household}
                config={config}
                monthly={monthly}
                open={open}
                toggleOpen={toggleOpen}
                setCat={setCat}
                onQuiz={setQuizKey}
              />
              <button
                onClick={() => applyPreset(lifestyle)}
                className="text-xs text-muted underline-offset-2 hover:text-white hover:underline"
              >
                Reset everything to the “{lifestyle}” starting point
              </button>
            </div>
          )}

          {currentKey === "phases" && (
            <PhasesStep
              applyPhases={applyPhases}
              setApplyPhases={setApplyPhases}
              stages={stages}
              essential={essential}
            />
          )}

          {currentKey === "goal" && (
            <PayoffStep
              total={total}
              essential={essential}
              discretionary={discretionary}
              impact={impact}
              plan={plan}
              config={config}
              applyPhases={applyPhases}
              stages={stages}
              mortgage={activeMortgage}
              onTrim={() => setTrimOpen(true)}
              onBoost={() => setBoostOpen(true)}
              canBoost={boost.hasHeadroom}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          <button
            onClick={() =>
              safeStep === 0
                ? onClose()
                : currentKey === "goal"
                  ? setStep(stepKeys.indexOf("setup")) // jump back to the start to edit the details
                  : setStep(safeStep - 1)
            }
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted transition hover:text-white"
          >
            {safeStep === 0 ? "Cancel" : currentKey === "goal" ? "← Edit budget details" : "← Previous"}
          </button>
          <button
            onClick={() => (isLast ? handleApply() : setStep(safeStep + 1))}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft"
          >
            {isLast ? "Use this as my goal" : "Next →"}
          </button>
        </div>
      </div>

      <TrimSpendingModal
        open={trimOpen}
        onClose={() => setTrimOpen(false)}
        onApply={applyBudgetPatch}
        plan={budgetPlan}
        config={config}
        result={impact}
        applyLabel="Trim my budget"
      />

      <BoostSpendingModal
        open={boostOpen}
        onClose={() => setBoostOpen(false)}
        onApply={applyBudgetPatch}
        plan={budgetPlan}
        config={config}
        result={impact}
        applyLabel="Boost my budget"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function SetupStep({
  household,
  tenure,
  home,
  mortgage,
  lifestyle,
  categories,
  applyPreset,
  config,
}: {
  household: "single" | "couple";
  tenure: HomeTenure;
  home: HomeDetail;
  mortgage: MortgageDetail;
  lifestyle: BudgetLifestyle;
  categories: Record<string, number>;
  applyPreset: (ls: BudgetLifestyle) => void;
  config: EngineConfig;
}) {
  const homeSummary =
    tenure === "rent"
      ? "Renting"
      : tenure === "mortgage"
        ? `Own with a ${fmtCurrency(mortgage.balance)} mortgage · home ${fmtCurrency(home.value)}`
        : `Own outright · home ${fmtCurrency(home.value)}`;
  // A carried home loan is a real annual expense that gets ADDED to the budget you
  // build here (it's part of the income goal). Cleared-at-retirement loans have no
  // ongoing cost, so only "carry" contributes.
  const loanYr =
    tenure === "mortgage" && mortgage.strategy === "carry" ? mortgageAnnualCost(mortgage) : 0;
  // Once the live budget no longer matches the preset it was seeded from, the picker
  // would silently overwrite the user's work AND the highlighted preset would be a lie.
  // So we treat that as "customised" and switch the picker for a read-only benchmark
  // comparison (with a deliberate "start over" escape hatch).
  const homeownerFlag = tenure !== "rent";
  const total = budgetTotal(categories);
  const presetTotal = (ls: BudgetLifestyle) =>
    budgetTotal(presetCategories(config, household, homeownerFlag, ls));
  const startingCats = presetCategories(config, household, homeownerFlag, lifestyle);
  const customised = [...new Set([...Object.keys(categories), ...Object.keys(startingCats)])].some(
    (k) => Math.round(categories[k] ?? 0) !== Math.round(startingCats[k] ?? 0),
  );
  const [showReset, setShowReset] = useState(false);
  const presetButtons = () =>
    LIFESTYLES.map((l) => {
      const t = presetTotal(l.key);
      const active = lifestyle === l.key && !customised;
      return (
        <button
          key={l.key}
          onClick={() => {
            applyPreset(l.key);
            setShowReset(false);
          }}
          className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
            active
              ? "border-slate-300 bg-white/5 ring-1 ring-slate-300/40"
              : "border-line bg-panel-2 hover:border-slate-400/50"
          }`}
        >
          <div>
            <div className="font-semibold text-white">{l.label}</div>
            <div className="text-xs text-muted">{l.blurb}</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold tabular-nums text-white">{fmtCurrency(t)}</div>
            <div className="text-[11px] text-muted">per year</div>
          </div>
        </button>
      );
    });
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        We’ll start you off with real ASFA Retirement Standard figures for a{" "}
        <span className="text-slate-200">{household}</span> household, then you tweak
        anything that doesn’t fit. Nothing here is set in stone.
      </p>

      {/* The home is set in the plan (its own "Your home" step) — shown here read-only
          so the budget uses the right figures without asking twice. */}
      <div className="rounded-xl border border-line bg-panel-2 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-200">🏠 Your home</div>
          <div className="text-sm tabular-nums text-white">{homeSummary}</div>
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {tenure === "rent"
            ? "Renters carry a bigger housing cost — we use ASFA’s renter figures."
            : "ASFA covers rates, insurance and upkeep; any loan repayment is added on top."}{" "}
          Change it in the <span className="text-slate-300">“Your home”</span> step of your plan.
        </p>
        {loanYr > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2.5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-300">
                Home loan — added to your goal
              </div>
              <div className="mt-0.5 text-xs text-muted">
                Sits on top of the essentials + discretionary budget you build here
                {mortgage.type === "principal_interest" && mortgage.payoffAge
                  ? `, until age ${mortgage.payoffAge}`
                  : " — interest-only, for life"}
                .
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-xl font-bold tabular-nums text-amber-300">
                ＋{fmtCurrency(loanYr)}
                <span className="ml-0.5 text-xs font-medium text-amber-300/80">/yr</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {!customised ? (
        // First-time setup: pick an ASFA starting point.
        <div>
          <div className="mb-2 text-sm font-semibold text-slate-200">Pick a starting point</div>
          <div className="space-y-2.5">{presetButtons()}</div>
        </div>
      ) : (
        // Already refined: the presets are no longer the budget, so show them as a
        // read-only benchmark instead of an overwrite-on-click picker.
        <div>
          <div className="mb-2 text-sm font-semibold text-slate-200">How your budget compares</div>
          <div className="rounded-xl border border-line bg-panel-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold text-white">Your budget</div>
              <div className="text-right">
                <div className="text-sm font-bold tabular-nums text-white">
                  {fmtCurrency(total + loanYr)}
                  <span className="ml-0.5 text-[11px] font-medium text-muted">/yr</span>
                </div>
                {loanYr > 0 && (
                  <div className="text-[11px] tabular-nums text-muted">
                    {fmtCurrency(total)} living + {fmtCurrency(loanYr)} loan
                  </div>
                )}
              </div>
            </div>
            <div className="mt-2.5 space-y-1.5 border-t border-line pt-2.5">
              {LIFESTYLES.map((l) => {
                const pt = presetTotal(l.key);
                const d = total - pt;
                const near = Math.abs(d) <= 500;
                return (
                  <div key={l.key} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-muted">
                      {l.label} <span className="tabular-nums text-slate-500">· {fmtCurrency(pt)}</span>
                    </span>
                    <span className={`tabular-nums ${near ? "text-emerald-300" : "text-slate-300"}`}>
                      {near
                        ? "≈ matches"
                        : d > 0
                          ? `${fmtCurrency(d)} above`
                          : `${fmtCurrency(-d)} below`}
                    </span>
                  </div>
                );
              })}
            </div>
            {loanYr > 0 && (
              <p className="mt-2.5 border-t border-line pt-2 text-[11px] text-muted">
                ASFA benchmarks cover living costs only — your home loan sits on top.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowReset((v) => !v)}
            className="mt-2.5 text-xs font-medium text-muted transition hover:text-slate-300"
          >
            ↺ Start over from a preset
          </button>
          {showReset && (
            <div className="mt-2 space-y-2.5">
              <p className="text-[11px] text-amber-300/80">
                Picking one replaces your customised budget.
              </p>
              {presetButtons()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------

function CategoryGroup({
  title,
  caption,
  metas,
  categories,
  household,
  config,
  monthly,
  open,
  toggleOpen,
  setCat,
  onQuiz,
}: {
  title: string;
  caption: string;
  metas: BudgetCategoryMeta[];
  categories: Record<string, number>;
  household: "single" | "couple";
  config: EngineConfig;
  monthly: boolean;
  open: Set<string>;
  toggleOpen: (k: string) => void;
  setCat: (k: string, v: number) => void;
  onQuiz: (k: string) => void;
}) {
  const subtotal = metas.reduce((s, m) => s + (categories[m.key] || 0), 0);
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-200">
            {title}
          </h3>
          <p className="text-xs text-muted">{caption}</p>
        </div>
        <div className="text-sm font-semibold tabular-nums text-muted">
          {fmtCurrency(monthly ? Math.round(subtotal / 12) : subtotal)}
          <span className="text-xs">{monthly ? "/mo" : "/yr"}</span>
        </div>
      </div>
      <div className="space-y-2">
        {metas.map((m) => (
          <CategoryCard
            key={m.key}
            meta={m}
            value={categories[m.key] ?? 0}
            household={household}
            config={config}
            monthly={monthly}
            expanded={open.has(m.key)}
            onToggle={() => toggleOpen(m.key)}
            onChange={(v) => setCat(m.key, v)}
            onQuiz={() => onQuiz(m.key)}
          />
        ))}
      </div>
    </section>
  );
}

function CategoryCard({
  meta,
  value,
  household,
  config,
  monthly,
  expanded,
  onToggle,
  onChange,
  onQuiz,
}: {
  meta: BudgetCategoryMeta;
  value: number;
  household: "single" | "couple";
  config: EngineConfig;
  monthly: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChange: (annual: number) => void;
  onQuiz: () => void;
}) {
  const cfgCat = config.asfa.breakdown.categories.find((c) => c.key === meta.key);
  const comfortable = cfgCat?.comfortable[household] ?? 5_000;
  const disp = monthly ? Math.round(value / 12) : value;
  const step = monthly ? 25 : 250;
  // Generous but STABLE slider ceiling. The headroom is a multiple of the fixed
  // ASFA reference — NOT of the current value (which fed back: max grows with
  // value → value grows with max → runaway into the billions). Since `value` is
  // only a FLOOR here, sliding to the end can't grow the max, so it's safe to be
  // generous: ~$5k/mo minimum for any discretionary category, floored at any
  // typed-in value, capped at a sane per-category max (the number box takes more).
  const sliderMax = Math.min(
    500_000,
    Math.max(Math.ceil((comfortable * 6) / 1000) * 1000, value, 60_000),
  );
  const color = CATEGORY_COLOR[meta.key];

  const setFromDisplay = (d: number) => onChange(monthly ? d * 12 : d);

  return (
    <div
      className={`rounded-xl border transition ${
        expanded ? "border-accent/40 bg-panel-2" : "border-line bg-panel-2/60"
      }`}
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <BudgetCategoryIcon categoryKey={meta.key} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-semibold text-white">
            {meta.label}
            {!meta.essential && (
              <span className="rounded-full bg-pink-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-pink-300">
                flex
              </span>
            )}
          </div>
          <div className="truncate text-xs text-muted">{meta.hint}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold tabular-nums text-white">
            {fmtCurrency(disp)}
            <span className="text-[11px] font-medium text-muted">
              {monthly ? "/mo" : "/yr"}
            </span>
          </div>
        </div>
        <span
          className={`ml-1 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        >
          ⌄
        </span>
      </button>

      {expanded && (
        <div className="border-t border-line px-3 pb-3 pt-3">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {meta.items.map((it) => (
              <span
                key={it}
                className="rounded-full border border-line bg-panel px-2 py-0.5 text-[11px] text-muted"
              >
                {it}
              </span>
            ))}
          </div>
          <button
            onClick={onQuiz}
            className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[11px] font-semibold text-accent transition hover:bg-accent/20"
          >
            🎲 Not sure? Work it out
          </button>

          {meta.input === "stepper" ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted">
                Adjust in {monthly ? "$25/mo" : "$250/yr"} steps
              </span>
              <div className="flex items-center gap-1 rounded-lg border border-line bg-panel p-1">
                <StepBtn label="−" onClick={() => setFromDisplay(Math.max(0, disp - step))} />
                <input
                  type="number"
                  inputMode="decimal"
                  value={Number.isNaN(disp) ? "" : disp}
                  onChange={(e) => setFromDisplay(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-20 bg-transparent text-center text-sm font-semibold tabular-nums text-white outline-none"
                />
                <StepBtn label="+" onClick={() => setFromDisplay(disp + step)} />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="range"
                min={0}
                max={monthly ? Math.round(sliderMax / 12) : sliderMax}
                step={step}
                value={disp}
                onChange={(e) => setFromDisplay(parseFloat(e.target.value))}
                style={{ accentColor: color }}
                className="w-full"
              />
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Slide to taste</span>
                <div className="flex items-center gap-1 rounded-lg border border-line bg-panel px-2 py-1">
                  <span className="text-muted">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={Number.isNaN(disp) ? "" : disp}
                    onChange={(e) => setFromDisplay(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-20 bg-transparent text-right text-sm font-semibold tabular-nums text-white outline-none"
                  />
                  <span className="text-muted">{monthly ? "/mo" : "/yr"}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StepBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-7 w-7 rounded-md text-lg font-bold text-slate-200 transition hover:bg-panel-2 hover:text-white"
      tabIndex={-1}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------

function PhasesStep({
  applyPhases,
  setApplyPhases,
  stages,
  essential,
}: {
  applyPhases: boolean;
  setApplyPhases: (v: boolean) => void;
  stages: SpendingStages;
  essential: number;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-white">Will your spending change?</h3>
        <p className="mt-1 text-sm text-muted">
          Most retirees spend more in their active “go-go” years, then ease off through
          their 80s as travel and hobbies wind down — while essentials like housing and
          health stay put. This is the well-studied{" "}
          <span className="text-slate-200">retirement spending smile</span>.
        </p>
      </div>

      <Segmented
        value={applyPhases ? "smile" : "flat"}
        options={[
          { value: "smile", label: "Model the decline" },
          { value: "flat", label: "Keep it flat" },
        ]}
        onChange={(v) => setApplyPhases(v === "smile")}
      />

      {applyPhases ? (
        <div className="grid grid-cols-3 gap-2">
          <PhaseCard label="Go-go" sub="active years" amount={stages.goGo} tone="text-accent" />
          <PhaseCard
            label="Slow-go"
            sub={`from ${stages.slowGoAge}`}
            amount={stages.slowGo}
            tone="text-amber-300"
          />
          <PhaseCard
            label="No-go"
            sub={`from ${stages.noGoAge}`}
            amount={stages.noGo}
            tone="text-slate-300"
          />
        </div>
      ) : (
        <p className="rounded-xl border border-line bg-panel-2 px-4 py-3 text-sm text-muted">
          We’ll use a single flat figure for the whole of retirement — simpler, but
          usually a touch more conservative.
        </p>
      )}

      {applyPhases && (
        <p className="text-xs text-muted">
          Only your discretionary spend tapers; the{" "}
          <span className="text-slate-200">{fmtCurrency(essential)}/yr</span> of
          essentials stays flat as a floor.
        </p>
      )}
    </div>
  );
}

function PhaseCard({
  label,
  sub,
  amount,
  tone,
}: {
  label: string;
  sub: string;
  amount: number;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel-2 px-3 py-3 text-center">
      <div className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>{label}</div>
      <div className="mt-1 text-base font-bold tabular-nums text-white">
        {fmtCurrency(amount)}
      </div>
      <div className="text-[11px] text-muted">{sub}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PayoffStep({
  total,
  essential,
  discretionary,
  impact,
  plan,
  config,
  applyPhases,
  stages,
  mortgage,
  onTrim,
  onBoost,
  canBoost,
}: {
  total: number;
  essential: number;
  discretionary: number;
  impact: ReturnType<typeof simulate>;
  plan: RetirementPlan;
  config: EngineConfig;
  applyPhases: boolean;
  stages: SpendingStages;
  mortgage: MortgageDetail | undefined;
  onTrim: () => void;
  onBoost: () => void;
  canBoost: boolean;
}) {
  const hh = plan.household;
  const comfortable = config.asfa.comfortable[hh];
  const modest = config.asfa.modest[hh];
  const band =
    total >= comfortable
      ? { label: "at or above ASFA ‘comfortable’", tone: "text-accent" }
      : total >= modest
        ? { label: "between ASFA ‘modest’ and ‘comfortable’", tone: "text-amber-300" }
        : { label: "below ASFA ‘modest’", tone: "text-slate-300" };

  const loanCost = mortgage && mortgage.strategy === "carry" ? mortgageAnnualCost(mortgage) : 0;
  const goalTotal = total + loanCost;

  const pie = [
    { name: "Essentials", value: essential, color: "#34d399" },
    ...(loanCost > 0 ? [{ name: "Home loan", value: loanCost, color: "#fbbf24" }] : []),
    { name: "Discretionary", value: discretionary, color: "#f472b6" },
  ];
  const discPct = goalTotal > 0 ? Math.round((discretionary / goalTotal) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">
          Your retirement income goal
        </div>
        <div className="mt-1 text-4xl font-extrabold tabular-nums text-white">
          {fmtCurrency(goalTotal)}
          <span className="text-lg font-semibold text-muted"> /yr</span>
        </div>
        <div className="text-sm text-muted">
          about {fmtCurrency(Math.round(goalTotal / 12))} a month · <span className={band.tone}>{band.label}</span>
        </div>
        {loanCost > 0 && mortgage && (
          <div className="mt-1 text-xs text-amber-300">
            living {fmtCurrency(total)} + home loan {fmtCurrency(Math.round(loanCost))}
            {mortgage.type === "principal_interest" && mortgage.payoffAge
              ? ` — eases to ${fmtCurrency(total)} once cleared at ${mortgage.payoffAge}`
              : " (interest-only, for life)"}
          </div>
        )}
      </div>

      {mortgage && mortgage.strategy === "clear_at_retirement" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
          🏠 Plus a one-off <span className="font-semibold">{fmtCurrency(mortgage.balance)}</span>{" "}
          from super to clear the home loan at retirement — tax-free, and it lowers your
          assessable assets (the money-lasts figure already accounts for it).
        </div>
      )}

      <div className="flex items-center gap-4 rounded-xl border border-line bg-panel-2 p-4">
        <div className="relative h-28 w-28 shrink-0">
          <PieChart width={112} height={112}>
            <Pie
              data={pie}
              dataKey="value"
              cx={52}
              cy={52}
              innerRadius={38}
              outerRadius={54}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              {pie.map((p) => (
                <Cell key={p.name} fill={p.color} />
              ))}
            </Pie>
          </PieChart>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-lg font-bold tabular-nums text-white">{discPct}%</div>
            <div className="text-[10px] text-muted">flex</div>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <LegendRow color="#34d399" label="Essentials" value={essential} />
          {loanCost > 0 && (
            <LegendRow color="#fbbf24" label="Home loan" value={Math.round(loanCost)} />
          )}
          <LegendRow color="#f472b6" label="Discretionary (Your Flex)" value={discretionary} />
          <p className="text-xs text-muted">
            Your “needs” floor{loanCost > 0 ? " (essentials + home loan)" : ""} is{" "}
            {fmtCurrency(essential + loanCost)}/yr — the rest is where you can flex if
            markets get bumpy.
          </p>
        </div>
      </div>

      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          impact.lastsToLifeExpectancy
            ? "border-accent/30 bg-accent/10 text-accent"
            : "border-amber-500/30 bg-amber-500/10 text-amber-300"
        }`}
      >
        {impact.lastsToLifeExpectancy ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>On this budget your savings are projected to last to {plan.lifeExpectancy}+.</span>
            {canBoost && (
              <button
                onClick={onBoost}
                className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-accent-soft"
              >
                📈 Help me spend more
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Heads up — on this budget your savings are projected to run short around age{" "}
              <span className="font-bold">{impact.depletedAge}</span>.
            </span>
            <button
              onClick={onTrim}
              className="shrink-0 rounded-lg bg-amber-400/90 px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-amber-300"
            >
              ✂️ Help me make it last
            </button>
          </div>
        )}
      </div>

      {applyPhases &&
        (() => {
          // The loan runs on top of each phase until it's paid off (P&I) or for
          // life (interest-only). Add it to the phases where it's still active.
          const phaseLoan = (phaseStartAge: number) => {
            if (loanCost <= 0 || !mortgage) return 0;
            if (mortgage.type === "interest_only") return loanCost;
            return mortgage.payoffAge != null && phaseStartAge < mortgage.payoffAge ? loanCost : 0;
          };
          return (
            <p className="text-center text-xs text-muted">
              {loanCost > 0 ? "Total per year by phase" : "Saved with declining phases"}:{" "}
              {fmtCurrency(stages.goGo + loanCost)} →{" "}
              {fmtCurrency(stages.slowGo + phaseLoan(stages.slowGoAge))} →{" "}
              {fmtCurrency(stages.noGo + phaseLoan(stages.noGoAge))}
            </p>
          );
        })()}
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-slate-200">{label}</span>
      <span className="ml-auto font-semibold tabular-nums text-white">{fmtCurrency(value)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-panel-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${
            value === o.value ? "bg-accent text-ink" : "text-muted hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
