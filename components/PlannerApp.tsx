"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import StatCard from "@/components/StatCard";
import RetirementChart from "@/components/RetirementChart";
import YearDetailModal from "@/components/YearDetailModal";
import IncomeYearModal from "@/components/IncomeYearModal";
import IncomeChart from "@/components/IncomeChart";
import FanChart from "@/components/FanChart";
import PlanWizard from "@/components/PlanWizard";
import BudgetBuilder from "@/components/BudgetBuilder";
import Field from "@/components/Field";
import Logo from "@/components/Logo";
import Disclosures from "@/components/Disclosures";
import LifestageModal from "@/components/LifestageModal";
import GuidedIntro from "@/components/GuidedIntro";
import {
  AgePensionExplainer,
  LikelihoodExplainer,
  MoneyLastsExplainer,
  RetirementIncomeGoalExplainer,
  SuperAtRetirementExplainer,
} from "@/components/explainers";
import { runMonteCarlo } from "@/lib/au/montecarlo";
import { whatWillItTake } from "@/lib/au/goalseek";
import { retirementGoal } from "@/lib/au/goal";
import { logout } from "@/app/actions/auth";
import {
  deletePlan,
  savePlan,
  type SavedPlan,
} from "@/app/actions/plans";
import { simulate } from "@/lib/au/simulate";
import type { EngineConfig } from "@/lib/au/config";
import { fmtCurrency } from "@/lib/au/format";
import {
  DEFAULT_PLAN,
  spendingRange,
  type RetirementPlan,
} from "@/lib/au/types";

const STORAGE_KEY = "au-retirement-plan";
const BASELINE_KEY = "au-retirement-baseline";
const BASELINE_NAME_KEY = "au-retirement-baseline-name"; // label for the ghost line
const GUIDED_KEY = "au-retirement-guided"; // marks the first-run guide as seen

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted">
      <span
        className="inline-block h-2.5 w-2.5 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function Lever({
  label,
  value,
  delta,
  note,
  tone = "text-muted",
}: {
  label: string;
  value: string;
  delta?: string;
  note?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel-2 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums text-white">{value}</div>
      {note && <div className="mt-0.5 text-[11px] text-muted">{note}</div>}
      {delta && <div className={`mt-0.5 text-xs ${tone}`}>{delta}</div>}
    </div>
  );
}

