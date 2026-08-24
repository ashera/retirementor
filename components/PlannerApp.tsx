"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import StatCard from "@/components/StatCard";
import RetirementChart from "@/components/RetirementChart";
import { ageGapInfo } from "@/components/ageAxis";
import YearDetailModal from "@/components/YearDetailModal";
import IncomeYearModal from "@/components/IncomeYearModal";
import IncomeChart from "@/components/IncomeChart";
import TaxChart from "@/components/TaxChart";
import DeathBenefitCard from "@/components/DeathBenefitCard";
import TaxYearModal from "@/components/TaxYearModal";
import FanChart from "@/components/FanChart";
import MonteCarloMark from "@/components/MonteCarloMark";
import ReturnSeriesModal from "@/components/ReturnSeriesModal";
import PlanWizard from "@/components/PlanWizard";
import BudgetBuilder from "@/components/BudgetBuilder";
import ScenarioNotesModal from "@/components/ScenarioNotesModal";
import Field from "@/components/Field";
import Logo from "@/components/Logo";
import Disclosures from "@/components/Disclosures";
import LifestageModal from "@/components/LifestageModal";
import GuidedIntro from "@/components/GuidedIntro";
import GetStartedPanel from "@/components/GetStartedPanel";
import CompletenessRing from "@/components/CompletenessRing";
import { planCompleteness, budgetCompleteness } from "@/lib/au/completeness";
import NewScenarioModal from "@/components/NewScenarioModal";
import ConfidenceHero, { type PlanChip } from "@/components/ConfidenceHero";
import { useHeavyMetrics } from "@/components/useHeavyMetrics";
import {
  AgePensionExplainer,
  LikelihoodExplainer,
  MoneyLastsExplainer,
  RetirementIncomeGoalExplainer,
  SuperAtRetirementExplainer,
} from "@/components/explainers";
import { MC_CONFIDENCE_TARGET, MC_CONFIDENCE_MC, MC_CONFIDENCE_VERIFY } from "@/lib/au/montecarlo";
import { failsafeSpend as historicalFailsafe } from "@/lib/au/stresstest";
import { streamNamesLabel } from "@/lib/au/yearIncome";
import { whatWillItTake } from "@/lib/au/goalseek";
import { maxSpendForConfidence, withSpend, appliedStrategies } from "@/lib/au/strategies";
import { composeScenario, toActiveScenario, EMPTY_LAYER, type StrategyLayer } from "@/lib/au/scenario";
import { initialWithdrawal, withdrawalBand } from "@/lib/au/withdrawal";
import TrimSpendingModal from "@/components/TrimSpendingModal";
import BoostSpendingModal from "@/components/BoostSpendingModal";
import ProbabilityYearModal from "@/components/ProbabilityYearModal";
import { retirementGoal } from "@/lib/au/goal";
import { essentialsFloor } from "@/lib/au/lifestages";
import { logout } from "@/app/actions/auth";
import {
  deletePlan,
  updatePlan,
  renameScenario,
  createScenario,
  setActivePlan,
  getOrCreateActiveScenario,
  createShareLink,
  revokeShareLink,
  type SavedPlan,
} from "@/app/actions/plans";
import { simulate } from "@/lib/au/simulate";
import type { EngineConfig } from "@/lib/au/config";
import { fmtCurrency } from "@/lib/au/format";
import { track, trackPlanBuiltConversion } from "@/lib/analytics";
import { trackVisit } from "@/app/actions/track";
import CountryFlag from "@/components/CountryFlag";
import { WithdrawalRateStatExplainer } from "@/components/WithdrawalRateCard";
import {
  DEFAULT_PLAN,
  getLifeEvents,
  hasInvestmentProperty,
  householdHorizon,
  householdRetirementOffset,
  oldestCurrentAge,
  spendingRange,
  type RetirementPlan,
} from "@/lib/au/types";

const STORAGE_KEY = "au-retirement-plan";
const BASELINE_KEY = "au-retirement-baseline";
const BASELINE_NAME_KEY = "au-retirement-baseline-name"; // label for the ghost line
const WORKING_TS_KEY = "au-retirement-plan-ts"; // when the local working plan was last saved
const SAVED_ID_KEY = "au-retirement-saved-id"; // the plans-row id the active scenario is (for in-place Save)
const PLAN_OWNER_KEY = "au-retirement-plan-owner"; // whose account last wrote the local plan ("" = built while signed out)
const NUDGE_KEY = "au-retirement-nudge-dismissed"; // signed-out "save your work" banner dismissed

// Shared styling for the ⚙ Manage modal's action tiles (buttons + links alike).
const SCEN_ACTION =
  "flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-sm font-medium text-slate-200 transition hover:border-accent/50 hover:text-white disabled:opacity-60";

// The confidence hero's Monte Carlo spend tiers (safe 85% / failsafe 95%) are a
// deterministic (fixed-seed) function of plan + config, but each is ~12 MC runs. Cache
// them per plan+config signature so returning to the dashboard (from What-If, a report,
// the back button…) reuses the result instead of re-running the "Assessing your plan"
// solve for a plan that hasn't changed. Backed by sessionStorage so it survives a full
// page reload too (not just in-app navigation); only a genuine plan/config change misses.
const TIER_SS_KEY = "au-retirement-tier-cache";
const tierCache = new Map<string, { safe: number; failsafe: number }>();
if (typeof window !== "undefined") {
  try {
    const raw = sessionStorage.getItem(TIER_SS_KEY);
    if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, { safe: number; failsafe: number }>)) tierCache.set(k, v);
  } catch {
    /* ignore malformed cache */
  }
}
const persistTierCache = () => {
  if (typeof window === "undefined") return;
  try {
    while (tierCache.size > 20) tierCache.delete(tierCache.keys().next().value as string); // bound
    sessionStorage.setItem(TIER_SS_KEY, JSON.stringify(Object.fromEntries(tierCache)));
  } catch {
    /* ignore quota / serialisation errors */
  }
};

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

/** Whether a plan has actually been built (vs. a blank "start from scratch" shell,
 *  whose personal figures are unset — NaN in memory, null after a JSON round-trip).
 *  A blank scenario renders the Get-started build state, not a projection. */
