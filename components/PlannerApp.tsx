"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import GetStartedPanel from "@/components/GetStartedPanel";
import {
  AgePensionExplainer,
  LikelihoodExplainer,
  MoneyLastsExplainer,
  RetirementIncomeGoalExplainer,
  SuperAtRetirementExplainer,
} from "@/components/explainers";
import { runMonteCarlo, MC_CONFIDENCE_TARGET, MC_CONFIDENCE_MC } from "@/lib/au/montecarlo";
import { whatWillItTake } from "@/lib/au/goalseek";
import { maxSpendForConfidence } from "@/lib/au/strategies";
import TrimSpendingModal from "@/components/TrimSpendingModal";
import BoostSpendingModal from "@/components/BoostSpendingModal";
import ProbabilityYearModal from "@/components/ProbabilityYearModal";
import { retirementGoal } from "@/lib/au/goal";
import { logout } from "@/app/actions/auth";
import {
  deletePlan,
  savePlan,
  saveDraft,
  type SavedPlan,
  type PlanDraft,
} from "@/app/actions/plans";
import { simulate } from "@/lib/au/simulate";
import type { EngineConfig } from "@/lib/au/config";
import { fmtCurrency } from "@/lib/au/format";
import { track, trackPlanBuiltConversion } from "@/lib/analytics";
import { planCompleteness } from "@/lib/au/completeness";
import CompletenessRing from "@/components/CompletenessRing";
import WithdrawalRateCard from "@/components/WithdrawalRateCard";
import {
  DEFAULT_PLAN,
  hasInvestmentProperty,
  spendingRange,
  type RetirementPlan,
} from "@/lib/au/types";

const STORAGE_KEY = "au-retirement-plan";
const BASELINE_KEY = "au-retirement-baseline";
const BASELINE_NAME_KEY = "au-retirement-baseline-name"; // label for the ghost line
const WORKING_TS_KEY = "au-retirement-plan-ts"; // when the local working plan was last saved
const NUDGE_KEY = "au-retirement-nudge-dismissed"; // signed-out "save your work" banner dismissed

// A blank starting point for a first-time visitor's "Enter my details" wizard:
// the personal figures (age, super, salary) start empty (NaN renders as a blank
// Field) so nothing looks like the user's data until they type it. Spending and
// retirement age keep sensible defaults so a first-timer can finish quickly
// without first building a budget — they can still refine them afterwards.
const BLANK_STARTER: RetirementPlan = {
  ...DEFAULT_PLAN,
  people: [{ ...DEFAULT_PLAN.people[0], currentAge: NaN, superBalance: NaN, salary: NaN }],
  superMode: "individual",
  outsideSuper: 0,
  annualOutsideSavings: 0,
};

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
  pending = false,
}: {
  label: string;
  value: string;
  delta?: string;
  note?: string;
  tone?: string;
  pending?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel-2 p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
        {pending && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-label="updating" />}
      </div>
      <div className={`mt-1 text-xl font-bold tabular-nums text-white ${pending ? "opacity-60" : ""}`}>{value}</div>
      {note && <div className="mt-0.5 text-[11px] text-muted">{note}</div>}
      {delta && <div className={`mt-0.5 text-xs ${tone}`}>{delta}</div>}
    </div>
  );
}

