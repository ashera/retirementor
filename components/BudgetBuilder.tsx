"use client";

import { useMemo, useState } from "react";
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
import { mortgageAnnualCost, suggestPayoffAge } from "@/lib/au/mortgage";
import type {
  BudgetLifestyle,
  HomeTenure,
  MortgageDetail,
  RetirementBudget,
  RetirementPlan,
  SpendingStages,
} from "@/lib/au/types";
import Field from "@/components/Field";
import BudgetCategoryIcon, { CATEGORY_COLOR } from "@/components/BudgetCategoryIcon";
import TrimSpendingModal from "@/components/TrimSpendingModal";

function defaultMortgage(oldestAtRetire: number): MortgageDetail {
  const balance = 180_000;
  const repayment = 24_000;
  return {
    type: "principal_interest",
    balance,
    interestRate: 6,
    annualRepayment: repayment,
    payoffAge: suggestPayoffAge(balance, 6, repayment, oldestAtRetire) ?? oldestAtRetire + 10,
    strategy: "carry",
  };
}

interface BudgetBuilderProps {
  plan: RetirementPlan;
  config: EngineConfig;
  onApply: (update: Partial<RetirementPlan>) => void;
  onClose: () => void;
}

const LIFESTYLES: { key: BudgetLifestyle; label: string; blurb: string }[] = [
  { key: "modest", label: "Modest", blurb: "Covers the basics with a little for fun" },
  { key: "comfortable", label: "Comfortable", blurb: "The ASFA benchmark — travel, dining, hobbies" },
  { key: "premium", label: "Premium", blurb: "A generous lifestyle with room to spare" },
];

// The "loan" step only appears when the user has a mortgage (see stepKeys below).
const STEP_TITLES: Record<string, string> = {
  setup: "Setup",
  loan: "Home loan",
  budget: "Your budget",
  phases: "Later years",
  goal: "Your goal",
};