const planIsBuilt = (plan: RetirementPlan): boolean => {
  const age = plan?.people?.[0]?.currentAge;
  return typeof age === "number" && Number.isFinite(age) && age > 0;
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

/** Per-scenario share control: mints (or reuses) a public read-only link, copies
 *  it to the clipboard, and lets the owner revoke it. Lives in the saved-scenarios
 *  chip beside the Report/Delete actions. */
function ShareControl({
  id,
  initialToken,
  onNotice,
}: {
  id: string;
  initialToken: string | null;
  onNotice: (msg: string) => void;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(false);

  const linkFor = (t: string) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/s/${t}`;

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      onNotice("Share link copied — anyone with it can view this scenario (read-only).");
    } catch {
      onNotice(`Share link: ${url}`); // clipboard blocked — show it so they can copy manually
    }
  };

  const share = async () => {
    if (busy) return;
    if (token) return void copy(linkFor(token));
    setBusy(true);
    try {
      const res = await createShareLink(id);
      if (res.token) {
        setToken(res.token);
        await copy(linkFor(res.token));
      } else {
        onNotice(res.error ?? "Couldn't create a share link.");
      }
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await revokeShareLink(id);
      setToken(null);
      onNotice("Share link revoked — the public link no longer works.");
    } finally {
      setBusy(false);
    }
  };

  return token ? (
    <div className="inline-flex items-center overflow-hidden rounded-lg border border-line bg-panel-2 text-sm">
      <button
        onClick={share}
        disabled={busy}
        title="Copy the public read-only link"
        className="px-3 py-1.5 font-medium text-accent transition hover:bg-accent/10 disabled:opacity-60"
      >
        🔗 Copy link
      </button>
      <button
        onClick={revoke}
        disabled={busy}
        title="Disable the public link"
        className="border-l border-line px-2 py-1.5 text-muted transition hover:text-red-400 disabled:opacity-60"
      >
        unshare
      </button>
    </div>
  ) : (
    <button
      onClick={share}
      disabled={busy}
      title="Create a public read-only link to send someone"
      className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-accent/50 hover:text-white disabled:opacity-60"
    >
      🔗 Share
    </button>
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
  country = null,
  savedPlans,
  active = null,
  config: configProp,
  reviewDue = 0,
  userStats = null,
  sharedPlan = null,
}: {
  user: { email: string; isAdmin: boolean; name?: string | null; avatarUrl?: string | null } | null;
  country?: string | null; // location flag for the menu bar (user's or visitor's)
  savedPlans: SavedPlan[];
  active?: SavedPlan | null;
  config: EngineConfig;
  reviewDue?: number;
  userStats?: { total: number; last7Days: number } | null;
  // Public read-only view (a share link or a curated /scenario/<slug> demo):
  // preload this scenario and never read or write the viewer's own localStorage /
  // cloud draft. `basePath` is this view's root (e.g. "/s/<token>" or
  // "/scenario/<slug>") so in-app links (What-If) stay within the shared context.
  sharedPlan?: { plan: RetirementPlan; name: string; basePath: string } | null;
}) {
  const shared = !!sharedPlan;
  // Keep What-If inside the shared context so it starts from THIS scenario, not
  // the viewer's own plan; signed-in/normal visitors go to the regular sandbox.
  const whatIfHref = sharedPlan ? `${sharedPlan.basePath}/what-if` : "/what-if";
  const stressHref = sharedPlan ? `${sharedPlan.basePath}/stress-test` : "/stress-test";
  const router = useRouter();
  // Config arrives as a server prop, so every server re-render (e.g. after a save
  // that revalidates "/") hands us a NEW object with the same VALUE. Left raw, that
  // identity change would bust every downstream memo (simulate, Monte Carlo, the SWR
  // solver…) and re-run them needlessly. Stabilise it by value so those memos only
  // recompute when the config actually changes (an admin ref-data edit).
  const config = useMemo(() => configProp, [JSON.stringify(configProp)]);
  // The active scenario: raw inputs (base) + an explicit strategy layer. Everything
  // downstream reads the COMPOSED plan, which is DERIVED — never edited directly.
  // Dashboard edits go to `base`; strategies win on any overlapping field.
  const [base, setBase] = useState<RetirementPlan>(DEFAULT_PLAN);
  const [strategies, setStrategies] = useState<StrategyLayer>(EMPTY_LAYER);
  const plan = useMemo(() => composeScenario(base, strategies, config), [base, strategies, config]);
  // The persist/save form of the active scenario: the composed plan plus a bookmark
  // carrying the strategy layer + base, so a reload / save restores the strategies.
  // Strategy-free plans store plain (no bookmark) — smaller and back-compatible.
  const storable = useMemo<RetirementPlan>(
    () =>
      strategies.active.length === 0
        ? { ...plan, whatIf: undefined }
        : {
            ...plan,
            whatIf: {
              active: [...strategies.active],
              values: strategies.values,
              baselineId: "current",
              baselinePlan: { ...base, whatIf: undefined },
            },
          },
    [plan, strategies, base],
  );
  // Adopt a composed plan as the active scenario (splits it into base + strategy layer).
  const splitInto = (composed: RetirementPlan) => {
    const sc = toActiveScenario(composed);
    setBase(sc.base);
    setStrategies(sc.strategies);
  };
  // Baseline = the last committed plan (wizard / saved / load). Quick-adjust tweaks
  // update the active scenario only, so the chart can show a "vs saved" ghost line.
  const [baseline, setBaseline] = useState<RetirementPlan>(DEFAULT_PLAN);
  // Where the baseline came from, so the ghost line names it (a loaded/saved
  // scenario's name, or null when it's just the pre-tweak committed plan).
  const [baselineName, setBaselineName] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  // The dashboard replaces the full-screen guided intro in place (same route), so
  // the window keeps whatever scroll position the guide was left at. Reset to the
  // top when the guide closes, so the dashboard opens at the top — not halfway down.
  const wasGuiding = useRef(showGuide);
  useEffect(() => {
    if (wasGuiding.current && !showGuide) window.scrollTo(0, 0);
    wasGuiding.current = showGuide;
  }, [showGuide]);
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
  // The main balance chart toggles between "balance" (super + outside) and
  // "networth" (also folds in home equity + investment property), like What-If.
  const [balanceView, setBalanceView] = useState<"balance" | "networth">("balance");
  const [incomeAge, setIncomeAge] = useState<number | null>(null);
  const [taxAge, setTaxAge] = useState<number | null>(null);
  const [fanAge, setFanAge] = useState<number | null>(null);
  const [showReturnSeries, setShowReturnSeries] = useState(false);
  // The active scenario's name (what auto-save writes under, shown + inline-editable
  // in the scenario bar). `nameDraft` backs the editable input so typing doesn't fire
  // a rename / auto-save on every keystroke.
  const [activeName, setActiveName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  useEffect(() => {
    setNameDraft(activeName ?? "");
  }, [activeName]);
  // The plans-row id the active scenario IS. Auto-save writes here in place; a "New
  // scenario" branch points it at the fresh copy. Null → not yet created (created on
  // the first auto-save). Persisted in localStorage so it survives reload + the What-If hop.
  const [savedId, setSavedId] = useState<string | null>(null);
  const persistSavedId = (id: string | null) => {
    if (shared) return;
    try {
      if (id) localStorage.setItem(SAVED_ID_KEY, id);
      else localStorage.removeItem(SAVED_ID_KEY);
    } catch {
      /* ignore */
    }
  };
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [newScenarioOpen, setNewScenarioOpen] = useState(false);
  const [scenarioModalOpen, setScenarioModalOpen] = useState(false);
  // When the plan/budget wizard is opened FROM the Manage-scenario modal (its
  // completeness donuts), reopen that modal once the wizard closes — so the user lands
  // back where they were rather than on the bare dashboard.
  const [returnToManage, setReturnToManage] = useState(false);
  useEffect(() => {
    if (returnToManage && !wizardOpen && !budgetOpen) {
      setReturnToManage(false);
      setScenarioModalOpen(true);
    }
  }, [returnToManage, wizardOpen, budgetOpen]);
  const [notesOpen, setNotesOpen] = useState(false);
  // Latest notes per saved scenario, so the modal reflects saves without a full
  // router refresh (which would re-simulate). Keyed by plans-row id.
  const [notesOverride, setNotesOverride] = useState<Record<string, string>>({});
  // Switching scenarios reloads + re-simulates the whole plan (a few seconds), so we
  // lock the page behind a spinner until the transition settles.
  const [switching, setSwitching] = useState(false);
  useEffect(() => {
    if (!pending) setSwitching(false);
  }, [pending]);

  useEffect(() => {
    // Public share-link view: load the shared scenario straight in and stop —
    // never read or write this viewer's localStorage (it's someone else's plan).
    if (sharedPlan) {
      const working = { ...DEFAULT_PLAN, ...sharedPlan.plan };
      splitInto(working);
      setBaseline(working);
      setBaselineName(sharedPlan.name);
      setConfigured(true);
      setReady(true);
      track("Shared scenario viewed");
      return;
    }
    // Decide which working plan to restore. Priority: the newer of the local
    // working copy vs. the signed-in user's ACTIVE scenario (so work follows them
    // across devices / survives cleared storage). The active scenario is where all
    // auto-save writes go; local edits belong to it, so it always owns the id/name.
    // No active + no local → the empty Get-started state.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const localTs = Number(localStorage.getItem(WORKING_TS_KEY) || 0);
      const activeTs = active ? new Date(active.updated_at).getTime() : 0;
      const localId = localStorage.getItem(SAVED_ID_KEY);
      // Whose work is the local copy? `PLAN_OWNER_KEY` is stamped on every persist
      // (empty string = built while signed out). A fresher local plan may overwrite
      // the signed-in user's active scenario ONLY if it's theirs; work built while
      // signed out — or under another account — is "foreign" and must never clobber a
      // saved scenario (repro: create scenario → log out → clear details → build as a
      // guest → log back in silently destroyed it). Legacy copies (no owner stamp yet)
      // fall back to the old rule: trusted iff they carry a saved id.
      const localOwner = localStorage.getItem(PLAN_OWNER_KEY);
      const localForeign =
        active != null &&
        (localOwner != null ? localOwner !== (user?.email ?? "") : localId == null);

      if (active && (activeTs >= localTs || localForeign)) {
        // Cloud scenario is at least as fresh (newer work from another device, a
        // first sign-in here, or no local copy) → adopt it and mirror to this device.
        const working = { ...DEFAULT_PLAN, ...active.data };
        // A blank "from scratch" scenario has no usable plan yet → keep base on a valid
        // DEFAULT_PLAN (so the projection memos don't choke on unset figures) and show
        // Get-started; the real plan replaces it when the user builds.
        const built = planIsBuilt(working);
        const workBase = built ? working : DEFAULT_PLAN;
        splitInto(workBase);
        setBaseline(workBase);
        setBaselineName(built ? active.name : null);
        setActiveName(active.name);
        setSavedId(active.id);
        persistSavedId(active.id);
        setConfigured(built);
        if (built) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(working));
          localStorage.setItem(WORKING_TS_KEY, String(activeTs));
          localStorage.setItem(PLAN_OWNER_KEY, user?.email ?? "");
          localStorage.setItem(BASELINE_KEY, JSON.stringify(working));
          localStorage.setItem(BASELINE_NAME_KEY, active.name);
          // Tell the user their saved scenario loaded — whether the local copy was
          // just older, or was foreign work (built signed-out) we declined to keep.
          if (raw && (localTs < activeTs || localForeign)) setNotice(`Loaded “${active.name}” from your account.`);
        } else {
          [STORAGE_KEY, WORKING_TS_KEY, BASELINE_KEY, BASELINE_NAME_KEY].forEach((k) => localStorage.removeItem(k));
        }
      } else if (raw) {
        // Local copy is fresher (edits made since the last cloud write) → keep it.
        // The data belongs to whatever scenario last saved it (SAVED_ID_KEY), so the
        // id travels WITH the data — not from `active`, which can drift on another
        // device. If the server pointer drifted, reconcile it so auto-save writes and
        // the active pointer target the same scenario.
        const working = { ...DEFAULT_PLAN, ...JSON.parse(raw) };
        const built = planIsBuilt(working); // defensive — blank plans are never persisted here
        const rawBase = localStorage.getItem(BASELINE_KEY);
        splitInto(built ? working : DEFAULT_PLAN);
        setBaseline(built ? (rawBase ? { ...DEFAULT_PLAN, ...JSON.parse(rawBase) } : working) : DEFAULT_PLAN);
        const nm = localId
          ? savedPlans.find((sp) => sp.id === localId)?.name ?? active?.name ?? null
          : null;
        setSavedId(localId);
        setActiveName(nm);
        setBaselineName(built ? localStorage.getItem(BASELINE_NAME_KEY) || nm : null);
        setConfigured(built);
        if (localId && active && active.id !== localId) void setActivePlan(localId);
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

  // Keep a ref to the latest storable plan for the visibility-flush handler below.
  const storableRef = useRef(storable);
  storableRef.current = storable;
  // Latest active-scenario id + name, so the debounced / tab-hide auto-save writes
  // to the right plan even when they fire after these values changed (stale-closure
  // safe). savedId can be null right after signup — the first save creates the plan.
  const savedIdRef = useRef(savedId);
  savedIdRef.current = savedId;
  const activeNameRef = useRef(activeName);
  activeNameRef.current = activeName;

  // Write the working scenario to the user's active named scenario (in place). When
  // there's no active scenario yet (a just-signed-up guest), create "My First
  // Scenario" from this work and adopt its id. Signed-out users never reach here.
  const autoSaveActive = async (data: RetirementPlan) => {
    if (!user) return;
    const id = savedIdRef.current;
    if (id) {
      // Background autosave: don't revalidate the page — doing so re-sends fresh
      // server props, busting memos and re-arming this autosave (an endless loop).
      void updatePlan(id, activeNameRef.current || "My First Scenario", data, false);
      return;
    }
    const res = await getOrCreateActiveScenario(data);
    if (res.id) {
      setSavedId(res.id);
      persistSavedId(res.id);
      if (!activeNameRef.current) setActiveName("My First Scenario");
      router.refresh(); // bring the just-created plan into savedPlans (switcher / share / report)
    }
  };

  // Persist the working scenario locally on every change (in its storable form, so
  // the strategy layer survives a reload / hop to the other page). Skips the
  // pre-ready mount, the empty Get-started state, and the read-only share view.
  useEffect(() => {
    if (!ready || !configured || shared) return;
    persistWorking(storable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storable, ready, configured, shared]);

  // Debounced cloud auto-save of the working scenario (signed-in users) to their
  // active named scenario, so every edit is backed up server-side and follows them
  // to other devices / survives cleared browser storage.
  useEffect(() => {
    // `shared` = viewing someone else's scenario (a /scenario or /s link): it's a
    // read-only preview, so it must NEVER write to the viewer's own active scenario.
    if (!ready || !user || !configured || shared) return;
    const t = setTimeout(() => {
      void autoSaveActive(storable);
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storable, ready, user, configured, shared]);

  // Best-effort flush when the tab is hidden, to catch edits made within the
  // debounce window (localStorage already holds them for this device). Never in the
  // shared preview — that would overwrite the viewer's own scenario.
  useEffect(() => {
    if (!user || shared) return;
    const flush = () => {
      if (document.visibilityState === "hidden" && configured) void autoSaveActive(storableRef.current);
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, configured, shared]);

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
    // Server-side anonymous-visitor funnel (persisted, admin-visible). No-op for
    // signed-in users; fires once per mount for a signed-out visit.
    if (!user) void trackVisit({ event: "visit", webdriver: navigator.webdriver === true });
  }, [ready, configured, user]);

  // Record when a signed-out visitor has entered a super balance (a key funnel
  // step), once, with the value. Watches the plan so it also fires if they set it
  // mid-session via the guide/wizard rather than arriving already-configured.
  const superTracked = useRef(false);
  useEffect(() => {
    if (!ready || user || superTracked.current || !configured) return;
    const totalSuper = plan.people.reduce(
      (s, p) => s + (Number.isFinite(p.superBalance) ? p.superBalance : 0),
      0,
    );
    if (totalSuper > 0) {
      superTracked.current = true;
      void trackVisit({ event: "super", value: totalSuper, webdriver: navigator.webdriver === true });
    }
  }, [ready, user, configured, plan]);

  const result = useMemo(() => simulate(plan, config), [plan, config]);
  // The active scenario's strategy layer, for the chips (all baked into the numbers).
  const applied = useMemo(() => appliedStrategies(storable, config), [storable, config]);
  // Committed life events on this plan — surfaced as chips too, so a known event
  // (an inheritance, a big trip) is discoverable from the dashboard, editable in
  // What-If. Sorted by age so they read as a mini-timeline.
  const lifeEvents = useMemo(
    () => [...getLifeEvents(storable)].sort((a, b) => a.atAge - b.atAge),
    [storable],
  );
  // "In this plan" chips for the confidence hero's foot: committed life events +
  // applied strategies, each already baked into the numbers above.
  const planChips = useMemo<PlanChip[]>(
    () => [
      ...lifeEvents.map((e) => ({
        key: e.id,
        kind: (e.kind === "income" ? "income" : "expense") as PlanChip["kind"],
        label:
          (e.label?.trim() || (e.kind === "income" ? "Windfall" : "Expense")) +
          ` ${e.kind === "income" ? "+" : "−"}${fmtCurrency(e.amount)} at ${e.atAge}`,
      })),
      ...applied.map((s) => ({ key: s.id, kind: "strategy" as const, label: s.agePhrase ? `${s.label} ${s.agePhrase}` : s.label })),
      ...(storable.agedCare?.enabled
        ? [{ key: "aged-care", kind: "agedcare" as const, label: `Aged care from ${storable.agedCare.entryAge}` }]
        : []),
    ],
    [lifeEvents, applied, storable],
  );
  // The confidence Monte Carlo (~350ms) and the earliest-retirement solver (~700ms) are
  // the two heaviest computations; running them synchronously here blocked first paint
  // (badly on iOS/Safari). They now run in a Web Worker, computed after paint — the page
  // renders immediately and these fill in when ready (`mc`/`earliest` are null until the
  // first result, then hold the last value while a plan change recomputes). The cheap
  // deterministic goal-seek (~20ms) stays synchronous — lots of UI reads it inline.
  const { mc, earliest } = useHeavyMetrics(plan, config, ready && configured);
  const successPct = mc ? Math.round(mc.successRate * 100) : null;
  const successTone: "accent" | "amber" | "red" =
    !mc ? "amber" : mc.successRate >= 0.85 ? "accent" : mc.successRate >= 0.6 ? "amber" : "red";
  const gs = useMemo(() => whatWillItTake(plan, config), [plan, config]);

  // Prudent max spend: the most you can spend while Monte Carlo success still
  // clears the shared 85% bar (matching the What-If safe spend and the boost
  // modal). Heavier than the deterministic goal-seek, so debounce it and show a
  // pulse; fall back to the central-projection figure until it settles.
  // `mcMaxSpend` is the SAFE tier (85% MC); `failsafeSpend` is the FAILSAFE tier
  // (95% MC — survives a bad run of markets). Both feed the confidence hero's
  // three-tier range and settle together off the interaction path.
  const [mcMaxSpend, setMcMaxSpend] = useState<number | null>(null);
  const [failsafeSpend, setFailsafeSpend] = useState<number | null>(null);
  const [mcMaxPending, setMcMaxPending] = useState(false);
  // Signature of everything the tiers depend on — a cache hit means an identical plan
  // we've already solved (e.g. after a round-trip to What-If), so we can skip the solve.
  const tierKey = useMemo(() => JSON.stringify({ p: plan, c: config }), [plan, config]);
  useEffect(() => {
    if (!ready || !configured) return;
    const cached = tierCache.get(tierKey);
    if (cached) {
      // Reuse the already-computed tiers — no recompute, no "Assessing" flash.
      setMcMaxSpend(cached.safe);
      setFailsafeSpend(cached.failsafe);
      setMcMaxPending(false);
      return;
    }
    setMcMaxPending(true);
    const id = setTimeout(() => {
      const safe = maxSpendForConfidence(plan, config, MC_CONFIDENCE_TARGET, MC_CONFIDENCE_MC, MC_CONFIDENCE_VERIFY);
      // Failsafe = the ERN-style worst-case-proof spend (survives every historical
      // stress era), the SAME figure the Stress-test page shows — not an MC-95% tier —
      // so the hero's Failsafe marker and the Stress page agree. Living spend; the loan
      // is added below (like the other tiers) for the loan-inclusive bar.
      const failsafe = Math.floor(historicalFailsafe(plan, config).spend / 1_000) * 1_000;
      tierCache.set(tierKey, { safe, failsafe });
      persistTierCache();
      setMcMaxSpend(safe);
      setFailsafeSpend(failsafe);
      setMcMaxPending(false);
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tierKey, ready, configured]);
  const maxSpend = mcMaxSpend ?? gs.maxSpend; // prudent once settled, central meanwhile
  // SAFE WITHDRAWAL RATE marker — a FIXED benchmark, computed on STEADY (flat real)
  // spending like the classic 4% rule, so it's a stable property of the portfolio and
  // doesn't wobble as the budget's level or shape (the "spending smile") changes. It's
  // still pension-aware (netSpend nets the Age Pension), so it typically sits above 4%.
  // Keyed on the plan MINUS its spending fields, so adjusting the budget never even
  // recomputes it (and never moves the arrow).
  const flatKey = useMemo(() => {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const { targetSpending, spendingStages, spendingMode, budget, guardrails, ...rest } = plan;
    /* eslint-enable @typescript-eslint/no-unused-vars */
    return JSON.stringify(rest);
  }, [plan]);
  // Two safe rates on the same portfolio: the STEADY one (fixed spending — the
  // classic "safe withdrawal rate") and the FLEXIBLE one (Guyton-Klinger guardrails,
  // which lets you START higher because it trims in downturns). Guardrails is
  // stripped/forced explicitly, so both are independent of whatever the loaded plan
  // carries — the steady marker never drifts, and the flexible marker shows the uplift.
  const [safeRate, setSafeRate] = useState<number | null>(null);
  const [flexSafeRate, setFlexSafeRate] = useState<number | null>(null);
  const [safeRatePending, setSafeRatePending] = useState(false);
  useEffect(() => {
    if (!ready || !configured) return;
    setSafeRatePending(true);
    const id = setTimeout(() => {
      const rateFor = (guardrails: RetirementPlan["guardrails"]): number | null => {
        const p: RetirementPlan = { ...plan, spendingMode: "flat", guardrails };
        const ms = maxSpendForConfidence(p, config, MC_CONFIDENCE_TARGET, MC_CONFIDENCE_MC, MC_CONFIDENCE_VERIFY);
        const w = initialWithdrawal(simulate(withSpend(p, ms), config));
        return w ? w.portfolioRate : null;
      };
      setSafeRate(rateFor(undefined)); // steady / fixed spending
      setFlexSafeRate(rateFor({})); // flexible spending (guardrails)
      setSafeRatePending(false);
    }, 400);
    return () => clearTimeout(id);
    // Deliberately keyed on the non-spending plan, so budget tweaks don't recompute it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatKey, config, ready, configured]);
  // Trim vs boost is decided against the SAME prudent (85% MC) bar the spend
  // lever shows, so the card never contradicts itself (e.g. "trim to $X" while a
  // "spend more" button sits below). Over the bar → offer a trim; under it → a boost.
  const prudentDelta = maxSpend != null ? maxSpend - gs.currentSpend : null;
  const overspending = prudentDelta != null && prudentDelta <= -1000;
  const spendHeadroom = prudentDelta != null && prudentDelta >= 1000;
  // The essentials floor (needs — housing, food, health…). When the prudent max is
  // below it, even cutting ALL discretionary can't reach the confidence bar, so a
  // "trim spending" suggestion would be trimming into needs — not a real option.
  const essentials = useMemo(() => essentialsFloor(plan, config).value, [plan, config]);
  const cantTrim = overspending && maxSpend != null && maxSpend < essentials - 100;
  // Spend sits right at the prudent max — neither over nor under. Wait for the MC
  // max to settle so it doesn't flicker to/from the trim/boost states.
  const budgetBalanced = prudentDelta != null && !overspending && !spendHeadroom && !mcMaxPending;

  const tweaked = useMemo(
    // Compare the composed plans without their bookmarks — a freshly-loaded scenario
    // (baseline carries a bookmark; plan doesn't) isn't a "change".
    () => JSON.stringify({ ...plan, whatIf: undefined }) !== JSON.stringify({ ...baseline, whatIf: undefined }),
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
    if (shared) return; // read-only share view — don't touch the viewer's storage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      localStorage.setItem(WORKING_TS_KEY, String(Date.now()));
      // Stamp who owns this working copy, so a signed-in user's saved scenario is
      // never overwritten by work built while signed out (or under another account).
      localStorage.setItem(PLAN_OWNER_KEY, user?.email ?? "");
    } catch {
      /* ignore */
    }
  };

  // Persist the ghost-line baseline (a committed composed plan + its name).
  const persistBaseline = (composed: RetirementPlan, name: string | null) => {
    if (shared) return; // read-only share view — don't touch the viewer's storage
    try {
      localStorage.setItem(BASELINE_KEY, JSON.stringify(composed));
      if (name) localStorage.setItem(BASELINE_NAME_KEY, name);
      else localStorage.removeItem(BASELINE_NAME_KEY);
    } catch {
      /* ignore */
    }
  };

  // Adopting a whole new scenario makes the debounced hero tiers (safe/failsafe)
  // belong to the OLD plan. Null them so the hero falls back to a cache hit or its
  // "Assessing…" skeleton for the new plan — never the previous scenario's stale
  // numbers — until they recompute. Only fires on a full load; slider edits keep
  // their last-good values + shimmer. (The safe-rate marker is spending-independent
  // and keyed on the non-spending plan, so it's left to its own effect to refresh.)
  const resetScenarioDerived = () => {
    setMcMaxSpend(null);
    setFailsafeSpend(null);
  };

  // Commit a whole scenario as the new baseline (load / save / guide). Splits it
  // into base + strategy layer; the working-plan storage is handled by the effect.
  const commit = (next: RetirementPlan, name: string | null = null) => {
    splitInto(next);
    setBaseline(next);
    setBaselineName(name);
    persistBaseline(next, name);
    resetScenarioDerived();
  };

  // Commit an edited BASE (wizard re-entry) while KEEPING the strategy layer, and
  // re-baseline to the resulting composed plan (no ghost line after a full re-entry).
  const commitBase = (nextBase: RetirementPlan) => {
    setBase(nextBase);
    const composed = composeScenario(nextBase, strategies, config);
    setBaseline(composed);
    setBaselineName(null);
    persistBaseline(composed, null);
    resetScenarioDerived();
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

  // Quick-adjust: edit the base inputs only (the strategy layer and the ghost-line
  // baseline are untouched). Strategies win, so a field a strategy overrides won't
  // move here — the lever shows an override badge and points to What-If.
  const quickAdjust = (patch: Partial<RetirementPlan>) =>
    setBase((prev) => ({ ...prev, ...patch }));

  // Apply the "earliest retirement" age to EVERYONE (so a couple both retire at it,
  // matching the both-retire basis the figure is computed on) — person 0 via
  // retirementAge, each partner via their own override.
  const retireEveryoneAt = (age: number) =>
    setBase((prev) => ({
      ...prev,
      retirementAge: age,
      people: prev.people.map((p, i) => (i === 0 ? p : { ...p, retirementAge: age })),
    }));

  const resetToBaseline = () => {
    splitInto(baseline);
  };

  const handleComplete = (next: RetirementPlan) => {
    // The wizard rewrites base inputs; keep any strategy layer on top of them.
    if (configured) commitBase(next);
    else commit(next); // first-run: no strategies yet
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
    if (!user) {
      const goal = update.targetSpending ?? plan.targetSpending;
      void trackVisit({ event: "budget", value: Number.isFinite(goal) ? goal : undefined, webdriver: navigator.webdriver === true });
    }
  };

  const handleLoad = (sp: SavedPlan) => {
    commit({ ...DEFAULT_PLAN, ...sp.data }, sp.name);
    setSavedId(sp.id);
    persistSavedId(sp.id);
    setActiveName(sp.name);
    setConfigured(true);
    setNotice(`Loaded “${sp.name}”.`);
  };

  // Export / import the plan as a JSON file — a portable backup that works with or
  // without an account (the app is local-first). Export serialises the `storable`
  // form (composed plan + any strategy bookmark); import validates and loads it.
  const importInputRef = useRef<HTMLInputElement>(null);
  const exportScenario = () => {
    try {
      const blob = new Blob([JSON.stringify(storable, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe =
        (activeName || "retirement-plan").trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() ||
        "retirement-plan";
      a.href = url;
      a.download = `${safe}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNotice("Plan exported as a JSON file.");
      track("Plan exported");
    } catch {
      setNotice("Couldn’t export the plan — please try again.");
    }
  };
  const applyImported = (data: RetirementPlan, name: string) => {
    const merged: RetirementPlan = { ...DEFAULT_PLAN, ...data };
    if (user) {
      // Import as a NEW named scenario so it never clobbers the current one.
      startTransition(async () => {
        const res = await createScenario(name, merged);
        if (res.error) {
          setNotice(res.error);
          return;
        }
        setSavedId(res.id ?? null);
        persistSavedId(res.id ?? null);
        commit(merged, name);
        setActiveName(name);
        setConfigured(true);
        setNotice(`Imported “${name}” as a new scenario.`);
        track("Plan imported", { signed_in: true });
        router.refresh();
      });
    } else {
      // Guest: load into the working (localStorage) plan.
      commit(merged, name);
      setActiveName(name);
      setConfigured(true);
      setNotice(`Imported “${name}”.`);
      track("Plan imported", { signed_in: false });
    }
  };
  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-importing the same file fires onChange again
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== "object" || !Array.isArray(data.people) || !planIsBuilt(data)) {
        setNotice("That file isn’t a valid RetireWiz plan export.");
        return;
      }
      const stem = file.name.replace(/\.json$/i, "").trim();
      applyImported(data as RetirementPlan, (stem ? `Imported: ${stem}` : "Imported plan").slice(0, 60));
    } catch {
      setNotice("Couldn’t read that file — is it a valid JSON export?");
    }
  };
  const renderIOButtons = () => (
    <>
      <button
        onClick={exportScenario}
        disabled={pending}
        title="Download this plan as a JSON file — a backup, or to move it to another device"
        className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-accent/50 hover:text-white disabled:opacity-60"
      >
        ⬇ Export
      </button>
      <button
        onClick={() => importInputRef.current?.click()}
        disabled={pending}
        title="Load a plan from a JSON file you exported earlier"
        className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-accent/50 hover:text-white disabled:opacity-60"
      >
        ⬆ Import
      </button>
    </>
  );

  // Wipe the guest's local data and return to the fresh first-visit state.
  const startOver = () => {
    if (shared) return; // never wipe the viewer's data from a shared read-only view
    if (!window.confirm("Clear your details and start over? This can't be undone.")) return;
    try {
      [STORAGE_KEY, BASELINE_KEY, BASELINE_NAME_KEY, PLAN_OWNER_KEY, "au-retirement-compare"].forEach((k) =>
        localStorage.removeItem(k),
      );
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(SAVED_ID_KEY);
    } catch {
      /* ignore */
    }
    splitInto(DEFAULT_PLAN);
    setBaseline(DEFAULT_PLAN);
    setBaselineName(null);
    setActiveName(null);
    setSavedId(null);
    setConfigured(false);
    setShowGuide(false);
    setNotice(null);
  };

  // Rename the active scenario in place (blur / Enter on the name field). Only the
  // name changes — data + updated_at are untouched, so it can't shadow local edits.
  const renameActive = () => {
    const name = nameDraft.trim();
    if (!savedId || !name || name === activeName) {
      setNameDraft(activeName ?? "");
      return;
    }
    setActiveName(name);
    startTransition(async () => {
      const res = await renameScenario(savedId, name);
      if (res.error) setNotice(res.error);
      else router.refresh();
    });
  };

  // "New scenario" opens a modal to choose a name and whether to start from a copy of
  // the current scenario or from scratch. `createScenarioFrom` does the work:
  //  - "copy"    → a fresh plan with the CURRENT plan's data, adopted for editing;
  //  - "scratch" → a blank plan → drop to the Get-started build state to fill it in.
  // Either way the new scenario becomes the active (auto-save) one.
  const createScenarioFrom = (name: string, mode: "copy" | "scratch") => {
    setNewScenarioOpen(false);
    const data = mode === "copy" ? storable : BLANK_STARTER;
    startTransition(async () => {
      const res = await createScenario(name, data);
      if (res.error) {
        setNotice(res.error);
        return;
      }
      setSavedId(res.id ?? null);
      persistSavedId(res.id ?? null);
      setActiveName(name);
      if (mode === "copy") {
        commit(storable, name); // re-baseline to the copy (same data, new name)
        setConfigured(true);
        setNotice(`Created “${name}” — you’re now editing it.`);
      } else {
        // Skip the guided walkthrough and Get-started — jump straight into the wizard
        // with blank fields so they enter their details right away. `base` stays a
        // valid DEFAULT_PLAN so the projection memos don't choke on the blank scenario's
        // unset figures; the DB row holds BLANK_STARTER, so an abandon-then-reload
        // resolves to Get-started (planIsBuilt=false). Completing the wizard flips
        // configured→true and auto-saves the real plan into this named scenario.
        splitInto(DEFAULT_PLAN);
        setBaseline(DEFAULT_PLAN);
        setBaselineName(null);
        setConfigured(false);
        try {
          [STORAGE_KEY, WORKING_TS_KEY, BASELINE_KEY, BASELINE_NAME_KEY].forEach((k) => localStorage.removeItem(k));
        } catch {
          /* ignore */
        }
        setShowGuide(false);
        setWizardSeed(null); // null → the wizard opens on BLANK_STARTER (empty fields)
        setWizardOpen(true);
        setNotice(`Created “${name}” — enter your details.`);
      }
      track("Scenario created", { mode });
      router.refresh();
    });
  };

  // Switch the active scenario to another saved plan and load it in.
  const switchScenario = (id: string) => {
    if (id === savedId) return;
    const sp = savedPlans.find((p) => p.id === id);
    if (!sp) return;
    setSwitching(true); // lock the page + spinner until the reload/re-simulate settles
    startTransition(async () => {
      await setActivePlan(id);
      handleLoad(sp);
      router.refresh();
    });
  };

  const handleDelete = (sp: SavedPlan) => {
    if (!window.confirm(`Delete “${sp.name}”? This can’t be undone.`)) return;
    startTransition(async () => {
      const res = await deletePlan(sp.id);
      if (res.error) {
        setNotice(res.error);
        return;
      }
      const next = res.id ? savedPlans.find((p) => p.id === res.id) : undefined;
      if (next) {
        handleLoad(next); // fell back to another scenario → open it
      } else if (sp.id === savedId) {
        // Deleted the last scenario → clean slate (Get-started).
        try {
          [STORAGE_KEY, BASELINE_KEY, BASELINE_NAME_KEY, SAVED_ID_KEY].forEach((k) => localStorage.removeItem(k));
        } catch {
          /* ignore */
        }
        splitInto(DEFAULT_PLAN);
        setBaseline(DEFAULT_PLAN);
        setBaselineName(null);
        setActiveName(null);
        setSavedId(null);
        setConfigured(false);
      }
      setNotice(`Deleted “${sp.name}”.`);
      router.refresh();
    });
  };

  // The active scenario's saved row (for Run report / Share / Delete / What-if). Null
  // for a just-created one until router.refresh brings it into savedPlans.
  const activePlan = savedId ? (savedPlans.find((sp) => sp.id === savedId) ?? null) : null;

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

  // A dashboard lever is "overridden" when a What-If strategy sets its field, so the
  // composed value differs from the base input. Strategies win, so we lock the lever
  // and point to What-If (retirement age ↔ Retire-later; spend ↔ Adjust spending).
  const baseSpend = base.spendingMode === "stages" ? base.spendingStages.goGo : base.targetSpending;
  const composedSpend = isStaged ? stages.goGo : plan.targetSpending;
  const retireOverridden = plan.retirementAge !== base.retirementAge;
  const spendOverridden = composedSpend !== baseSpend;
  const lockNote = (label: string) => (
    <>
      Set by the <span className="font-semibold">{label}</span> strategy —{" "}
      <a href={whatIfHref} className="underline hover:text-amber-200">change it in What-If →</a>
    </>
  );

  // True income need = living costs + any ongoing home-loan cost (see lib/au/goal).
  const goal = retirementGoal(plan);

  // ── Confidence hero: three loan-inclusive spend tiers vs the goal ───────────
  // central (50%, deterministic) ≥ safe (85% MC) ≥ failsafe (95% MC). The solvers
  // return LIVING spend, so add the ongoing home loan to compare with the goal;
  // clamp so the tiers stay monotone even if Monte Carlo noise crosses them. The
  // heavy tiers fall back to the cheaper ones until they settle (see `mcMaxPending`).
  const confLoan = goal.loanCost;
  const centralLiving = gs.maxSpend ?? gs.currentSpend;
  const centralTotal = centralLiving + confLoan;
  // Prefer live state, then the cache (so a remount onto an already-solved plan shows
  // the real tiers on the FIRST paint — the effect that sets state runs after paint).
  const cachedTiers = tierCache.get(tierKey);
  const safeLiving = mcMaxSpend ?? cachedTiers?.safe ?? null;
  const failsafeLiving = failsafeSpend ?? cachedTiers?.failsafe ?? null;
  const safeTotal = Math.min((safeLiving ?? centralLiving) + confLoan, centralTotal);
  const failsafeTotal = Math.min((failsafeLiving ?? safeLiving ?? centralLiving) + confLoan, safeTotal);
  // Apply the safe tier as the new spend (its LIVING part; the engine layers the
  // loan on itself). Edits the base inputs, like the other quick-adjust levers.
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

  // Bands live on the OLDEST-person age axis: the go-go phase starts at household
  // retirement (first to retire), and no-go runs to the axis end (the younger
  // partner's life expectancy). The slow/no-go boundaries are already oldest-age
  // (spendingForAge keys off the oldest's age).
  const bandRetireStart = oldestCurrentAge(plan) + householdRetirementOffset(plan);
  const bandAxisEnd = oldestCurrentAge(plan) + householdHorizon(plan);
  const stageBands = isStaged
    ? [
        { x1: bandRetireStart, x2: stages.slowGoAge, label: "Go-go Years", fill: "#34d399" },
        { x1: stages.slowGoAge, x2: stages.noGoAge, label: "Slow-go Years", fill: "#f59e0b" },
        { x1: stages.noGoAge, x2: bandAxisEnd, label: "No-go Years", fill: "#a78bfa" },
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
      {/* Scenario-switch lock: reloading + re-simulating a plan takes a few seconds. */}
      {switching && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/70 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-panel px-7 py-6 shadow-2xl">
            <svg className="h-8 w-8 animate-spin text-accent" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
            </svg>
            <span className="text-sm font-medium text-slate-200">Loading scenario…</span>
          </div>
        </div>
      )}
      {/* Top bar: brand left, auth right */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Logo />
        <div className="flex items-center gap-3">
        <Link
          href="/learn"
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-slate-200 transition hover:text-white"
          title="Plain-English explainers for the concepts behind the planner"
        >
          <span aria-hidden>📚</span>
          <span className="hidden sm:inline">Learn the concepts</span>
          <span className="sm:hidden">Learn</span>
        </Link>
        {country && (
          <span className="flex items-center" title="Your location">
            <CountryFlag code={country} showCode={false} />
          </span>
        )}
        {user ? (
          <>
            {user.isAdmin && userStats && (
              <Link
                href="/admin/users"
                title="Total users · signed up in the last 7 days"
                className="flex items-center gap-1.5 rounded-full border border-line bg-panel-2 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-accent/50 hover:text-white"
              >
                <span aria-hidden>👥</span>
                <span className="tabular-nums text-white">{userStats.total.toLocaleString()}</span>
                <span className="text-muted">users</span>
                {userStats.last7Days > 0 && (
                  <span className="tabular-nums text-emerald-400">+{userStats.last7Days} · 7d</span>
                )}
              </Link>
            )}
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
            <Link
              href="/account"
              className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-slate-200 transition hover:text-white"
              title="Account settings"
            >
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-line" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-panel-2 text-xs font-semibold text-slate-300 ring-1 ring-line">
                  {(user.name ?? user.email).charAt(0).toUpperCase()}
                </span>
              )}
              <span className="max-w-[12rem] truncate">{user.name ?? user.email}</span>
            </Link>
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

      {/* The intro title/subtext only frames the tool before there's a plan. Once
          a scenario is built, the confidence hero is the headline — the generic
          title (and the redundant "Edit scenario" ring, replaced by "Refine
          scenario" on the stat card) just pushed the answer down the page. */}
      {!configured && (
        <header className="mb-2">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            Will your super and the Age Pension last?
          </h1>
          <p className="mt-2 max-w-2xl text-muted">
            Models superannuation, the means-tested Age Pension, and an
            early-retirement bridge — all in today&apos;s dollars, FY{config.financialYear} rules.
          </p>
        </header>
      )}

      {/* Public share-link view: make it clear this is someone else's scenario,
          it's read-only (tweaks explore but aren't saved), and offer a way in. */}
      {shared && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/5 px-5 py-3">
          <p className="text-sm text-slate-200">
            <span aria-hidden>🔗</span> You&apos;re viewing a{" "}
            <strong className="text-white">shared scenario{sharedPlan ? ` — “${sharedPlan.name}”` : ""}</strong>.
            Explore it freely; any changes you make here are just a preview and aren&apos;t saved.
          </p>
          <Link
            href="/"
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-soft"
          >
            Build your own →
          </Link>
        </div>
      )}

      {/* The signed-out "saved on this device" nudge now lives inside the
          confidence hero's right column (below the dial), where a signed-out user
          has no scenario block — reclaiming this card's space. */}

      <div className="mt-4" />
      <Disclosures config={config} />
      <div className="mb-6" />

      {/* Status confirmations (loaded / saved / applied) — shown to everyone. */}
      {notice && <p className="mb-4 text-xs text-accent">{notice}</p>}

      {/* Scenario bar — signed-in users only, shown ONLY in the pre-build empty
          state so you can switch/create before there's a plan. Once configured, the
          confidence hero owns the active-scenario identity and its ⚙ Manage modal
          holds these controls (they're folded away to reclaim the space). */}
      {user && !configured && savedPlans.length > 0 && (
      <div className="mb-6 rounded-2xl border border-line bg-panel px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Editing</span>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={renameActive}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setNameDraft(activeName ?? "");
                  e.currentTarget.blur();
                }
              }}
              disabled={!savedId}
              aria-label="Scenario name"
              placeholder={savedId ? "Name this scenario" : "Working scenario"}
              className="min-w-[9rem] max-w-[18rem] rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-white outline-none hover:border-line focus:border-accent focus:bg-panel-2 disabled:cursor-default disabled:hover:border-transparent"
            />
            <span className="text-[11px] text-muted" title="Every change is saved to this scenario automatically">
              · saved automatically
            </span>
          </div>
          {savedPlans.length > 1 && (
            <label className="flex items-center gap-1.5 text-xs text-muted">
              Switch to
              <select
                value={savedId ?? ""}
                onChange={(e) => switchScenario(e.target.value)}
                aria-label="Switch scenario"
                disabled={pending}
                className="max-w-[15rem] rounded-lg border border-line bg-panel-2 px-2 py-1 text-sm text-white outline-none focus:border-accent disabled:opacity-60"
              >
                {savedId == null && <option value="">Working scenario</option>}
                {savedPlans.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            onClick={() => setNewScenarioOpen(true)}
            disabled={pending}
            title="Create a new scenario — from a copy of this one or from scratch"
            className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm font-semibold text-accent transition hover:bg-accent/20 disabled:opacity-50"
          >
            ＋ New scenario
          </button>
        </div>

        {/* Your private notes for this scenario (if any) — click "Notes" to edit. */}
        {(() => {
          const notes = ((activePlan && (notesOverride[activePlan.id] ?? activePlan.notes)) || "").trim();
          if (!notes) return null;
          return (
            <button
              onClick={() => setNotesOpen(true)}
              title="Edit your notes for this scenario"
              className="mt-1.5 flex max-w-3xl items-start gap-1.5 text-left text-xs leading-snug text-muted transition hover:text-slate-300"
            >
              <span aria-hidden className="shrink-0">📝</span>
              <span className="line-clamp-2 whitespace-pre-line">{notes}</span>
            </button>
          );
        })()}

        {/* Actions on the active scenario. */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {activePlan ? (
            <>
              <Link
                href={`/report/${activePlan.id}`}
                target="_blank"
                title={`Open a printable PDF report for ${activePlan.name}`}
                className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-accent/50 hover:text-white"
              >
                ↗ Run report
              </Link>
              <ShareControl key={activePlan.id} id={activePlan.id} initialToken={activePlan.share_token} onNotice={setNotice} />
              <Link
                href="/compare"
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-accent/50 hover:text-white"
              >
                ⚖ Compare
                <span aria-hidden>→</span>
              </Link>
              <button
                onClick={() => setNotesOpen(true)}
                title="A summary of this scenario + your own notes"
                className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-accent/50 hover:text-white"
              >
                📝 Notes
              </button>
              <Link
                href={`/assets/${activePlan.id}`}
                title={`Financial summary for ${activePlan.name}`}
                className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-accent/50 hover:text-white"
              >
                🏦 Financial summary
              </Link>
              {renderIOButtons()}
              <button
                onClick={() => handleDelete(activePlan)}
                aria-label={`Delete ${activePlan.name}`}
                disabled={pending}
                className="ml-auto rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm font-medium text-muted transition hover:border-red-400/50 hover:text-red-400 disabled:opacity-60"
              >
                ✕ Delete
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">Saving your scenario…</span>
              {renderIOButtons()}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Export/import is offered to everyone (the app is local-first). Signed-in
          users get the buttons in the ⚙ Manage modal; guests get them inside the
          confidence hero (below the create-account nudge — see `ioSlot`). */}
      <input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={onImportFile} />

      {/* The projection only renders once the user has actually built a plan.
          Before that we show the Get-started panel — never fabricated numbers. */}
      {configured ? (
        <>
      {/* Confidence hero — the page's headline answer: can you afford your goal,
          and how much could you safely spend? Folds in the active-scenario identity
          (name + Manage → modal below). */}
      <ConfidenceHero
        goalTotal={goal.total}
        loan={confLoan}
        central={centralTotal}
        safe={safeTotal}
        failsafe={failsafeTotal}
        confidencePct={successPct ?? 0}
        confidenceLoading={successPct == null}
        assumedReturnPct={plan.investmentReturn}
        lifeExpectancy={plan.lifeExpectancy}
        lastsToLE={result.lastsToLifeExpectancy}
        depletedAge={result.depletedAge}
        pending={mcMaxPending}
        loading={successPct == null || safeLiving == null || failsafeLiving == null}
        whatIfHref={whatIfHref}
        stressHref={stressHref}
        scenarioName={shared ? null : activeName}
        hasNotes={!!(((activePlan && (notesOverride[activePlan.id] ?? activePlan.notes)) || "") as string).trim()}
        onManage={user && !shared ? () => setScenarioModalOpen(true) : null}
        dialExplainer={<MoneyLastsExplainer plan={plan} config={config} result={result} />}
        showSignupNudge={!user && !shared && !nudgeDismissed}
        onDismissNudge={dismissNudge}
        ioSlot={!user && !shared ? renderIOButtons() : null}
        chips={planChips}
        showInfoBlasts={!shared}
        buildOwnHref={shared ? "/" : null}
        agePension={
          plan.taxResidency !== "non-resident" || plan.claimAgePensionAbroad
            ? { annual: config.agePension[plan.people.length > 1 ? "couple" : "single"].maxAnnual, household: plan.people.length > 1 ? "couple" : "single" }
            : null
        }
      />

      {/* Stat cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Super at retirement"
          value={fmtCurrency(result.superAtRetirement)}
          sub={`at age ${result.retirementAge} · today's dollars`}
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
        {/* "Money lasts" was folded into the confidence hero's dial (which shows the
            same survival likelihood); its explainer moved there too. This slot now
            shows the withdrawal rate, with the full detail in its explainer modal. */}
        {(() => {
          const wr = initialWithdrawal(result);
          const band = wr ? withdrawalBand(wr.portfolioRate) : null;
          // The draw is measured across the WHOLE portfolio (super + any outside-super
          // savings), and against the NET spend (goal less Age Pension / rent / work) —
          // so label both, to distinguish it from the super-only + headline-goal cards.
          const hasSavings = wr ? wr.portfolio - wr.balance > 1 : false;
          const hasOffset = wr ? wr.agePension + wr.rent + wr.workIncome > 1 : false;
          const safePct = safeRate != null ? +(safeRate * 100).toFixed(1) : null;
          const showFlex = flexSafeRate != null && safeRate != null && flexSafeRate > safeRate + 0.002;
          const flexPct = showFlex ? +(flexSafeRate! * 100).toFixed(1) : null;
          return (
            <StatCard
              label="Withdrawal rate"
              value={wr ? `${(+(wr.portfolioRate * 100).toFixed(1))}%` : "—"}
              tag={band?.label}
              tagTone={band?.tone}
              tagTitle="How sustainable is this draw? Tap the ⓘ for the full breakdown"
              sub={
                wr ? (
                  <>
                    {fmtCurrency(wr.netSpend)}
                    {hasOffset ? ` of your ${fmtCurrency(goal.total)} goal` : ""} drawn from{" "}
                    {fmtCurrency(wr.portfolio)} {hasSavings ? "super + savings" : "super"} at age {wr.age}
                    {safePct != null && (
                      <span className="mt-0.5 block text-sky-300">
                        Prudent rate ~{safePct}%{safeRatePending ? " …" : ""}
                        {flexPct != null ? ` · flexible ~${flexPct}%` : ""}
                      </span>
                    )}
                  </>
                ) : (
                  "in your first drawdown year"
                )
              }
              explainer={
                <WithdrawalRateStatExplainer
                  result={result}
                  plan={plan}
                  successPct={successPct ?? 0}
                  safeRate={safeRate}
                  flexSafeRate={flexSafeRate}
                  safePending={safeRatePending}
                />
              }
            />
          );
        })()}
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

      {/* The What-If and Stress-test promo cards were removed: the confidence hero
          already carries "Boost it →" (What-If) and "Pressure-test it →" (Stress),
          and the "In this plan" chips now sit at the bottom of the hero card. */}

      {/* The withdrawal-rate diagnostic card was folded into the "Withdrawal rate"
          stat card above; its full detail now lives in that card's explainer modal. */}

      {/* Assets chart */}
      <div className="rounded-2xl border border-line bg-panel p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-white">
            {balanceView === "networth" ? "Net worth (incl. your home)" : "Balance over time"}{" "}
            <span className="text-sm font-normal text-muted">(today&apos;s dollars)</span>
          </h2>
          <div className="flex gap-1 rounded-lg border border-line bg-panel-2 p-1 text-xs">
            {([
              ["balance", "Balance"],
              ["networth", "Net worth"],
            ] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setBalanceView(v)}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  balanceView === v ? "bg-accent text-ink" : "text-muted hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-4">
          {result.rows.some((r) => (r.breakdown?.accumSuper ?? 0) > 1) ? (
            <>
              <LegendDot color="#34d399" label="Super — pension" />
              <LegendDot color="#eab308" label="Super — accumulation" />
            </>
          ) : (
            <LegendDot color="#34d399" label="Super" />
          )}
          <LegendDot color="#38bdf8" label="Outside super" />
          {balanceView === "networth" && <LegendDot color="#64748b" label="Home equity" />}
          {balanceView === "networth" && hasInvestmentProperty(plan) && (
            <LegendDot color="#fb923c" label="Investment property" />
          )}
          {tweaked && <LegendDot color="#94a3b8" label={baselineLabel} />}
        </div>
        <RetirementChart
          result={result}
          bands={stageBands}
          showHome={balanceView === "networth"}
          baseline={baselineResult}
          baselineLabel={baselineLabel}
          onSelectYear={(age) => {
            track("Year breakdown opened", { chart: "balance" });
            setSelectedAge(age);
          }}
          selectedAge={selectedAge}
          wageInflationPct={plan.inflation + (config.livingStandardsGrowthPct ?? 0)}
          cpiPct={plan.inflation}
          ages={ageGapInfo(plan)}
          lifeEvents={lifeEvents}
          agedCare={plan.agedCare?.enabled ? { entryAge: plan.agedCare.entryAge, durationYears: plan.agedCare.durationYears } : null}
          plan={plan}
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
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <div>
              <Field
                label="Retirement age"
                value={plan.retirementAge}
                onChange={(v) => quickAdjust({ retirementAge: v })}
                min={40}
                max={75}
                suffix="yrs"
                locked={retireOverridden}
                lockNote={lockNote("Retire later")}
              />
              {!retireOverridden && earliest?.age != null && earliest.age < plan.retirementAge && (
                <button
                  onClick={() => retireEveryoneAt(earliest.age!)}
                  className="mt-1.5 text-xs font-medium text-accent transition hover:underline"
                >
                  ⌁ {isCouple ? "both retire" : "retire"} as early as {earliest.age} at {earliest.targetPct}% →
                </button>
              )}
            </div>
            <Field
              label={isStaged ? "Go-go spend" : "Spend/yr"}
              value={isStaged ? stages.goGo : plan.targetSpending}
              onChange={(v) =>
                isStaged
                  ? quickAdjust({
                      spendingStages: { ...base.spendingStages, goGo: v },
                    })
                  : quickAdjust({ targetSpending: v })
              }
              min={20_000}
              max={200_000}
              step={1000}
              prefix="$"
              locked={spendOverridden}
              lockNote={lockNote("Adjust discretionary spending")}
            />
            {(() => {
              const feePct = plan.fees?.adminInvestmentPct ?? config.fees.adminInvestmentPct;
              // When the outside pool is split out, this is the super-only return
              // (the outside return lives in its own row below); otherwise it's the
              // single all-money return.
              const enabled = plan.outsideReturn != null || plan.outsideVolatility != null;
              return (
                <Field
                  label={enabled ? "Super return" : "Investment return"}
                  value={plan.investmentReturn}
                  onChange={(v) => quickAdjust({ investmentReturn: v })}
                  min={1}
                  max={12}
                  step={0.1}
                  suffix="%"
                  hint={`Before fees — funds usually quote returns after fees. We deduct the ${feePct}% fee separately (≈ ${+(plan.investmentReturn - feePct).toFixed(2)}% after).`}
                />
              );
            })()}
            <Field
              label="Plan to age"
              value={plan.lifeExpectancy}
              onChange={(v) => quickAdjust({ lifeExpectancy: v })}
              min={75}
              max={105}
              suffix="yrs"
            />
          </div>
          {(() => {
            const enabled = plan.outsideReturn != null || plan.outsideVolatility != null;
            return enabled ? (
              <div className="mt-5 flex flex-col gap-x-8 gap-y-2 border-t border-line pt-4 sm:flex-row sm:items-center">
                <div className="sm:w-72">
                  <Field
                    label="Outside-super return"
                    value={plan.outsideReturn ?? plan.investmentReturn}
                    onChange={(v) => quickAdjust({ outsideReturn: v })}
                    min={0}
                    max={12}
                    step={0.1}
                    suffix="%"
                    hint="Money outside super — no super fee. Dividends are taxed each year at your marginal rate; capital growth is taxed only when sold (with the 50% CGT discount)."
                  />
                </div>
                <button
                  onClick={() => quickAdjust({ outsideReturn: undefined, outsideVolatility: undefined })}
                  className="self-start text-xs font-medium text-muted transition hover:text-white sm:self-center"
                >
                  ← Grow it at the same return as super
                </button>
              </div>
            ) : (
              <button
                onClick={() => quickAdjust({ outsideReturn: plan.investmentReturn, outsideVolatility: plan.returnVolatility })}
                className="mt-4 text-xs font-medium text-accent transition hover:underline"
              >
                + Hold outside super at a different return? (e.g. cash)
              </button>
            );
          })()}
        </div>
      </div>

      {/* Income sources */}
      <div className="mt-4 rounded-2xl border border-line bg-panel p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-white">Income sources</h2>
          <div className="flex flex-wrap items-center gap-4">
            <LegendDot color="#facc15" label="Take-home pay" />
            {plan.workIncome && <LegendDot color="#f472b6" label="Part-time work" />}
            {result.rows.some((r) => (r.incomeStream ?? 0) > 0) && (
              <LegendDot color="#2dd4bf" label={streamNamesLabel((plan.incomeStreams ?? []).filter((s) => s.perYear > 0).map((s) => s.label ?? ""), "Pension / annuity")} />
            )}
            <LegendDot color="#a78bfa" label="Age Pension" />
            {/* Split the super legend only when accumulation is actually DRAWN as
                income — an accumulation balance that's never tapped adds a legend
                entry with no matching band. */}
            {result.rows.some((r) => (r.breakdown?.accumDrawn ?? 0) > 1) ? (
              <>
                <LegendDot color="#34d399" label="Super — pension" />
                <LegendDot color="#eab308" label="Super — accumulation" />
              </>
            ) : (
              <LegendDot color="#34d399" label="Super" />
            )}
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
          ages={ageGapInfo(plan)}
        />
        <p className="mt-2 text-center text-xs text-muted">
          Dotted lines mark where super&apos;s <strong>minimum drawdown</strong> rate steps up (5% → 6% → 7%…) — the law
          makes you draw a bigger slice of super at those ages, which can shift the super-vs-savings mix and cause the
          steps you see. Click any year for the full breakdown.
        </p>

        {/* Tax analysis */}
        <div className="mt-6 border-t border-line pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">
              Tax analysis <span className="font-normal text-muted">— what you pay each year</span>
            </h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <LegendDot color="#e2e8f0" label="Total tax" />
              <LegendDot color="#fbbf24" label="Income tax" />
              <LegendDot color="#f472b6" label="Medicare" />
              <LegendDot color="#34d399" label="Super contributions" />
              <LegendDot color="#a78bfa" label="Super earnings" />
              <LegendDot color="#38bdf8" label="Capital gains" />
            </div>
          </div>
          <TaxChart
            result={result}
            onSelectYear={(age) => {
              track("Year breakdown opened", { chart: "tax" });
              setTaxAge(age);
            }}
            ages={ageGapInfo(plan)}
          />
          <p className="mt-2 text-center text-xs text-muted">
            Every tax the projection charges, by type. Super pension drawdowns and the Age Pension are tax-free, so tax
            usually falls sharply at retirement. Income tax is after the low-income (LITO) and seniors (SAPTO) offsets.
            Click any year for the full breakdown.
          </p>
        </div>
      </div>

      {/* Estate — super death-benefit tax at the planning age */}
      <DeathBenefitCard
        plan={plan}
        result={result}
        config={config}
        whatIfHref={whatIfHref}
        onBeneficiaryChange={(who) => quickAdjust({ superBeneficiary: who })}
      />

      {/* Likelihood (Monte Carlo) */}
      <div
        id="likelihood"
        className="mt-4 scroll-mt-6 rounded-2xl border border-line bg-panel p-6"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <MonteCarloMark className="h-7 w-auto shrink-0" />
              <span className="text-[13px] font-bold uppercase tracking-[0.22em] text-slate-300">
                Monte Carlo
              </span>
            </div>
            <h2 className="flex items-center gap-2 font-semibold text-white">
              How likely is this plan to work?
              {mc && <LikelihoodExplainer plan={plan} mc={mc} />}
            </h2>
            <button
              onClick={() => setShowReturnSeries(true)}
              className="mt-1.5 text-xs font-medium text-accent underline-offset-2 hover:underline"
            >
              ↗ See the return sequences behind this
            </button>
          </div>
          <div className="flex gap-4">
            <LegendDot color="#34d399" label="Median" />
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <span className="inline-block h-2.5 w-4 rounded-sm bg-emerald-500/25" />
              10th–90th %
            </span>
          </div>
        </div>
        <ReturnSeriesModal
          open={showReturnSeries}
          onClose={() => setShowReturnSeries(false)}
          plan={plan}
          config={config}
        />

        {!mc ? (
          <div className="mt-3 flex items-center gap-2.5 text-slate-300" aria-busy="true">
            <svg className="h-5 w-5 animate-spin text-accent" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
            </svg>
            <span className="text-sm">Running thousands of market scenarios…</span>
          </div>
        ) : (() => {
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
              {(() => {
                const e = earliest;
                if (!e) return null;
                if (e.age == null) {
                  return (
                    <p className="mt-2.5 text-sm text-amber-300">
                      ⌁ Even retiring at 75 wouldn&apos;t clear {e.targetPct}% at this spend — see{" "}
                      <a href="#what-will-it-take" className="underline underline-offset-2 hover:text-amber-200">
                        what will it take
                      </a>
                      .
                    </p>
                  );
                }
                const SetAge = () => (
                  <button
                    onClick={() => retireEveryoneAt(e.age!)}
                    className="font-bold text-accent underline-offset-2 hover:underline"
                  >
                    {e.age}
                  </button>
                );
                const both = isCouple ? "both " : "";
                return (
                  <p className="mt-2.5 text-sm text-slate-200">
                    <span aria-hidden className="mr-1 text-accent">⌁</span>
                    {e.age < e.currentRetireAge ? (
                      <>You could {both}retire as early as <SetAge /> and still clear {e.targetPct}% — you&apos;re planning {e.currentRetireAge}.</>
                    ) : e.age === e.currentRetireAge ? (
                      <>Age {e.age} is about the earliest you can {both}retire and still clear {e.targetPct}%.</>
                    ) : (
                      <>To clear {e.targetPct}% you&apos;d {both ? "both " : ""}need to retire around{" "}
                        <span className="font-bold text-amber-300">{e.age}</span> — you&apos;re planning {e.currentRetireAge}.</>
                    )}
                  </p>
                );
              })()}
              {mc.worstCaseDepletionAge !== null && mc.medianDepletionAge !== null && (
                <p className="mt-2 text-xs text-muted">
                  When your money does run short, it&apos;s typically around age{" "}
                  {mc.medianDepletionAge}
                  {mc.worstCaseDepletionAge < mc.medianDepletionAge &&
                    ` — and as early as age ${mc.worstCaseDepletionAge} in the worst 10% of outcomes`}
                  .
                </p>
              )}

              {(() => {
                const ahead = Math.round(mc.aheadRate * 100);
                const behind = 100 - ahead;
                return (
                  <div className="mt-3 rounded-xl border border-line bg-panel-2/50 p-3">
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs">
                      <span className="font-medium text-slate-300">
                        How you finish vs your central projection
                      </span>
                      <span className="text-muted">
                        projected ~{fmtCurrency(mc.centralTerminalBalance)} left at {plan.lifeExpectancy}
                      </span>
                    </div>
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-line">
                      <div className="bg-emerald-500/70" style={{ width: `${ahead}%` }} />
                      <div className="bg-amber-500/60" style={{ width: `${behind}%` }} />
                    </div>
                    <div className="mt-1.5 flex justify-between text-xs">
                      <span className="text-emerald-400">Ahead in {ahead}% of runs</span>
                      <span className="text-amber-400">Behind in {behind}%</span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted">
                      The ups and downs mean the typical run ends near{" "}
                      {fmtCurrency(mc.medianTerminalBalance)}
                      {mc.medianTerminalBalance < mc.centralTerminalBalance
                        ? " — below the smooth-return line, which is why one central number flatters the plan"
                        : ""}
                      .
                    </p>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {mc && (
        <>
        <FanChart
          fan={mc.fan}
          retirementAge={result.retirementAge}
          agePensionAge={result.agePensionAge}
          onSelectAge={setFanAge}
          ages={ageGapInfo(plan)}
        />
        <p className="mt-1 text-center text-xs text-muted">
          Click a year to see the range of possible outcomes — and why they spread.
        </p>

        {(() => {
          const oReturn = plan.outsideReturn ?? plan.investmentReturn;
          const oVol = plan.outsideVolatility ?? plan.returnVolatility;
          // Show the outside-super slider once opted in (present), so it's editable
          // straight away; only switch the caption to the split format once the
          // values genuinely differ, to keep it clean when they still match.
          const enabled = plan.outsideReturn != null || plan.outsideVolatility != null;
          const differs = oReturn !== plan.investmentReturn || oVol !== plan.returnVolatility;
          return (
            <>
              <div className="mt-3 space-y-3 border-t border-line pt-3 sm:max-w-sm">
                <Field
                  label={enabled ? "Super volatility" : "Return volatility"}
                  value={plan.returnVolatility}
                  onChange={(v) => quickAdjust({ returnVolatility: v })}
                  min={0}
                  max={20}
                  step={0.5}
                  suffix="%"
                  hint="Higher volatility = wider outcomes and more sequencing risk."
                />
                {enabled && (
                  <Field
                    label="Outside-super volatility"
                    value={oVol}
                    onChange={(v) => quickAdjust({ outsideVolatility: v })}
                    min={0}
                    max={20}
                    step={0.5}
                    suffix="%"
                    hint="Swing on money outside super — set near 0 for cash."
                  />
                )}
              </div>

              <p className="mt-3 text-xs text-muted">
                Based on {mc.iterations.toLocaleString()} randomised runs{" "}
                {differs
                  ? `(avg ${plan.investmentReturn}% super / ${oReturn}% outside, ±${plan.returnVolatility}% / ±${oVol}% a year)`
                  : `(avg ${plan.investmentReturn}% return, ±${plan.returnVolatility}% a year)`}
                . The Age Pension is still a floor, so &lsquo;runs short&rsquo; means
                below your target — not $0 income.
              </p>
            </>
          );
        })()}
        </>
        )}
      </div>
      {/* end likelihood */}

      {/* What will it take? (goal-seek) */}
      <div id="what-will-it-take" className="mt-4 scroll-mt-6 rounded-2xl border border-line bg-panel p-6">
        <h2 className="font-semibold text-white">What will it take?</h2>
        <p className="mb-4 mt-1 text-sm text-slate-300">
          {cantTrim
            ? `Trimming alone can't get ${fmtCurrency(goal.total)}/yr to ${Math.round(MC_CONFIDENCE_TARGET * 100)}% likely to last to age ${plan.lifeExpectancy} — even cutting all discretionary falls short of your essentials. Save more or retire later:`
            : overspending
            ? `To keep ${fmtCurrency(goal.total)}/yr about ${Math.round(MC_CONFIDENCE_TARGET * 100)}% likely to last to age ${plan.lifeExpectancy}, ease any one of these:`
            : gs.lasts
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
                  label={
                    cantTrim
                      ? "Trim spending"
                      : budgetBalanced
                        ? "Budget balanced"
                        : spendDelta != null && spendDelta < 0
                          ? "Trim spending to"
                          : "Spend up to"
                  }
                  value={
                    cantTrim
                      ? "not enough"
                      : maxSpend != null
                        ? `${fmtCurrency(maxSpend + goal.loanCost)}/yr`
                        : "—"
                  }
                  note={
                    cantTrim || maxSpend == null
                      ? undefined
                      : `${goal.loanCost > 0 ? `${fmtCurrency(maxSpend)} living + ${fmtCurrency(goal.loanCost)} loan · ` : ""}${targetPct}% likely to last`
                  }
                  delta={
                    cantTrim
                      ? `Essentials alone (${fmtCurrency(essentials + goal.loanCost)}/yr) already miss ${targetPct}% — trimming can't fix it`
                      : budgetBalanced
                        ? "A great match for what your plan can afford"
                        : spendDelta == null
                          ? "even a low spend is risky"
                          : spendDelta >= 0
                            ? `${fmtCurrency(spendDelta)} of headroom`
                            : `${fmtCurrency(-spendDelta)} less than now`
                  }
                  tone={
                    !cantTrim && (budgetBalanced || (spendDelta != null && spendDelta >= 0))
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
        {overspending && !cantTrim && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-sm text-slate-300">
              Want the app to do it for you? Trim discretionary spending — keeping
              your essentials — to stay about {Math.round(MC_CONFIDENCE_TARGET * 100)}% likely to last to age {plan.lifeExpectancy}.
            </p>
            <button
              onClick={() => setTrimOpen(true)}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110"
            >
              ✂️ Help me trim spending
            </button>
          </div>
        )}
        {spendHeadroom && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-sm text-slate-300">
              The model shows headroom: discretionary spending (essentials kept) could
              rise while the plan stays about {Math.round(MC_CONFIDENCE_TARGET * 100)}%
              likely to last to age {plan.lifeExpectancy}. Whether to spend it is your
              choice — this is general information, not advice.
            </p>
            <button
              onClick={() => setBoostOpen(true)}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110"
            >
              📈 Model spending more
            </button>
          </div>
        )}
        {budgetBalanced && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-sm text-slate-300">
              <span className="font-semibold text-accent">Around the mark.</span> Your spending sits near the top
              of what the model projects at about the {Math.round(MC_CONFIDENCE_TARGET * 100)}% likelihood — nothing
              flagged to trim, and little modelled headroom to add. General information, not advice.
            </p>
            <span className="text-2xl" aria-hidden>🎯</span>
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
            . The levers above model retiring later, spending less, or saving more.
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
          initial={configured ? base : (wizardSeed ?? BLANK_STARTER)}
          configured={configured}
          config={config}
          onComplete={handleComplete}
          onProgress={(d) => {
            // Continuous save: mirror the wizard's progress into the live plan so it's
            // never lost if the user closes without finishing. Editing an existing plan
            // just updates the base (the strategy layer stays on top). A first-run wizard
            // only adopts once the plan is actually BUILT — until then it would push NaN
            // fields into the still-empty Get-started dashboard.
            if (configured) {
              setBase(d);
            } else if (planIsBuilt(d)) {
              commit(d);
              setConfigured(true);
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
          onProgress={(update) => quickAdjust(update)}
          onClose={() => setBudgetOpen(false)}
        />
      )}

      {notesOpen && activePlan && (
        <ScenarioNotesModal
          plan={plan}
          config={config}
          result={result}
          successPct={successPct ?? 0}
          applied={applied}
          scenarioId={activePlan.id}
          scenarioName={activeName ?? activePlan.name}
          initialNotes={notesOverride[activePlan.id] ?? activePlan.notes ?? ""}
          onSaved={(notes) => setNotesOverride((m) => ({ ...m, [activePlan.id]: notes }))}
          onClose={() => setNotesOpen(false)}
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
              result={result}
              onClose={() => setIncomeAge(null)}
              onPrev={() => setIncomeAge((a) => (a != null ? Math.max(min, a - 1) : a))}
              onNext={() => setIncomeAge((a) => (a != null ? Math.min(max, a + 1) : a))}
              canPrev={incomeAge > min}
              canNext={incomeAge < max}
            />
          );
        })()}

      {newScenarioOpen && (
        <NewScenarioModal
          currentName={activeName}
          existingNames={savedPlans.map((p) => p.name)}
          pending={pending}
          canCopy={configured}
          onCreate={createScenarioFrom}
          onClose={() => setNewScenarioOpen(false)}
        />
      )}

      {/* ⚙ Manage — the folded-away Scenario card. Everything from the old scenario
          bar (rename, switch, new, compare, notes, financial summary, report, share,
          import/export, delete) lives here, launched from the confidence hero. */}
      {scenarioModalOpen && user && !shared && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-ink/70 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Manage scenario"
          onClick={() => setScenarioModalOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Scenario</div>
                <div className="mt-0.5 text-lg font-semibold text-white">Manage this scenario</div>
              </div>
              <button
                onClick={() => setScenarioModalOpen(false)}
                aria-label="Close"
                className="rounded-lg px-2 py-1 text-lg text-muted transition hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4">
              {/* Name */}
              <label htmlFor="scen-name" className="block text-[11px] font-semibold uppercase tracking-wide text-muted">
                Name
              </label>
              <input
                id="scen-name"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={renameActive}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    setNameDraft(activeName ?? "");
                    e.currentTarget.blur();
                  }
                }}
                disabled={!savedId}
                aria-label="Scenario name"
                placeholder={savedId ? "Name this scenario" : "Working scenario"}
                className="mt-1.5 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-accent disabled:opacity-60"
              />
              <p className="mt-1 text-[11px] text-muted">Every change is saved to this scenario automatically.</p>

              {/* Completeness donuts → jump straight into the matching tool. */}
              <div className="mt-4">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">How complete is this scenario?</div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Plan details", sub: "Open the plan wizard →", pct: planCompleteness(plan).pct, onClick: () => { setReturnToManage(true); setScenarioModalOpen(false); setWizardOpen(true); } },
                    { label: "Budget", sub: "Open the budget planner →", pct: budgetCompleteness(plan).pct, onClick: () => { setReturnToManage(true); setScenarioModalOpen(false); setBudgetOpen(true); } },
                  ].map((d) => (
                    <button
                      key={d.label}
                      type="button"
                      onClick={d.onClick}
                      className="flex flex-col items-center gap-2 rounded-xl border border-line bg-panel-2 px-3 py-3 text-center transition hover:border-accent/50 hover:bg-panel"
                    >
                      <CompletenessRing pct={d.pct} size={64} showPercent />
                      <div>
                        <div className="text-xs font-semibold text-white">{d.label}</div>
                        <div className="mt-0.5 text-[11px] text-accent">{d.sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Switch */}
              {savedPlans.length > 1 && (
                <div className="mt-4">
                  <label htmlFor="scen-switch" className="block text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Switch scenario
                  </label>
                  <select
                    id="scen-switch"
                    value={savedId ?? ""}
                    onChange={(e) => {
                      setScenarioModalOpen(false);
                      switchScenario(e.target.value);
                    }}
                    aria-label="Switch scenario"
                    disabled={pending}
                    className="mt-1.5 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-white outline-none focus:border-accent disabled:opacity-60"
                  >
                    {savedId == null && <option value="">Working scenario</option>}
                    {savedPlans.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="my-4 border-t border-line" />

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setScenarioModalOpen(false); setNewScenarioOpen(true); }}
                  disabled={pending}
                  className={SCEN_ACTION}
                >
                  ＋ New scenario
                </button>
                {activePlan && (
                  <Link href="/compare" onClick={() => setScenarioModalOpen(false)} className={SCEN_ACTION}>
                    ⚖ Compare
                  </Link>
                )}
                {activePlan && (
                  <button onClick={() => { setScenarioModalOpen(false); setNotesOpen(true); }} className={SCEN_ACTION}>
                    📝 Notes
                  </button>
                )}
                {activePlan && (
                  <Link href={`/assets/${activePlan.id}`} onClick={() => setScenarioModalOpen(false)} className={SCEN_ACTION}>
                    🏦 Financial summary
                  </Link>
                )}
                {activePlan && (
                  <Link href={`/report/${activePlan.id}`} target="_blank" className={SCEN_ACTION}>
                    ↗ Run report
                  </Link>
                )}
              </div>

              {!activePlan && (
                <p className="mt-3 text-sm text-muted">Saving your scenario… more options appear once it&apos;s saved.</p>
              )}

              {/* Share + import/export */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {activePlan && (
                  <ShareControl key={activePlan.id} id={activePlan.id} initialToken={activePlan.share_token} onNotice={setNotice} />
                )}
                {renderIOButtons()}
              </div>

              {/* Delete */}
              {activePlan && (
                <div className="mt-4 border-t border-line pt-4">
                  <button
                    onClick={() => { setScenarioModalOpen(false); handleDelete(activePlan); }}
                    disabled={pending}
                    aria-label={`Delete ${activePlan.name}`}
                    className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-sm font-medium text-muted transition hover:border-red-400/50 hover:text-red-400 disabled:opacity-60"
                  >
                    ✕ Delete scenario
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {taxAge != null &&
        (() => {
          const ages = result.rows.map((r) => r.age);
          const row = result.rows.find((r) => r.age === taxAge);
          if (!row) return null;
          const min = ages[0];
          const max = ages[ages.length - 1];
          return (
            <TaxYearModal
              row={row}
              plan={plan}
              onClose={() => setTaxAge(null)}
              onPrev={() => setTaxAge((a) => (a != null ? Math.max(min, a - 1) : a))}
              onNext={() => setTaxAge((a) => (a != null ? Math.min(max, a + 1) : a))}
              canPrev={taxAge > min}
              canNext={taxAge < max}
            />
          );
        })()}

      {fanAge != null &&
        mc &&
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
              pensionAge={config.agePensionAge}
              onClose={() => setFanAge(null)}
              onPrev={() => setFanAge((a) => (a != null ? Math.max(min, a - 1) : a))}
              onNext={() => setFanAge((a) => (a != null ? Math.min(max, a + 1) : a))}
              canPrev={fanAge > min}
              canNext={fanAge < max}
            />
          );
        })()}

      {/* Guest reset — once a signed-out user has built a plan they can wipe it
          and start fresh. Hidden in the empty first-visit state (nothing to clear)
          and in a SHARED view — it's someone else's read-only scenario, so clearing
          here would wipe the viewer's OWN data and trap them on the shared route
          (they should "Build your own →" to their real dashboard instead). */}
      {!user && !shared && configured && (
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