export default function PlannerApp({
  user,
  savedPlans,
  draft = null,
  config,
  reviewDue = 0,
}: {
  user: { email: string; isAdmin: boolean } | null;
  savedPlans: SavedPlan[];
  draft?: PlanDraft | null;
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
  // When the user opts out of the guide, seed the wizard with what they entered
  // so nothing is re-typed (null → the blank starter, for a cold "enter details").
  const [wizardSeed, setWizardSeed] = useState<RetirementPlan | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [lifestageOpen, setLifestageOpen] = useState(false);
  const [trimOpen, setTrimOpen] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);
  const [selectedAge, setSelectedAge] = useState<number | null>(null);
  const [incomeAge, setIncomeAge] = useState<number | null>(null);
  const [fanAge, setFanAge] = useState<number | null>(null);
  const [saveName, setSaveName] = useState("");
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  useEffect(() => {
    // Decide which working plan to restore. Priority: the newer of the local
    // working copy vs. the signed-in user's cloud draft (so work follows them
    // across devices / survives cleared storage); else the most recent saved
    // scenario; else the empty Get-started state.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const localTs = Number(localStorage.getItem(WORKING_TS_KEY) || 0);
      const draftTs = draft ? new Date(draft.updated_at).getTime() : 0;

      if (draft && draftTs >= localTs) {
        // Cloud draft is at least as fresh (e.g. newer work from another device
        // or a first sign-in here) → adopt it and mirror to this device.
        const working = { ...DEFAULT_PLAN, ...draft.data };
        setPlan(working);
        setBaseline(working);
        setBaselineName(null);
        setConfigured(true);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(working));
        localStorage.setItem(WORKING_TS_KEY, String(draftTs));
        if (raw && localTs < draftTs) setNotice("Restored your latest work from your account.");
      } else if (raw) {
        const working = { ...DEFAULT_PLAN, ...JSON.parse(raw) };
        const rawBase = localStorage.getItem(BASELINE_KEY);
        setPlan(working);
        setBaseline(rawBase ? { ...DEFAULT_PLAN, ...JSON.parse(rawBase) } : working);
        setBaselineName(localStorage.getItem(BASELINE_NAME_KEY) || null);
        setConfigured(true);
      } else if (savedPlans.length > 0) {
        // No working copy anywhere, but there are saved scenarios → open the most
        // recent (listPlans() is ordered newest-first) straight into the dashboard.
        const sp = savedPlans[0];
        const working = { ...DEFAULT_PLAN, ...sp.data };
        setPlan(working);
        setBaseline(working);
        setBaselineName(sp.name);
        setConfigured(true);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(working));
        localStorage.setItem(BASELINE_KEY, JSON.stringify(working));
        localStorage.setItem(BASELINE_NAME_KEY, sp.name);
        setNotice(`Loaded your most recent scenario “${sp.name}”.`);
      }
      if (localStorage.getItem(NUDGE_KEY)) setNudgeDismissed(true);
    } catch {
      /* ignore malformed storage — fall back to the empty Get-started state */
    }
    setReady(true);
  }, []);

  const dismissNudge = () => {
    setNudgeDismissed(true);
    try {
      localStorage.setItem(NUDGE_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  // Keep a ref to the latest plan for the visibility-flush handler below.
  const planRef = useRef(plan);
  planRef.current = plan;

  // Debounced cloud auto-save of the working plan (signed-in users) so unsaved
  // work is backed up server-side and follows them to other devices / survives
  // cleared browser storage.
  useEffect(() => {
    if (!ready || !user || !configured) return;
    const t = setTimeout(() => {
      void saveDraft(plan);
    }, 1500);
    return () => clearTimeout(t);
  }, [plan, ready, user, configured]);

  // Best-effort flush when the tab is hidden, to catch edits made within the
  // debounce window (localStorage already holds them for this device).
  useEffect(() => {
    if (!user) return;
    const flush = () => {
      if (document.visibilityState === "hidden" && configured) void saveDraft(planRef.current);
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [user, configured]);

  // Funnel top: tag each visit once we've read localStorage — did the visitor
  // land on the empty Get-started state (new) or straight onto results (has a
  // plan)? Combined with the guide/wizard events, this shows how far explorers
  // get before bouncing. Fires once per mount. Guide entry is captured by
  // GuidedIntro's first "Guide step".
  const landingTracked = useRef(false);
  useEffect(() => {
    if (!ready || landingTracked.current) return;
    landingTracked.current = true;
    track(configured ? "Results viewed" : "Get started shown", { signed_in: !!user });
  }, [ready, configured, user]);

  const result = useMemo(() => simulate(plan, config), [plan, config]);
  const mc = useMemo(() => runMonteCarlo(plan, config), [plan, config]);
  const successPct = Math.round(mc.successRate * 100);
  const successTone: "accent" | "amber" | "red" =
    mc.successRate >= 0.85 ? "accent" : mc.successRate >= 0.6 ? "amber" : "red";
  const gs = useMemo(() => whatWillItTake(plan, config), [plan, config]);

  // Prudent max spend: the most you can spend while Monte Carlo success still
  // clears the shared 85% bar (matching the What-If safe spend and the boost
  // modal). Heavier than the deterministic goal-seek, so debounce it and show a
  // pulse; fall back to the central-projection figure until it settles.
  const [mcMaxSpend, setMcMaxSpend] = useState<number | null>(null);
  const [mcMaxPending, setMcMaxPending] = useState(false);
  useEffect(() => {
    if (!ready || !configured) return;
    setMcMaxPending(true);
    const id = setTimeout(() => {
      setMcMaxSpend(maxSpendForConfidence(plan, config, MC_CONFIDENCE_TARGET, MC_CONFIDENCE_MC));
      setMcMaxPending(false);
    }, 400);
    return () => clearTimeout(id);
  }, [plan, config, ready, configured]);
  const maxSpend = mcMaxSpend ?? gs.maxSpend; // prudent once settled, central meanwhile

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
      localStorage.setItem(WORKING_TS_KEY, String(Date.now()));
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

  // Leaving the first-run guide. Completing adopts the entered plan and shows the
  // dashboard; opting out ("Enter my details myself") continues into the manual
  // wizard, carrying over whatever they entered so far (rather than the empty
  // Get-started panel or a blank form).
  const handleGuideExit = (next: RetirementPlan, completed: boolean) => {
    if (completed) {
      commit(next);
      setConfigured(true);
      track("Guide completed");
      trackPlanBuiltConversion();
    } else {
      track("Guide exited to wizard");
      setWizardSeed(next);
      setWizardOpen(true);
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
    setWizardSeed(null);
    track("Wizard completed");
    trackPlanBuiltConversion();
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

  // Wipe the guest's local data and return to the fresh first-visit state.
  const startOver = () => {
    if (!window.confirm("Clear your details and start over? This can't be undone.")) return;
    try {
      [STORAGE_KEY, BASELINE_KEY, BASELINE_NAME_KEY, "au-retirement-compare"].forEach((k) =>
        localStorage.removeItem(k),
      );
    } catch {
      /* ignore */
    }
    setPlan(DEFAULT_PLAN);
    setBaseline(DEFAULT_PLAN);
    setBaselineName(null);
    setConfigured(false);
    setShowGuide(false);
    setSaveName("");
    setNotice(null);
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
        track("Plan saved");
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
      <main className="flex min-h-screen items-center justify-center p-6">
        <Logo className="h-auto w-[min(88vw,540px)]" />
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
        {configured &&
          (() => {
            const comp = planCompleteness(plan);
            return (
              <button
                onClick={() => setWizardOpen(true)}
                title="Edit scenario — add detail for a sharper model"
                className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2 text-left transition hover:border-accent/40"
              >
                <CompletenessRing pct={comp.pct} size={38} />
                <div>
                  <div className="text-sm font-semibold text-white">{comp.tier}</div>
                  <div className="text-xs text-accent">
                    {comp.pct < 100 ? "Edit scenario · add detail →" : "Edit scenario →"}
                  </div>
                </div>
              </button>
            );
          })()}
      </header>

      {/* Signed-out users: their work lives only on this device — nudge them to
          create an account so it's backed up and available anywhere. */}
      {!user && configured && !nudgeDismissed && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-5 py-3">
          <p className="text-sm text-amber-100">
            <span aria-hidden>💾</span> Your plan is saved on{" "}
            <strong>this device only</strong>. Create a free account to keep it safe and pick up
            where you left off on any device.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/signup"
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-soft"
            >
              Create free account
            </Link>
            <Link href="/login" className="text-sm font-medium text-amber-100 hover:text-white">
              Sign in
            </Link>
            <button
              onClick={dismissNudge}
              aria-label="Dismiss"
              className="ml-1 rounded p-1 text-amber-200/70 transition hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="mt-4" />
      <Disclosures config={config} />
      <div className="mb-6" />

      {/* Status confirmations (loaded / saved / applied) — shown to everyone. */}
      {notice && <p className="mb-4 text-xs text-accent">{notice}</p>}

      {/* Saved-scenarios card — signed-in users only. */}
      {user && (configured || savedPlans.length > 0) && (
      <div className="mb-6 rounded-2xl border border-line bg-panel px-5 py-4">
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
            {configured && (
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
            )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          <Link
            href="/compare"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-accent/50 hover:text-white"
          >
            ⚖ Compare scenarios
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/what-if"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-accent/50 hover:text-white"
          >
            🎛 What if…
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
      )}

      {/* The projection only renders once the user has actually built a plan.
          Before that we show the Get-started panel — never fabricated numbers. */}
      {configured ? (
        <>
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
              onClick={() => {
                track("Budget opened");
                setBudgetOpen(true);
              }}
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
          tagTitle={`${successPct}% of market return scenarios fund your spending all the way to age ${plan.lifeExpectancy} — tap for the breakdown`}
          sub={`${successPct}% likely to last to your planning age of ${plan.lifeExpectancy}`}
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

      {/* Withdrawal-rate diagnostic */}
      <WithdrawalRateCard result={result} plan={plan} successPct={successPct} />

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
          onSelectYear={(age) => {
            track("Year breakdown opened", { chart: "balance" });
            setSelectedAge(age);
          }}
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
                title={`${successPct}% likely to last to your planning age of ${plan.lifeExpectancy} — tap for the breakdown`}
                className={`group inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition hover:brightness-125 ${
                  successTone === "accent"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : successTone === "amber"
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-red-500/15 text-red-400"
                }`}
              >
                {successPct}% likely to last to {plan.lifeExpectancy}
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
          <h2 className="font-semibold text-white">Income sources</h2>
          <div className="flex flex-wrap gap-4">
            <LegendDot color="#facc15" label="Take-home pay" />
            {plan.workIncome && <LegendDot color="#f472b6" label="Part-time work" />}
            <LegendDot color="#a78bfa" label="Age Pension" />
            <LegendDot color="#34d399" label="Super" />
            <LegendDot color="#38bdf8" label="Outside super" />
            {hasInvestmentProperty(plan) && <LegendDot color="#fb923c" label="Net rent" />}
          </div>
        </div>
        <IncomeChart
          result={result}
          minDrawdownBands={config.minDrawdownBands}
          onSelectYear={(age) => {
            track("Year breakdown opened", { chart: "income" });
            setIncomeAge(age);
          }}
        />
        <p className="mt-2 text-center text-xs text-muted">
          Dotted lines mark where super&apos;s <strong>minimum drawdown</strong> rate steps up (5% → 6% → 7%…) — the law
          makes you draw a bigger slice of super at those ages, which can shift the super-vs-savings mix and cause the
          steps you see. Click any year for the full breakdown.
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
              {mc.worstCaseDepletionAge !== null && mc.medianDepletionAge !== null && (
                <p className="mt-2 text-xs text-muted">
                  When your money does run short, it&apos;s typically around age{" "}
                  {mc.medianDepletionAge}
                  {mc.worstCaseDepletionAge < mc.medianDepletionAge &&
                    ` — and as early as age ${mc.worstCaseDepletionAge} in the worst 10% of outcomes`}
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
          onSelectAge={setFanAge}
        />
        <p className="mt-1 text-center text-xs text-muted">
          Click a year to see the range of possible outcomes — and why they spread.
        </p>

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
            const spendDelta = maxSpend != null ? maxSpend - gs.currentSpend : null;
            const retireDelta =
              gs.retireAge != null ? gs.retireAge - gs.currentRetireAge : null;
            const targetPct = Math.round(MC_CONFIDENCE_TARGET * 100);
            return (
              <>
                <Lever
                  label={spendDelta != null && spendDelta < 0 ? "Trim spending to" : "Spend up to"}
                  value={maxSpend != null ? `${fmtCurrency(maxSpend + goal.loanCost)}/yr` : "—"}
                  note={
                    maxSpend != null
                      ? `${goal.loanCost > 0 ? `${fmtCurrency(maxSpend)} living + ${fmtCurrency(goal.loanCost)} loan · ` : ""}${targetPct}% likely to last`
                      : undefined
                  }
                  delta={
                    spendDelta == null
                      ? "even a low spend is risky"
                      : spendDelta >= 0
                        ? `${fmtCurrency(spendDelta)} of headroom`
                        : `${fmtCurrency(-spendDelta)} less than now`
                  }
                  tone={
                    spendDelta != null && spendDelta >= 0
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }
                  pending={mcMaxPending}
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
                  label={retireDelta && retireDelta > 0 ? "Retire at" : "Retire as early as"}
                  value={gs.retireAge != null ? `age ${gs.retireAge}` : "—"}
                  delta={
                    retireDelta == null
                      ? ""
                      : retireDelta > 0
                        ? `${retireDelta} yr${retireDelta === 1 ? "" : "s"} later`
                        : retireDelta < 0
                          ? `${-retireDelta} yr${retireDelta === -1 ? "" : "s"} sooner than your plan`
                          : "as planned"
                  }
                  tone={retireDelta && retireDelta > 0 ? "text-amber-400" : "text-emerald-400"}
                />
              </>
            );
          })()}
        </div>
        <p className="mt-3 text-xs text-muted">
          Spend is the most you can spend at a {Math.round(MC_CONFIDENCE_TARGET * 100)}% chance of lasting (allowing
          for market ups and downs); saving and retirement are on the central average-return projection. Each lever on
          its own — combine them, or check the likelihood above.
        </p>
        {!gs.lasts && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-sm text-slate-300">
              Want the app to do it for you? Trim discretionary spending — keeping
              your essentials — to make your money last to age {plan.lifeExpectancy}.
            </p>
            <button
              onClick={() => setTrimOpen(true)}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110"
            >
              ✂️ Help me trim spending
            </button>
          </div>
        )}
        {gs.lasts && gs.maxSpend != null && gs.maxSpend - gs.currentSpend >= 1000 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-sm text-slate-300">
              Money to spare? Put your headroom to work — raise discretionary
              spending (essentials kept) to the most your plan can afford while
              staying about {Math.round(MC_CONFIDENCE_TARGET * 100)}% likely to
              last to age {plan.lifeExpectancy}.
            </p>
            <button
              onClick={() => setBoostOpen(true)}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110"
            >
              📈 Help me spend more
            </button>
          </div>
        )}
      </div>

      <TrimSpendingModal
        open={trimOpen}
        onClose={() => setTrimOpen(false)}
        onApply={(patch) => {
          quickAdjust(patch);
          setNotice("Spending trimmed (essentials kept) to make your money last to life expectancy.");
        }}
        plan={plan}
        config={config}
        result={result}
      />

      <BoostSpendingModal
        open={boostOpen}
        onClose={() => setBoostOpen(false)}
        onApply={(patch) => {
          quickAdjust(patch);
          track("Spending boosted");
          setNotice("Spending raised (essentials kept) to the most your plan can afford.");
        }}
        plan={plan}
        config={config}
        result={result}
      />

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
        </>
      ) : (
        <GetStartedPanel
          onGuide={() => {
            track("Get started: guide");
            setShowGuide(true);
          }}
          onWizard={() => {
            track("Get started: wizard");
            setWizardOpen(true);
          }}
        />
      )}

      {wizardOpen && (
        <PlanWizard
          initial={configured ? plan : (wizardSeed ?? BLANK_STARTER)}
          configured={configured}
          config={config}
          onComplete={handleComplete}
          onProgress={(d) => {
            // Only mirror progress into the live dashboard / storage once there's
            // a real plan — a blank first-run wizard shouldn't push NaN fields
            // into the (still empty) dashboard or persist a half-entered plan.
            if (configured) {
              setPlan(d);
              persistWorking(d);
            }
          }}
          onClose={() => {
            setWizardOpen(false);
            setWizardSeed(null);
          }}
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

      {fanAge != null &&
        (() => {
          const point = mc.fan.find((f) => f.age === fanAge);
          if (!point) return null;
          const ages = mc.fan.map((f) => f.age);
          const min = ages[0];
          const max = ages[ages.length - 1];
          const central = result.rows.find((r) => r.age === fanAge)?.total ?? null;
          return (
            <ProbabilityYearModal
              age={fanAge}
              point={point}
              central={central}
              iterations={mc.iterations}
              plan={plan}
              onClose={() => setFanAge(null)}
              onPrev={() => setFanAge((a) => (a != null ? Math.max(min, a - 1) : a))}
              onNext={() => setFanAge((a) => (a != null ? Math.min(max, a + 1) : a))}
              canPrev={fanAge > min}
              canNext={fanAge < max}
            />
          );
        })()}

      {/* Guest reset — once a signed-out user has built a plan they can wipe it
          and start fresh. Hidden in the empty first-visit state (nothing to clear). */}
      {!user && configured && (
        <div className="mt-10 border-t border-line pt-4 text-center">
          <button
            onClick={startOver}
            className="text-xs text-muted transition hover:text-white"
          >
            Start again — clear my details
          </button>
        </div>
      )}
    </main>
  );
}