export default function BudgetBuilder({ plan, config, onApply, onClose }: BudgetBuilderProps) {
  const household = plan.household;
  const oldestAtRetire =
    Math.max(...plan.people.map((p) => p.currentAge)) +
    Math.max(0, plan.retirementAge - plan.people[0].currentAge);

  // Returning to edit an existing budget? Jump straight to the last (goal) page
  // — safeStep clamps this to the real last index. New budgets start at Setup.
  const [step, setStep] = useState(plan.budget ? 99 : 0);
  const [tenure, setTenure] = useState<HomeTenure>(
    plan.budget?.tenure ?? (plan.homeowner ? "own" : "rent"),
  );
  const [mortgage, setMortgage] = useState<MortgageDetail>(
    plan.mortgage ?? defaultMortgage(oldestAtRetire),
  );
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

  const total = budgetTotal(categories);
  const { essential, discretionary } = budgetSplit(categories);
  const stages = useMemo(() => budgetToStages(config, categories), [config, categories]);

  // The loan the engine should model (undefined unless the user has a mortgage).
  const activeMortgage = tenure === "mortgage" ? mortgage : undefined;

  // Build a working plan at a given spend, honouring phases + any mortgage.
  const workingPlan = useMemo(() => {
    const base: RetirementPlan = applyPhases
      ? { ...plan, spendingMode: "stages", spendingStages: stages, targetSpending: total }
      : { ...plan, spendingMode: "flat", targetSpending: total };
    return { ...base, homeowner, mortgage: activeMortgage };
  }, [plan, stages, total, applyPhases, homeowner, activeMortgage]);

  // Live "money lasts" impact of the current budget (+ mortgage).
  const impact = useMemo(() => simulate(workingPlan, config), [workingPlan, config]);

  // The working plan carrying the in-progress budget, so the trim can scale the
  // discretionary categories (and we apply the result straight back into them).
  const [trimOpen, setTrimOpen] = useState(false);
  const budgetPlan = useMemo(
    () => ({ ...workingPlan, budget: { tenure, lifestyle, categories, applyPhases } }),
    [workingPlan, tenure, lifestyle, categories, applyPhases],
  );
  const applyTrim = (patch: Partial<RetirementPlan>) => {
    if (patch.budget?.categories) setCategories(patch.budget.categories);
  };

  // Compare carry vs clear-at-retirement so we can show the pension uplift.
  const strategyCompare = useMemo(() => {
    if (tenure !== "mortgage") return null;
    const run = (strategy: MortgageDetail["strategy"]) =>
      simulate({ ...workingPlan, mortgage: { ...mortgage, strategy } }, config);
    const firstPension = (r: ReturnType<typeof simulate>) =>
      r.rows.find((x) => x.phase === "pension")?.agePension ?? 0;
    const carry = run("carry");
    const clear = run("clear_at_retirement");
    return {
      carryLasts: carry.lastsToLifeExpectancy ? null : carry.depletedAge,
      clearLasts: clear.lastsToLifeExpectancy ? null : clear.depletedAge,
      pensionUplift: Math.round(firstPension(clear) - firstPension(carry)),
    };
  }, [tenure, workingPlan, mortgage, config]);

  const setCat = (key: string, annual: number) =>
    setCategories((prev) => ({ ...prev, [key]: Math.max(0, Math.round(annual)) }));

  const applyPreset = (ls: BudgetLifestyle) => {
    setLifestyle(ls);
    setCategories(presetCategories(config, household, homeowner, ls));
  };

  const changeTenure = (t: HomeTenure) => {
    setTenure(t);
    // Re-seed just the housing default (own/mortgage share owner costs; rent differs).
    setCategories((prev) => ({
      ...prev,
      housing: presetCategories(config, household, t !== "rent", lifestyle).housing,
    }));
  };

  const setMort = (patch: Partial<MortgageDetail>) =>
    setMortgage((prev) => ({ ...prev, ...patch }));

  const toggleOpen = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const handleApply = () => {
    const budget: RetirementBudget = { tenure, lifestyle, categories, applyPhases };
    onApply({
      targetSpending: total,
      spendingMode: applyPhases ? "stages" : "flat",
      ...(applyPhases ? { spendingStages: stages } : {}),
      homeowner,
      budget,
      mortgage: activeMortgage,
    });
  };

  const essentials = BUDGET_CATEGORY_META.filter((m) => m.essential);
  const discretionaries = BUDGET_CATEGORY_META.filter((m) => !m.essential);

  // A dedicated "Home loan" step is inserted after Setup only when relevant.
  const stepKeys =
    tenure === "mortgage"
      ? ["setup", "loan", "budget", "phases", "goal"]
      : ["setup", "budget", "phases", "goal"];
  const safeStep = Math.min(step, stepKeys.length - 1);
  const currentKey = stepKeys[safeStep];
  const isLast = safeStep === stepKeys.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
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
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted transition hover:bg-panel-2 hover:text-white"
          >
            ✕
          </button>
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
              <div className="text-2xl font-bold tabular-nums text-accent" aria-live="polite">
                {monthly ? fmtCurrency(Math.round(total / 12)) : fmtCurrency(total)}
                <span className="ml-1 text-sm font-medium text-muted">
                  {monthly ? "/mo" : "/yr"}
                </span>
              </div>
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
                  <span className="text-accent">lasts to {plan.lifeExpectancy}+ ✓</span>
                ) : (
                  <span className="text-amber-400">money lasts to {impact.depletedAge}</span>
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
              changeTenure={changeTenure}
              lifestyle={lifestyle}
              applyPreset={applyPreset}
              config={config}
            />
          )}

          {currentKey === "loan" && (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                This is separate from your ASFA living budget — tell us about the loan and how
                you&apos;ll handle it once you retire.
              </p>
              <MortgagePanel
                mortgage={mortgage}
                setMort={setMort}
                oldestAtRetire={oldestAtRetire}
                lifeExpectancy={plan.lifeExpectancy}
                strategyCompare={strategyCompare}
              />
            </div>
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
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          <button
            onClick={() => (safeStep === 0 ? onClose() : setStep(safeStep - 1))}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted transition hover:text-white"
          >
            {safeStep === 0 ? "Cancel" : "← Back"}
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
        onApply={applyTrim}
        plan={budgetPlan}
        config={config}
        result={impact}
        applyLabel="Trim my budget"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function SetupStep({
  household,
  tenure,
  changeTenure,
  lifestyle,
  applyPreset,
  config,
}: {
  household: "single" | "couple";
  tenure: HomeTenure;
  changeTenure: (t: HomeTenure) => void;
  lifestyle: BudgetLifestyle;
  applyPreset: (ls: BudgetLifestyle) => void;
  config: EngineConfig;
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        We’ll start you off with real ASFA Retirement Standard figures for a{" "}
        <span className="text-slate-200">{household}</span> household, then you tweak
        anything that doesn’t fit. Nothing here is set in stone.
      </p>

      <div>
        <div className="mb-2 text-sm font-semibold text-slate-200">Your home</div>
        <Segmented
          value={tenure}
          options={[
            { value: "own", label: "Own outright" },
            { value: "mortgage", label: "Mortgage" },
            { value: "rent", label: "Renting" },
          ]}
          onChange={(v) => changeTenure(v as HomeTenure)}
        />
        <p className="mt-2 text-xs text-muted">
          {tenure === "rent"
            ? "Renters carry a much bigger housing cost — we use ASFA’s renter figures."
            : tenure === "mortgage"
              ? "ASFA already covers rates, insurance and upkeep — we’ll add the loan on the next step."
              : "The ASFA benchmark assumes you own your home outright."}
        </p>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold text-slate-200">
          Pick a starting point
        </div>
        <div className="space-y-2.5">
          {LIFESTYLES.map((l) => {
            const preset = presetCategories(config, household, tenure !== "rent", l.key);
            const t = budgetTotal(preset);
            const active = lifestyle === l.key;
            return (
              <button
                key={l.key}
                onClick={() => applyPreset(l.key)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                  active
                    ? "border-accent bg-accent/10"
                    : "border-line bg-panel-2 hover:border-accent/40"
                }`}
              >
                <div>
                  <div className={`font-semibold ${active ? "text-accent" : "text-white"}`}>
                    {l.label}
                  </div>
                  <div className="text-xs text-muted">{l.blurb}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold tabular-nums text-white">
                    {fmtCurrency(t)}
                  </div>
                  <div className="text-[11px] text-muted">per year</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MortgagePanel({
  mortgage,
  setMort,
  oldestAtRetire,
  lifeExpectancy,
  strategyCompare,
}: {
  mortgage: MortgageDetail;
  setMort: (patch: Partial<MortgageDetail>) => void;
  oldestAtRetire: number;
  lifeExpectancy: number;
  strategyCompare: { carryLasts: number | null; clearLasts: number | null; pensionUplift: number } | null;
}) {
  const isPI = mortgage.type === "principal_interest";
  const cost = mortgageAnnualCost(mortgage);
  const suggested = suggestPayoffAge(
    mortgage.balance,
    mortgage.interestRate,
    mortgage.annualRepayment,
    oldestAtRetire,
  );

  return (
    <div className="space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
        🏠 Your home loan
      </div>

      <Segmented
        value={mortgage.type}
        options={[
          { value: "principal_interest", label: "Principal & interest" },
          { value: "interest_only", label: "Interest-only" },
        ]}
        onChange={(v) => setMort({ type: v as MortgageDetail["type"] })}
      />

      <Field
        label="Balance owing"
        value={mortgage.balance}
        onChange={(v) => setMort({ balance: v })}
        min={0}
        max={1_000_000}
        step={5_000}
        prefix="$"
        hint="Roughly what you’ll still owe when you retire (today’s dollars)."
      />

      <Field
        label="Interest rate"
        value={mortgage.interestRate}
        onChange={(v) => setMort({ interestRate: v })}
        min={1}
        max={12}
        step={0.1}
        suffix="%"
      />

      {isPI ? (
        <>
          <Field
            label="Repayments"
            value={mortgage.annualRepayment}
            onChange={(v) => setMort({ annualRepayment: v })}
            min={0}
            max={120_000}
            step={600}
            prefix="$"
            suffix="/yr"
            hint={`about ${fmtCurrency(Math.round(mortgage.annualRepayment / 12))} a month`}
          />
          <div>
            <Field
              label="Paid off by age"
              value={mortgage.payoffAge ?? suggested ?? oldestAtRetire + 10}
              onChange={(v) => setMort({ payoffAge: v })}
              min={oldestAtRetire}
              max={lifeExpectancy}
              step={1}
              suffix="yrs"
            />
            {suggested != null && suggested !== mortgage.payoffAge && (
              <button
                onClick={() => setMort({ payoffAge: suggested })}
                className="mt-1 text-xs text-accent underline-offset-2 hover:underline"
              >
                Work it out from balance & rate → age {suggested}
              </button>
            )}
            {suggested == null && (
              <p className="mt-1 text-xs text-amber-300">
                These repayments barely cover the interest — the loan hardly shrinks.
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-line bg-panel px-3 py-2.5 text-xs text-muted">
          Interest-only: about{" "}
          <span className="font-semibold text-white">{fmtCurrency(Math.round(cost))}/yr</span> in
          interest, and the{" "}
          <span className="font-semibold text-white">{fmtCurrency(mortgage.balance)}</span> balance
          never shrinks — you’ll clear it by downsizing, selling, or from your estate. Clearing it
          with super (below) is often the cleanest fix.
        </div>
      )}

      <div>
        <div className="mb-1.5 text-sm font-semibold text-slate-200">
          What will you do with it?
        </div>
        <div className="space-y-2">
          <StrategyCard
            active={mortgage.strategy === "carry"}
            onClick={() => setMort({ strategy: "carry" })}
            title="Keep repaying"
            desc={`Adds ${fmtCurrency(Math.round(cost / 12))}/mo to your budget ${
              isPI && mortgage.payoffAge ? `until age ${mortgage.payoffAge}` : "for life"
            }.`}
          />
          <StrategyCard
            active={mortgage.strategy === "clear_at_retirement"}
            onClick={() => setMort({ strategy: "clear_at_retirement" })}
            title="Clear it at retirement with super"
            desc={`Pay the ${fmtCurrency(mortgage.balance)} off from super (tax-free from 60).${
              strategyCompare && strategyCompare.pensionUplift > 0
                ? ` Could lift your Age Pension ~${fmtCurrency(strategyCompare.pensionUplift)}/yr.`
                : ""
            }`}
          />
        </div>
      </div>
    </div>
  );
}

function StrategyCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
        active ? "border-accent bg-accent/10" : "border-line bg-panel-2 hover:border-accent/40"
      }`}
    >
      <span
        className={`mt-0.5 inline-block h-4 w-4 shrink-0 rounded-full border-2 ${
          active ? "border-accent bg-accent" : "border-line"
        }`}
      />
      <span>
        <span className={`block text-sm font-semibold ${active ? "text-accent" : "text-white"}`}>
          {title}
        </span>
        <span className="block text-xs text-muted">{desc}</span>
      </span>
    </button>
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
}: {
  meta: BudgetCategoryMeta;
  value: number;
  household: "single" | "couple";
  config: EngineConfig;
  monthly: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChange: (annual: number) => void;
}) {
  const cfgCat = config.asfa.breakdown.categories.find((c) => c.key === meta.key);
  const comfortable = cfgCat?.comfortable[household] ?? value;
  const disp = monthly ? Math.round(value / 12) : value;
  const step = monthly ? 25 : 250;
  const sliderMax = Math.max(
    Math.ceil((Math.max(comfortable, value) * 2.2) / 500) * 500,
    1000,
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
          <div className="mb-3 flex flex-wrap gap-1.5">
            {meta.items.map((it) => (
              <span
                key={it}
                className="rounded-full border border-line bg-panel px-2 py-0.5 text-[11px] text-muted"
              >
                {it}
              </span>
            ))}
          </div>

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
          <>On this budget your money lasts to {plan.lifeExpectancy}+ 🎉</>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Heads up — on this budget your money runs short around age{" "}
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