export default function PlannerApp({
  user,
  savedPlans,
  config,
  reviewDue = 0,
}: {
  user: { email: string; isAdmin: boolean } | null;
  savedPlans: SavedPlan[];
  config: EngineConfig;
  reviewDue?: number;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<RetirementPlan>(DEFAULT_PLAN);
  // Baseline = the last committed plan (wizard / saved / load). Quick-adjust tweaks
  // update `plan` only, so the chart can show a "vs saved" ghost line.
  const [baseline, setBaseline] = useState<RetirementPlan>(DEFAULT_PLAN);
  // Where the baseline came from, so the ghost line names it (a loaded/saved
  // scenario's name, or null when it's just the pre-tweak committed plan).
  const [baselineName, setBaselineName] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [ready, setReady] = useState(false); // false until localStorage decides guide vs dashboard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [lifestageOpen, setLifestageOpen] = useState(false);
  const [selectedAge, setSelectedAge] = useState<number | null>(null);
  const [incomeAge, setIncomeAge] = useState<number | null>(null);
  const [saveName, setSaveName] = useState("");
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // Restore a previously configured plan if one exists. First-time visitors
    // just see the planner pre-filled with sensible defaults and the
    // "Get started" button — we don't auto-launch the wizard.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const working = { ...DEFAULT_PLAN, ...JSON.parse(raw) };
        const rawBase = localStorage.getItem(BASELINE_KEY);
        setPlan(working);
        setBaseline(rawBase ? { ...DEFAULT_PLAN, ...JSON.parse(rawBase) } : working);
        setBaselineName(localStorage.getItem(BASELINE_NAME_KEY) || null);
        setConfigured(true);
      } else if (!localStorage.getItem(GUIDED_KEY) && savedPlans.length === 0) {
        // Genuine first-run: no working plan, no saved scenarios, guide not yet seen.
        setShowGuide(true);
      }
    } catch {
      /* ignore malformed storage — fall back to defaults */
    }
    setReady(true);
  }, []);

  const result = useMemo(() => simulate(plan, config), [plan, config]);
  const mc = useMemo(() => runMonteCarlo(plan, config), [plan, config]);
  const successPct = Math.round(mc.successRate * 100);
  const successTone: "accent" | "amber" | "red" =
    mc.successRate >= 0.85 ? "accent" : mc.successRate >= 0.6 ? "amber" : "red";
  const gs = useMemo(() => whatWillItTake(plan, config), [plan, config]);

  const tweaked = useMemo(
    () => JSON.stringify(plan) !== JSON.stringify(baseline),
    [plan, baseline],
  );
  const baselineResult = useMemo(
    () => (tweaked ? simulate(baseline, config) : null),
    [tweaked, baseline, config],
  );
  // Name the ghost line: a loaded/saved scenario's name, else "Before changes"
  // (the committed plan the current quick-adjustments are measured against).
  const baselineLabel = baselineName || "Before changes";

  const persistWorking = (next: RetirementPlan) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  // Commit a plan as the new baseline (wizard / load / save) and persist both.
  // `name` labels the ghost line (a scenario name, or null for an unnamed plan).
  const commit = (next: RetirementPlan, name: string | null = null) => {
    setPlan(next);
    setBaseline(next);
    setBaselineName(name);
    persistWorking(next);
    try {
      localStorage.setItem(BASELINE_KEY, JSON.stringify(next));
      if (name) localStorage.setItem(BASELINE_NAME_KEY, name);
      else localStorage.removeItem(BASELINE_NAME_KEY);
    } catch {
      /* ignore */
    }
  };

  // Leaving the first-run guide: adopt its plan and never show the guide again.
  const handleGuideExit = (next: RetirementPlan, completed: boolean) => {
    commit(next);
    if (completed) setConfigured(true);
    try {
      localStorage.setItem(GUIDED_KEY, "1");
    } catch {
      /* ignore */
    }
    setShowGuide(false);
  };

  // Quick-adjust: update the working plan only (baseline stays for the ghost line).
  const quickAdjust = (patch: Partial<RetirementPlan>) =>
    setPlan((prev) => {
      const next = { ...prev, ...patch };
      persistWorking(next);
      return next;
    });

  const resetToBaseline = () => {
    setPlan(baseline);
    persistWorking(baseline);
  };

  const handleComplete = (next: RetirementPlan) => {
    commit(next);
    setConfigured(true);
    setWizardOpen(false);
  };

  const handleBudgetApply = (update: Partial<RetirementPlan>) => {
    quickAdjust(update);
    setBudgetOpen(false);
    setNotice("Budget applied — this is now your income goal.");
  };

  const handleLoad = (sp: SavedPlan) => {
    commit({ ...DEFAULT_PLAN, ...sp.data }, sp.name);
    setConfigured(true);
    setNotice(`Loaded “${sp.name}”.`);
  };

  const handleSave = () => {
    const name = saveName.trim() || `Plan ${savedPlans.length + 1}`;
    startTransition(async () => {
      const res = await savePlan(name, plan);
      if (res.error) setNotice(res.error);
      else {
        // The current plan is now this named scenario — make it the baseline so
        // any further quick-adjusts show a ghost line labelled with its name.
        commit(plan, name);
        setSaveName("");
        setNotice(`Saved “${name}”.`);
        router.refresh();
      }
    });
  };

  const handleDelete = (sp: SavedPlan) => {
    startTransition(async () => {
      const res = await deletePlan(sp.id);
      if (res.error) setNotice(res.error);
      else {
        setNotice(`Deleted “${sp.name}”.`);
        router.refresh();
      }
    });
  };

  const isCouple = plan.household === "couple";
  const comfortable = isCouple
    ? config.asfa.comfortable.couple
    : config.asfa.comfortable.single;
  const modest = isCouple ? config.asfa.modest.couple : config.asfa.modest.single;

  const isStaged = plan.spendingMode === "stages";
  const stages = plan.spendingStages;
  const range = spendingRange(plan);
  // For the ASFA comparison, use the headline (go-go) figure when staged.
  const benchmarkSpend = isStaged ? stages.goGo : plan.targetSpending;

  // True income need = living costs + any ongoing home-loan cost (see lib/au/goal).
  const goal = retirementGoal(plan);
  const goalSub =
    goal.loanKind === "pi"
      ? `incl. ${fmtCurrency(goal.loanCost)} home loan · eases to ${fmtCurrency(goal.living)} at ${goal.payoffAge}`
      : goal.loanKind === "io"
        ? `incl. ${fmtCurrency(goal.loanCost)} loan interest — for life`
        : goal.loanKind === "cleared"
          ? `living costs · clear the loan with ${fmtCurrency(goal.clearBalance ?? 0)} from super`
          : isStaged
            ? `first stage · eases to ${fmtCurrency(stages.noGo)} by ${stages.noGoAge}`
            : undefined;

  const summary = [
    { label: "Household", value: isCouple ? "Couple" : "Single" },
    { label: "Home", value: plan.homeowner ? "Owner" : "Renter" },
    { label: "Retire at", value: `${plan.retirementAge}` },
    {
      label: "Spend/yr",
      value:
        goal.loanCost > 0
          ? fmtCurrency(goal.total) // include the ongoing home loan in the headline need
          : isStaged
            ? `${fmtCurrency(range.min)}–${fmtCurrency(range.max)}`
            : fmtCurrency(plan.targetSpending),
    },
    { label: "Return", value: `${plan.investmentReturn}%` },
    { label: "Inflation", value: `${plan.inflation}%` },
  ];

  const benchmark =
    benchmarkSpend >= comfortable
      ? "at or above the ASFA ‘comfortable’ standard"
      : benchmarkSpend >= modest
        ? "between the ASFA ‘modest’ and ‘comfortable’ standards"
        : "below the ASFA ‘modest’ standard";

  const stageBands = isStaged
    ? [
        { x1: plan.retirementAge, x2: stages.slowGoAge, label: "Go-go Years", fill: "#34d399" },
        { x1: stages.slowGoAge, x2: stages.noGoAge, label: "Slow-go Years", fill: "#f59e0b" },
        { x1: stages.noGoAge, x2: plan.lifeExpectancy, label: "No-go Years", fill: "#a78bfa" },
      ].filter((b) => b.x2 > b.x1)
    : undefined;

  const spendPhrase = isStaged
    ? `staged spending — go-go ${fmtCurrency(stages.goGo)}, slow-go ${fmtCurrency(stages.slowGo)} from ${stages.slowGoAge}, no-go ${fmtCurrency(stages.noGo)} from ${stages.noGoAge} (go-go is ${benchmark})`
    : `${fmtCurrency(plan.targetSpending)} a year — ${benchmark}`;

  // Brief branded splash while we read localStorage, so the dashboard doesn't
  // flash before the first-run guide takes over.
  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Logo />
      </main>
    );
  }

  // First-run: gently build up the guided experience instead of the full dashboard.
  if (showGuide) {
    return <GuidedIntro config={config} user={user} onExit={handleGuideExit} />;
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      {/* Top bar: brand left, auth right */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Logo />
        <div className="flex items-center gap-3">
        {user ? (
          <>
            {user.isAdmin && (
              <Link
                href="/admin/review"
                className="flex items-center gap-1.5 rounded-lg border border-accent/40 px-3 py-1.5 font-medium text-accent transition hover:bg-accent/10"
              >
                Admin
                {reviewDue > 0 && (
                  <span className="rounded-full bg-red-500 px-1.5 text-xs text-white">
                    {reviewDue}
                  </span>
                )}
              </Link>
            )}
            <span className="text-muted">{user.email}</span>
            <form action={logout}>
              <button className="rounded-lg border border-line px-3 py-1.5 font-medium text-slate-200 transition hover:border-accent/50 hover:text-white">
                Log out
              </button>
            </form>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="rounded-lg px-3 py-1.5 font-medium text-slate-200 hover:text-white"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-ink transition hover:bg-accent-soft"
            >
              Sign up
            </Link>
          </>
        )}
        </div>
      </div>

      <header className="mb-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            Will your super and the Age Pension last?
          </h1>
          <p className="mt-2 max-w-2xl text-muted">
            Models superannuation, the means-tested Age Pension, and an
            early-retirement bridge — all in today&apos;s dollars, FY{config.financialYear} rules.
          </p>
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/20"
        >
          {configured ? "Edit scenario" : "Get started"}
        </button>
      </header>

      <Disclosures config={config} />
      <div className="mb-6" />

      {/* Saved plans bar */}
      <div className="mb-6 rounded-2xl border border-line bg-panel px-5 py-4">
        {user ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Saved scenarios
            </span>
            {savedPlans.length === 0 && (
              <span className="text-sm text-muted">None yet — save one →</span>
            )}
            {savedPlans.map((sp) => (
              <span
                key={sp.id}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-panel-2 py-1 pl-3 pr-1 text-sm"
              >
                <button
                  onClick={() => handleLoad(sp)}
                  className="font-medium text-slate-200 hover:text-accent"
                >
                  {sp.name}
                </button>
                <Link
                  href={`/report/${sp.id}`}
                  target="_blank"
                  title={`Open a printable PDF report for ${sp.name}`}
                  className="rounded px-1 text-muted hover:text-accent"
                >
                  ↗ Report
                </Link>
                <button
                  onClick={() => handleDelete(sp)}
                  aria-label={`Delete ${sp.name}`}
                  disabled={pending}
                  className="rounded px-1 text-muted hover:text-red-400"
                >
                  ✕
                </button>
              </span>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Name this scenario"
                className="w-40 rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm text-white outline-none focus:border-accent"
              />
              <button
                onClick={handleSave}
                disabled={pending}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-soft disabled:opacity-60"
              >
                Save current
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">
            <Link href="/signup" className="text-accent hover:underline">
              Create an account
            </Link>{" "}
            to save and compare multiple retirement scenarios.
          </p>
        )}
        {notice && <p className="mt-2 text-xs text-accent">{notice}</p>}
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Super at retirement"
          value={fmtCurrency(result.superAtRetirement)}
          sub={`at age ${result.retirementAge}`}
          highlight
          explainer={
            <SuperAtRetirementExplainer
              plan={plan}
              config={config}
              result={result}
            />
          }
          action={
            <button
              onClick={() => setWizardOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent transition hover:bg-accent/20"
            >
              ✎ Refine scenario
              <span aria-hidden>→</span>
            </button>
          }
        />
        <StatCard
          label="Retirement income goal"
          value={fmtCurrency(goal.total)}
          unit="/yr"
          tag={isStaged ? "Go-go" : undefined}
          tagOnClick={() => setLifestageOpen(true)}
          tagTitle="What do go-go, slow-go and no-go mean?"
          sub={goalSub}
          subTone={goal.loanKind !== "none" ? "amber" : "muted"}
          explainer={
            <RetirementIncomeGoalExplainer plan={plan} config={config} />
          }
          action={
            <button
              onClick={() => setBudgetOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent transition hover:bg-accent/20"
            >
              {plan.budget ? "✎ Edit your budget" : "🧮 Not sure? Build a budget"}
              <span aria-hidden>→</span>
            </button>
          }
        />
        <StatCard
          label="Money lasts"
          value={
            result.lastsToLifeExpectancy
              ? `to ${plan.lifeExpectancy}+`
              : `to age ${result.depletedAge}`
          }
          tag={`${successPct}% likely`}
          tagTone={successTone}
          tagHref="#likelihood"
          tagTitle="See why — jump to the likelihood breakdown"
          sub={
            result.lastsToLifeExpectancy
              ? "covers your whole plan"
              : "runs short — adjust inputs"
          }
          explainer={
            <MoneyLastsExplainer plan={plan} config={config} result={result} />
          }
        />
        <StatCard
          label="Age Pension from"
          value={
            result.firstAgePensionAge === null
              ? "—"
              : `age ${result.firstAgePensionAge}`
          }
          sub={result.firstAgePensionAge === null ? "not eligible" : "means-tested"}
          explainer={
            <AgePensionExplainer plan={plan} config={config} result={result} />
          }
        />
      </div>

      {/* Assets chart */}
      <div className="rounded-2xl border border-line bg-panel p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-white">
            Balance over time (today&apos;s dollars)
          </h2>
          <div className="flex flex-wrap gap-4">
            <LegendDot color="#34d399" label="Super" />
            <LegendDot color="#38bdf8" label="Outside super" />
            {tweaked && <LegendDot color="#94a3b8" label={baselineLabel} />}
          </div>
        </div>
        <RetirementChart
          result={result}
          bands={stageBands}
          baseline={baselineResult}
          baselineLabel={baselineLabel}
          onSelectYear={setSelectedAge}
          selectedAge={selectedAge}
          wageInflationPct={plan.inflation + (config.livingStandardsGrowthPct ?? 0)}
          cpiPct={plan.inflation}
        />
        <p className="mt-2 text-center text-xs text-muted">
          Tip: click any year for a full breakdown of income, tax and spending.
        </p>
        {isStaged && (
          <div className="mt-3 flex flex-wrap gap-4 border-t border-line pt-3">
            <span className="text-xs text-muted">Spending phases:</span>
            <LegendDot color="#34d399" label={`Go-go ${fmtCurrency(stages.goGo)}`} />
            <LegendDot color="#f59e0b" label={`Slow-go ${fmtCurrency(stages.slowGo)}`} />
            <LegendDot color="#a78bfa" label={`No-go ${fmtCurrency(stages.noGo)}`} />
          </div>
        )}

        {/* Quick adjust — live what-if controls */}
        <div className="mt-4 border-t border-line pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Quick adjust — see the impact live
              </span>
              <a
                href="#likelihood"
                title="See why — jump to the likelihood breakdown"
                className={`group inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition hover:brightness-125 ${
                  successTone === "accent"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : successTone === "amber"
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-red-500/15 text-red-400"
                }`}
              >
                {successPct}% success
                <span
                  aria-hidden
                  className="transition-transform group-hover:translate-y-0.5"
                >
                  ↓
                </span>
              </a>
            </div>
            {tweaked && (
              <button
                onClick={resetToBaseline}
                className="rounded-lg border border-line px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-accent/50 hover:text-white"
              >
                {baselineName ? `Reset to “${baselineName}”` : "Undo changes"}
              </button>
            )}
          </div>
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Retirement age"
              value={plan.retirementAge}
              onChange={(v) => quickAdjust({ retirementAge: v })}
              min={40}
              max={75}
              suffix="yrs"
            />
            <Field
              label={isStaged ? "Go-go spend" : "Spend/yr"}
              value={isStaged ? stages.goGo : plan.targetSpending}
              onChange={(v) =>
                isStaged
                  ? quickAdjust({
                      spendingStages: { ...plan.spendingStages, goGo: v },
                    })
                  : quickAdjust({ targetSpending: v })
              }
              min={20_000}
              max={200_000}
              step={1000}
              prefix="$"
            />
            <Field
              label="Investment return"
              value={plan.investmentReturn}
              onChange={(v) => quickAdjust({ investmentReturn: v })}
              min={1}
              max={12}
              step={0.1}
              suffix="%"
            />
            <Field
              label="Plan until age"
              value={plan.lifeExpectancy}
              onChange={(v) => quickAdjust({ lifeExpectancy: v })}
              min={75}
              max={105}
              suffix="yrs"
            />
          </div>
        </div>
      </div>

      {/* Income sources */}
      <div className="mt-4 rounded-2xl border border-line bg-panel p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-white">Retirement income sources</h2>
          <div className="flex gap-4">
            <LegendDot color="#a78bfa" label="Age Pension" />
            <LegendDot color="#34d399" label="Super" />
            <LegendDot color="#38bdf8" label="Outside super" />
            {plan.investmentProperty && <LegendDot color="#fb923c" label="Net rent" />}
          </div>
        </div>
        <IncomeChart result={result} onSelectYear={setIncomeAge} />
        <p className="mt-2 text-center text-xs text-muted">
          Tip: click any retirement year to see why your income is that amount.
        </p>
      </div>

      {/* Likelihood (Monte Carlo) */}
      <div
        id="likelihood"
        className="mt-4 scroll-mt-6 rounded-2xl border border-line bg-panel p-6"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold text-white">
            How likely is this plan to work?
            <LikelihoodExplainer plan={plan} mc={mc} />
          </h2>
          <div className="flex gap-4">
            <LegendDot color="#34d399" label="Median" />
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <span className="inline-block h-2.5 w-4 rounded-sm bg-emerald-500/25" />
              10th–90th %
            </span>
          </div>
        </div>

        {(() => {
          const s = mc.successRate;
          const hex = s >= 0.85 ? "#34d399" : s >= 0.6 ? "#f59e0b" : "#ef4444";
          const cls =
            s >= 0.85
              ? "text-emerald-400"
              : s >= 0.6
                ? "text-amber-400"
                : "text-red-400";
          return (
            <div className="mb-4">
              <div className="flex items-baseline gap-3">
                <span className={`text-4xl font-bold tabular-nums ${cls}`}>
                  {Math.round(s * 100)}%
                </span>
                <span className="text-sm text-muted">
                  of return scenarios your money lasts to {plan.lifeExpectancy}
                </span>
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${s * 100}%`, backgroundColor: hex }}
                />
              </div>
              {mc.worstCaseDepletionAge !== null && (
                <p className="mt-2 text-xs text-muted">
                  In the worst 10% of scenarios your money runs short by age{" "}
                  {mc.worstCaseDepletionAge}
                  {mc.medianDepletionAge !== null &&
                    `; when it does fall short, typically around age ${mc.medianDepletionAge}`}
                  .
                </p>
              )}
            </div>
          );
        })()}

        <FanChart
          fan={mc.fan}
          retirementAge={result.retirementAge}
          agePensionAge={result.agePensionAge}
        />

        <div className="mt-3 border-t border-line pt-3 sm:max-w-sm">
          <Field
            label="Return volatility"
            value={plan.returnVolatility}
            onChange={(v) => quickAdjust({ returnVolatility: v })}
            min={0}
            max={20}
            step={0.5}
            suffix="%"
            hint="Higher volatility = wider outcomes and more sequencing risk."
          />
        </div>

        <p className="mt-3 text-xs text-muted">
          Based on {mc.iterations.toLocaleString()} randomised runs (avg{" "}
          {plan.investmentReturn}% return, ±{plan.returnVolatility}% a year). The
          Age Pension is still a floor, so &lsquo;runs short&rsquo; means below
          your target — not $0 income.
        </p>
      </div>

      {/* What will it take? (goal-seek) */}
      <div className="mt-4 rounded-2xl border border-line bg-panel p-6">
        <h2 className="font-semibold text-white">What will it take?</h2>
        <p className="mb-4 mt-1 text-sm text-slate-300">
          {gs.lasts
            ? `Your plan funds ${fmtCurrency(goal.total)}/yr to age ${plan.lifeExpectancy} on the central projection — here's the headroom on each lever.`
            : `To fund ${fmtCurrency(goal.total)}/yr all the way to age ${plan.lifeExpectancy}, do any one of these:`}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {(() => {
            const spendDelta = gs.maxSpend != null ? gs.maxSpend - gs.currentSpend : null;
            const retireDelta =
              gs.retireAge != null ? gs.retireAge - gs.currentRetireAge : null;
            return (
              <>
                <Lever
                  label={gs.lasts ? "Spend up to" : "Trim spending to"}
                  value={
                    gs.maxSpend != null
                      ? `${fmtCurrency(gs.maxSpend + goal.loanCost)}/yr`
                      : "—"
                  }
                  note={
                    goal.loanCost > 0 && gs.maxSpend != null
                      ? `${fmtCurrency(gs.maxSpend)} living + ${fmtCurrency(goal.loanCost)} home loan`
                      : undefined
                  }
                  delta={
                    spendDelta == null
                      ? "even a low spend falls short"
                      : spendDelta >= 0
                        ? `${fmtCurrency(spendDelta)} of headroom`
                        : `${fmtCurrency(-spendDelta)} less than now`
                  }
                  tone={
                    spendDelta != null && spendDelta >= 0
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }
                />
                <Lever
                  label={gs.extraSavings ? "Save an extra" : "Extra saving"}
                  value={
                    gs.extraSavings == null
                      ? "not enough"
                      : gs.extraSavings === 0
                        ? "none needed"
                        : `${fmtCurrency(gs.extraSavings)}/yr`
                  }
                  delta={
                    gs.extraSavings == null
                      ? "saving alone won't fix it"
                      : gs.extraSavings === 0
                        ? gs.lasts
                          ? "you're covered"
                          : ""
                        : `on top of ${fmtCurrency(gs.currentSavings)}/yr`
                  }
                  tone={gs.extraSavings ? "text-amber-400" : "text-emerald-400"}
                />
                <Lever
                  label={retireDelta && retireDelta > 0 ? "Retire at" : "Retire from"}
                  value={gs.retireAge != null ? `age ${gs.retireAge}` : "—"}
                  delta={
                    retireDelta == null
                      ? ""
                      : retireDelta > 0
                        ? `${retireDelta} yr${retireDelta === 1 ? "" : "s"} later`
                        : retireDelta < 0
                          ? `${-retireDelta} yr earlier is possible`
                          : "as planned"
                  }
                  tone={retireDelta && retireDelta > 0 ? "text-amber-400" : "text-emerald-400"}
                />
              </>
            );
          })()}
        </div>
        <p className="mt-3 text-xs text-muted">
          Each lever on its own, on the central (average-return) projection —
          combine them, or check the likelihood above for the odds.
        </p>
      </div>

      {/* Assumptions summary */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-line bg-panel px-6 py-4">
        {summary.map((s) => (
          <div key={s.label} className="flex items-baseline gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">
              {s.label}
            </span>
            <span className="text-sm font-semibold tabular-nums text-white">
              {s.value}
            </span>
          </div>
        ))}
        <button
          onClick={() => setWizardOpen(true)}
          className="ml-auto text-sm font-medium text-accent hover:underline"
        >
          Edit
        </button>
      </div>

      {/* Narrative */}
      <div className="mt-6 rounded-2xl border border-line bg-panel p-6 text-sm text-slate-300">
        <h2 className="mb-2 font-semibold text-white">What this means</h2>
        {result.lastsToLifeExpectancy ? (
          <p>
            Your plan funds {spendPhrase} through to age {plan.lifeExpectancy}.
            You reach retirement at {result.retirementAge} with{" "}
            <span className="font-semibold text-accent">
              {fmtCurrency(result.superAtRetirement)}
            </span>{" "}
            in super
            {result.firstAgePensionAge !== null && (
              <>
                , and the Age Pension begins topping up your income from age{" "}
                {result.firstAgePensionAge}
              </>
            )}
            .
          </p>
        ) : (
          <p>
            At your planned {isStaged ? "staged spending" : `${fmtCurrency(goal.total)} a year`}, your money runs short
            at age{" "}
            <span className="font-semibold text-amber-400">
              {result.depletedAge}
            </span>
            . Try retiring later, spending less, saving more, or leaning on the
            Age Pension by adjusting your assets.
          </p>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        General information only — not financial advice. Superannuation forecast
        under ASIC RG 276 (Instrument 2022/603). FY{config.financialYear} figures.
        {config.deeming.needsVerification &&
          " Deeming rates pending confirmation."}
      </p>

      {wizardOpen && (
        <PlanWizard
          initial={plan}
          configured={configured}
          config={config}
          onComplete={handleComplete}
          onClose={() => setWizardOpen(false)}
        />
      )}

      {budgetOpen && (
        <BudgetBuilder
          plan={plan}
          config={config}
          onApply={handleBudgetApply}
          onClose={() => setBudgetOpen(false)}
        />
      )}

      <LifestageModal
        open={lifestageOpen}
        onClose={() => setLifestageOpen(false)}
        plan={plan}
        config={config}
      />

      {selectedAge != null &&
        (() => {
          const ages = result.rows.map((r) => r.age);
          const row = result.rows.find((r) => r.age === selectedAge);
          if (!row) return null;
          const min = ages[0];
          const max = ages[ages.length - 1];
          return (
            <YearDetailModal
              row={row}
              plan={plan}
              onClose={() => setSelectedAge(null)}
              onPrev={() => setSelectedAge((a) => (a != null ? Math.max(min, a - 1) : a))}
              onNext={() => setSelectedAge((a) => (a != null ? Math.min(max, a + 1) : a))}
              canPrev={selectedAge > min}
              canNext={selectedAge < max}
            />
          );
        })()}

      {incomeAge != null &&
        (() => {
          const ages = result.rows.map((r) => r.age);
          const row = result.rows.find((r) => r.age === incomeAge);
          if (!row) return null;
          const min = ages[0];
          const max = ages[ages.length - 1];
          return (
            <IncomeYearModal
              row={row}
              plan={plan}
              config={config}
              onClose={() => setIncomeAge(null)}
              onPrev={() => setIncomeAge((a) => (a != null ? Math.max(min, a - 1) : a))}
              onNext={() => setIncomeAge((a) => (a != null ? Math.min(max, a + 1) : a))}
              canPrev={incomeAge > min}
              canNext={incomeAge < max}
            />
          );
        })()}
    </main>
  );
}
