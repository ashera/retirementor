"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan, SimResult, WhatIfSaved } from "@/lib/au/types";
import { DEFAULT_PLAN, getInvestmentProperties } from "@/lib/au/types";
import { simulate } from "@/lib/au/simulate";
import { runMonteCarlo, MC_CONFIDENCE_TARGET as SAFE_TARGET, MC_CONFIDENCE_MC as SAFE_MC } from "@/lib/au/montecarlo";
import { guardrailsOutlook, type GuardrailsOutlook } from "@/lib/au/guardrails";
import { fmtCurrency } from "@/lib/au/format";
import { rowNetWorth } from "@/lib/au/networth";
import { track } from "@/lib/analytics";
import type { SavedPlan } from "@/app/actions/plans";
import { savePlan } from "@/app/actions/plans";
import {
  buildStrategyCatalog,
  applyStrategies,
  resolveValues,
  maxSustainableSpend,
  maxSpendForConfidence,
  withSpend,
  essentialsFloor,
  GROUP_LABEL,
  type StrategyCard,
  type StrategyGroup,
} from "@/lib/au/strategies";
import RetirementChart from "@/components/RetirementChart";
import IncomeChart from "@/components/IncomeChart";
import YearDetailModal from "@/components/YearDetailModal";
import IncomeYearModal from "@/components/IncomeYearModal";
import AssumptionsModal from "@/components/AssumptionsModal";
import StrategyAssumptionsModal from "@/components/StrategyAssumptionsModal";
import GuardrailsTimelineModal from "@/components/GuardrailsTimelineModal";
import SpendingBreakdown from "@/components/SpendingBreakdown";
import { retirementGoal } from "@/lib/au/goal";
import { initialWithdrawal, withdrawalBand } from "@/lib/au/withdrawal";
import Field from "@/components/Field";

const PLAN_KEY = "au-retirement-plan";
const WHATIF_KEY = "au-whatif-board"; // persists the board selection across visits
const GROUP_ORDER: StrategyGroup[] = ["home", "mortgage", "property", "timing", "work"];

const annualSpend = (p: RetirementPlan) =>
  Math.max(1, p.spendingMode === "stages" ? p.spendingStages.goGo : p.targetSpending);

// Withdrawal-rate band → colours, matching the dashboard's rate card so the two
// surfaces read identically (accent = safe, amber = moderate, red = high).
const WR_TONE: Record<"accent" | "amber" | "red", string> = {
  accent: "text-emerald-400",
  amber: "text-amber-400",
  red: "text-red-400",
};
const WR_BADGE: Record<"accent" | "amber" | "red", string> = {
  accent: "bg-emerald-500/15 text-emerald-400",
  amber: "bg-amber-500/15 text-amber-400",
  red: "bg-red-500/15 text-red-400",
};

/** How long the money lasts, as an age: the depletion age if it runs out before
 *  life expectancy, otherwise life expectancy itself. Deliberately does NOT add the
 *  end-of-plan leftover as extra "years" — that cushion is a dollar amount, shown by
 *  the net-worth / money-left chips, so "Money lasts" only moves when longevity
 *  genuinely changes (a plan that reaches life expectancy either way = 0 yrs). */
function lastsScore(res: SimResult, life: number): number {
  return res.lastsToLifeExpectancy ? life : res.depletedAge ?? 0;
}

const lastsLabel = (res: SimResult, plan: RetirementPlan) =>
  res.lastsToLifeExpectancy ? `to ${plan.lifeExpectancy}+` : `to ${res.depletedAge}`;

// How well off a plan leaves you, split into money left at the end and total
// spending it couldn't fund. Only unfunded years count toward the shortfall
// (funded years met their spending, including any work income that isn't a row
// drawdown). "How much better off" overall = final − shortfall.
function planParts(res: SimResult): { final: number; shortfall: number } {
  const final = res.rows.length ? res.rows[res.rows.length - 1].total : 0;
  let shortfall = 0;
  for (const r of res.rows) {
    if (r.funded) continue;
    const provided = r.agePension + r.superDrawn + r.outsideDrawn + Math.max(0, r.rentIncome);
    shortfall += Math.max(0, r.spending - provided);
  }
  return { final, shortfall };
}

interface Marginal {
  years: number; // change in how long the money lasts (a "lasts to" score, incl. end buffer)
  moneyLeft: number; // change in liquid super + savings left at life expectancy
  shortfallAvoided: number; // reduction in unfunded spending
  netWorth: number; // change in total net worth (incl. home + property) at life expectancy
  takeHomeNow: number; // working-year take-home pay with this lever alone (salary-sacrifice hit)
}

/** Compact signed dollar delta, or null when too small to bother showing. */
function fmtDelta(d: number): string | null {
  const a = Math.abs(d);
  if (a < 2_000) return null;
  const mag = a >= 1_000_000 ? `$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}m` : `$${Math.round(a / 1_000)}k`;
  return `${d > 0 ? "+" : "−"}${mag}`;
}

// Annual-income deltas are smaller than the balance deltas above, so they get
// their own finer formatter: dollars (not $k), rounded to the nearest $100, with
// a lower noise floor. Returns null when the change isn't worth showing.
function fmtDeltaYr(d: number): string | null {
  const a = Math.abs(d);
  if (a < 300) return null;
  return `${d > 0 ? "+" : "−"}${fmtCurrency(Math.round(a / 100) * 100)}/yr`;
}

export default function WhatIfView({
  config,
  savedPlans,
  signedIn,
  sharedPlan = null,
}: {
  config: EngineConfig;
  savedPlans: SavedPlan[];
  signedIn: boolean;
  // Public read-only view (a share link or a curated /scenario/<slug> demo):
  // start from this scenario and never read/write the viewer's own localStorage.
  // `basePath` is this view's root (e.g. "/s/<token>" or "/scenario/<slug>").
  sharedPlan?: { plan: RetirementPlan; name: string; basePath: string } | null;
}) {
  const shared = !!sharedPlan;
  const [current, setCurrent] = useState<RetirementPlan | null>(null);
  const [baselineId, setBaselineId] = useState("current");
  const [active, setActive] = useState<Set<string>>(new Set());
  const [values, setValues] = useState<Record<string, Record<string, number>>>({});
  const [saveName, setSaveName] = useState("");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [chartView, setChartView] = useState<"balance" | "networth" | "income">("balance");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [assumptionsCard, setAssumptionsCard] = useState<StrategyCard | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);

  // Don't persist the board until after the initial restore has been applied,
  // so the empty first render can't clobber the saved selection.
  const persistReady = useRef(false);

  useEffect(() => {
    if (sharedPlan) {
      // Public share view: start from the shared scenario with a clean board;
      // never read the viewer's own stored plan or saved board state.
      setCurrent({ ...DEFAULT_PLAN, ...sharedPlan.plan });
      return;
    }
    let cur: RetirementPlan = DEFAULT_PLAN;
    try {
      const raw = localStorage.getItem(PLAN_KEY);
      if (raw) cur = { ...DEFAULT_PLAN, ...JSON.parse(raw) };
    } catch {}
    setCurrent(cur);

    // (B) "Edit in What-If": /what-if?edit=<planId> reopens that saved
    // scenario's exact strategy selection. (A) Otherwise restore the last board
    // state from localStorage so returning to the page keeps your work.
    let restore: WhatIfSaved | undefined;
    try {
      const editId = new URLSearchParams(window.location.search).get("edit");
      const editPlan = editId ? savedPlans.find((s) => s.id === editId) : undefined;
      if (editPlan?.data.whatIf) {
        restore = editPlan.data.whatIf;
        window.history.replaceState(null, "", "/what-if"); // don't re-trigger on refresh
      } else {
        const raw = localStorage.getItem(WHATIF_KEY);
        if (raw) restore = JSON.parse(raw) as WhatIfSaved;
      }
    } catch {}

    if (restore) {
      if (restore.baselineId) setBaselineId(restore.baselineId);
      setActive(new Set(restore.active ?? []));
      setValues(restore.values ?? {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the board selection (Part A). Skips the very first run so the empty
  // initial state doesn't overwrite what we're about to restore above.
  useEffect(() => {
    if (shared) return; // read-only share view — don't touch the viewer's storage
    if (!persistReady.current) {
      persistReady.current = true;
      return;
    }
    try {
      localStorage.setItem(WHATIF_KEY, JSON.stringify({ baselineId, active: [...active], values }));
    } catch {}
  }, [baselineId, active, values]);

  const baseline: RetirementPlan | null = useMemo(() => {
    if (!current) return null;
    if (baselineId === "current") return current;
    const sp = savedPlans.find((s) => s.id === baselineId);
    return sp ? { ...DEFAULT_PLAN, ...sp.data } : current;
  }, [current, baselineId, savedPlans]);

  const baseRes = useMemo(() => (baseline ? simulate(baseline, config) : null), [baseline, config]);
  // Projected super / outside-savings at an age (start-of-year), so the lump-sum
  // and recontribution levers can cap their sliders/notes at the balance there.
  const superAtAge = useMemo(() => {
    const byAge = new Map(baseRes?.rows.map((r) => [r.age, r.totalSuper]) ?? []);
    return (age: number) => byAge.get(Math.round(age)) ?? 0;
  }, [baseRes]);
  const outsideAtAge = useMemo(() => {
    const byAge = new Map(baseRes?.rows.map((r) => [r.age, r.outside]) ?? []);
    return (age: number) => byAge.get(Math.round(age)) ?? 0;
  }, [baseRes]);
  const catalog = useMemo(
    () => (baseline ? buildStrategyCatalog(baseline, { superAtAge, outsideAtAge, config }) : []),
    [baseline, superAtAge, outsideAtAge],
  );

  // Switching the baseline resets the toggles (its catalog differs). This is an
  // explicit handler, not an effect, so restoring a saved selection on mount
  // (which sets baselineId) does NOT wipe the restored toggles.
  const switchBaseline = (id: string) => {
    setBaselineId(id);
    setActive(new Set());
    setValues({});
    setSaveMsg(null);
  };

  const composed = useMemo(
    () => (baseline ? applyStrategies(baseline, catalog, active, values) : null),
    [baseline, catalog, active, values],
  );

  const compRes = useMemo(() => (composed ? simulate(composed, config) : null), [composed, config]);

  // Monte Carlo success %. A FIXED seed means baseline and composed run against the
  // same market paths, so the comparison is fair and doesn't jitter as you toggle.
  // Use the SAME seed as runMonteCarlo's default (0x9e3779b9) — which the dashboard
  // "how likely" gauge and the safe-spend solver (MC_CONFIDENCE_MC) also use — so this
  // card's "chance of lasting" agrees with its "safe spend ~85%" line and with the
  // dashboard, instead of drifting a few points off on an unrelated seed.
  const MC = { iterations: 1000, seed: 0x9e3779b9 } as const;
  const baseMc = useMemo(
    () => (baseline ? runMonteCarlo(baseline, config, MC).successRate : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseline, config],
  );
  // MC is heavy, so debounce it: only run on the composed plan once toggling settles.
  const [compMc, setCompMc] = useState<number | null>(null);
  const [mcPending, setMcPending] = useState(false);
  useEffect(() => {
    if (!composed) return;
    setMcPending(true);
    const id = setTimeout(() => {
      setCompMc(runMonteCarlo(composed, config, MC).successRate);
      setMcPending(false);
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composed, config]);

  // Per-card isolated marginal effect: how much longer the money lasts, and how
  // much better off overall (dollars).
  const marginal = useMemo(() => {
    if (!baseline || !baseRes) return {} as Record<string, Marginal>;
    const life = baseline.lifeExpectancy;
    const baseScore = lastsScore(baseRes, life);
    const baseParts = planParts(baseRes);
    const baseTermNW = baseRes.rows.length ? rowNetWorth(baseRes.rows[baseRes.rows.length - 1]) : 0;
    const out: Record<string, Marginal> = {};
    for (const card of catalog) {
      const single = card.apply(baseline, resolveValues(card, values[card.id]));
      const res = simulate(single, config);
      const parts = planParts(res);
      const moneyLeft = parts.final - baseParts.final;
      const shortfallAvoided = baseParts.shortfall - parts.shortfall;
      const termNW = res.rows.length ? rowNetWorth(res.rows[res.rows.length - 1]) : 0;
      out[card.id] = {
        years: lastsScore(res, life) - baseScore,
        moneyLeft,
        shortfallAvoided,
        netWorth: termNW - baseTermNW,
        takeHomeNow: res.rows[0]?.takeHome ?? 0,
      };
    }
    return out;
  }, [baseline, baseRes, catalog, values, config]);

  // The Adjust-spending card measures against your CURRENT SCENARIO, not the bare
  // baseline. Its likelihood, safe spend and withdrawal rate all sit on the plan
  // with your other active levers applied, so its "Money lasts / net worth" chip
  // must too — otherwise the chip strips those levers out and can read a loss the
  // real scenario doesn't have (e.g. "−5 yrs" while you're still 85% to reach 90).
  // Delta = (other levers + the set spend) − (other levers, at the current spend).
  const spendDelta = useMemo(() => {
    if (!baseline) return null;
    const others = new Set(active);
    others.delete("adjust-spending");
    const base = applyStrategies(baseline, catalog, others, values);
    const set = applyStrategies(baseline, catalog, new Set([...others, "adjust-spending"]), values);
    const baseR = simulate(base, config);
    const setR = simulate(set, config);
    const life = baseline.lifeExpectancy;
    const bp = planParts(baseR);
    const sp = planParts(setR);
    const baseNW = baseR.rows.length ? rowNetWorth(baseR.rows[baseR.rows.length - 1]) : 0;
    const setNW = setR.rows.length ? rowNetWorth(setR.rows[setR.rows.length - 1]) : 0;
    return {
      years: lastsScore(setR, life) - lastsScore(baseR, life),
      moneyLeft: sp.final - bp.final,
      shortfallAvoided: bp.shortfall - sp.shortfall,
      netWorth: setNW - baseNW,
      takeHomeNow: setR.rows[0]?.takeHome ?? 0,
    } as Marginal;
  }, [baseline, catalog, active, values, config]);

  // "You could spend up to $X" — the highest spend that still lasts to life
  // expectancy, solved on the plan with the OTHER active levers applied (so it
  // reflects the rest of the scenario) and independent of the spend slider itself.
  const otherValsKey = useMemo(() => {
    const o: Record<string, Record<string, number>> = { ...values };
    delete o["adjust-spending"];
    return JSON.stringify(o);
  }, [values]);
  const spendSustainable = useMemo(() => {
    if (!baseline) return null;
    const others = new Set(active);
    others.delete("adjust-spending");
    // Guardrails stripped: this is the FIXED-spending ceiling (the flexible one is
    // surfaced separately on the withdrawal-rate bar + guardrails card).
    const base: RetirementPlan = { ...applyStrategies(baseline, catalog, others, values), guardrails: undefined };
    return maxSustainableSpend(base, config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseline, catalog, active, otherValsKey, config]);

  // Essentials floor held by the Adjust discretionary spending lever (from the
  // plan's budget, or an ASFA 'modest' fallback). The spend slider can't go below it.
  const essentials = useMemo(() => (baseline ? essentialsFloor(baseline, config) : 0), [baseline, config]);

  // Spending mix of the COMPOSED plan (reflects the active levers) — essentials
  // (fixed), discretionary (what flexes under guardrails) and any home loan (fixed).
  const spendMix = useMemo(() => {
    if (!composed) return null;
    const goal = retirementGoal(composed);
    const ess = Math.min(essentialsFloor(composed, config), goal.living);
    return { total: goal.total, essential: ess, discretionary: Math.max(0, goal.living - ess), loan: goal.loanCost, estimated: !composed.budget };
  }, [composed, config]);

  // Prudent "safe spend" = highest spend with ≥ SAFE_TARGET Monte Carlo success.
  // Heavy (bisected MC), so debounced off the interaction path with a pending
  // pulse — same pattern as the composed MC above.
  const [safeSpend, setSafeSpend] = useState<number | null>(null);
  // The whole-portfolio withdrawal rate at that safe spend — the % twin of the
  // dollar figure, measured on the SAME basis (withSpend, portfolioRate) as the
  // dashboard's withdrawal-rate card, so the two surfaces agree.
  const [safeRate, setSafeRate] = useState<number | null>(null);
  // The safe spend/rate under FLEXIBLE spending (guardrails): higher, because trimming
  // in downturns lets you start higher. The steady figures above are computed with
  // guardrails STRIPPED so they stay a stable "fixed spending" benchmark; these are
  // computed with guardrails FORCED — the gap is the uplift flexible spending buys.
  const [flexSafeSpend, setFlexSafeSpend] = useState<number | null>(null);
  const [flexSafeRate, setFlexSafeRate] = useState<number | null>(null);
  const [safePending, setSafePending] = useState(false);
  // The Adjust-spending card's "at your current spend" anchor: the likelihood with
  // the OTHER active What-If levers applied but the spend left at its current level
  // — so the card measures what CHANGING SPEND does on top of the rest of the
  // scenario, not against the bare planner baseline. Same seed as compMc so the two
  // ends of the arrow are directly comparable.
  const [anchorMc, setAnchorMc] = useState<number | null>(null);
  useEffect(() => {
    if (!baseline) return;
    setSafePending(true);
    const others = new Set(active);
    others.delete("adjust-spending");
    const composedOthers = applyStrategies(baseline, catalog, others, values);
    // Steady = fixed spending (guardrails stripped); flex = guardrails forced on.
    const steadyBase: RetirementPlan = { ...composedOthers, guardrails: undefined };
    const flexBase: RetirementPlan = { ...composedOthers, guardrails: {} };
    const id = setTimeout(() => {
      const ss = maxSpendForConfidence(steadyBase, config, SAFE_TARGET, SAFE_MC);
      setSafeSpend(ss);
      const w = ss != null ? initialWithdrawal(simulate(withSpend(steadyBase, ss), config)) : null;
      setSafeRate(w ? w.portfolioRate : null);
      const fs = maxSpendForConfidence(flexBase, config, SAFE_TARGET, SAFE_MC);
      setFlexSafeSpend(fs);
      const wf = fs != null ? initialWithdrawal(simulate(withSpend(flexBase, fs), config)) : null;
      setFlexSafeRate(wf ? wf.portfolioRate : null);
      // Anchor reflects the REAL scenario (other levers as toggled, incl. guardrails).
      setAnchorMc(runMonteCarlo(composedOthers, config, MC).successRate);
      setSafePending(false);
    }, 450);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseline, catalog, active, otherValsKey, config]);

  // The live withdrawal rate at the spend the slider is currently set to — read
  // off the composed sim result, so it moves as you drag and correctly accounts
  // for the essentials-fixed / discretionary-flexed split this card applies.
  const nowRate = useMemo(
    () => (compRes ? initialWithdrawal(compRes)?.portfolioRate ?? null : null),
    [compRes],
  );

  // Guardrails outlook — the flexible-spending downside a fixed safe-spend can't
  // show (worst-case cut depth + how long, and the central spend path). Only when
  // the guardrails lever is on, and debounced off the interaction path (it's a
  // small Monte Carlo over the spending path).
  const [grOutlook, setGrOutlook] = useState<GuardrailsOutlook | null>(null);
  const [grUplift, setGrUplift] = useState<{ fixed: number; flex: number } | null>(null);
  const [grPending, setGrPending] = useState(false);
  useEffect(() => {
    if (!composed || !active.has("guardrails")) {
      setGrOutlook(null);
      setGrUplift(null);
      return;
    }
    setGrPending(true);
    const id = setTimeout(() => {
      setGrOutlook(guardrailsOutlook(composed, config));
      // The honest headline for guardrails: the likelihood uplift at the CURRENT
      // spend (same plan, guardrails off vs on) — not the misleading "safe start"
      // ceiling, which is inflated because "lasting" is achieved by trimming.
      const fixed = runMonteCarlo({ ...composed, guardrails: undefined }, config, SAFE_MC).successRate;
      const flex = runMonteCarlo(composed, config, SAFE_MC).successRate;
      setGrUplift({ fixed, flex });
      setGrPending(false);
    }, 500);
    return () => clearTimeout(id);
  }, [composed, active, config]);

  // Per-lever "affordable income" — the change in the most you could sustainably
  // spend each YEAR that this strategy buys you (isolated from the baseline, like
  // the chips above). A full max-sustainable-spend bisection per card is heavy, so
  // it's debounced off the interaction path with a pending pulse. This uses the
  // deterministic central projection; the prudent (85% Monte Carlo) figure lives
  // on the Adjust-spending card and the "spend up to" lever.
  const valsKey = useMemo(() => JSON.stringify(values), [values]);
  const [affordable, setAffordable] = useState<Record<string, number>>({});
  const [affordablePending, setAffordablePending] = useState(false);
  useEffect(() => {
    if (!baseline) return;
    setAffordablePending(true);
    const id = setTimeout(() => {
      const baseMax = maxSustainableSpend(baseline, config);
      const out: Record<string, number> = {};
      for (const card of catalog) {
        const single = card.apply(baseline, resolveValues(card, values[card.id]));
        out[card.id] = maxSustainableSpend(single, config) - baseMax;
      }
      setAffordable(out);
      setAffordablePending(false);
    }, 500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseline, catalog, valsKey, config]);

  if (!baseline || !baseRes || !compRes || !composed) return <div className="min-h-screen bg-ink" />;

  const changed = active.size > 0;

  // Net worth trajectory: total wealth (super + outside + home + property) across
  // retirement, plus the terminal estate at life expectancy. The sparkline spans
  // the retirement window (earliest retirement age → life) on one CPI basis.
  const nwLife = composed.lifeExpectancy;
  const nwStart = Math.min(baseRes.retirementAge, compRes.retirementAge);
  const nwSeries = (res: SimResult) =>
    res.rows.filter((r) => r.age >= nwStart).map((r) => ({ age: r.age, v: rowNetWorth(r) }));
  const baseNW = nwSeries(baseRes);
  const compNW = nwSeries(compRes);
  const baseTermNW = baseNW.length ? baseNW[baseNW.length - 1].v : 0;
  const compTermNW = compNW.length ? compNW[compNW.length - 1].v : 0;

  // Legend for the income-sources view (only the bands the composed plan uses).
  const composedWorking = Math.max(...composed.people.map((pp) => pp.currentAge)) < composed.retirementAge;
  const incomeLegend = [
    ...(composedWorking ? [{ c: "#facc15", l: "Take-home pay" }] : []),
    ...(composed.workIncome ? [{ c: "#f472b6", l: "Part-time work" }] : []),
    { c: "#a78bfa", l: "Age Pension" },
    { c: "#34d399", l: "Super" },
    { c: "#38bdf8", l: "Outside super" },
    ...(getInvestmentProperties(composed).length ? [{ c: "#fb923c", l: "Net rent" }] : []),
  ];

  const toggle = (card: StrategyCard) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(card.id)) {
        next.delete(card.id);
        return next;
      }
      // Turning on an exclusive card switches off the others in its group.
      if (card.exclusive) {
        for (const c of catalog) if (c.exclusive === card.exclusive && c.id !== card.id) next.delete(c.id);
      }
      next.add(card.id);
      return next;
    });
  const setParam = (cardId: string, key: string, v: number) =>
    setValues((prev) => ({ ...prev, [cardId]: { ...prev[cardId], [key]: v } }));

  const doSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    const name = saveName.trim() || "What-if scenario";
    // Store the board selection alongside the composed plan so the scenario can
    // be reopened and tweaked later via "Edit in What-If".
    const whatIf: WhatIfSaved = { active: [...active], values, baselineId };
    const res = await savePlan(name, { ...composed, whatIf });
    setSaving(false);
    if (res.error) setSaveMsg(res.error);
    else {
      setSaveMsg(`Saved “${name}” — reopen it any time from the dashboard (“Edit in What-If”).`);
      setSaveName("");
      track("What-if saved");
    }
  };

  // Show TTR only once the (composed) retirement age clears 60 — so it also
  // appears when the Retire later lever opens a working-past-60 window, and hides
  // again if retirement drops back to 60 or below.
  const cardVisible = (c: StrategyCard) => !(c.id === "ttr" && composed.retirementAge <= 60);
  const groups = GROUP_ORDER.map((g) => ({
    group: g,
    cards: catalog.filter((c) => c.group === g && cardVisible(c)),
  })).filter((x) => x.cards.length > 0);

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          href={shared ? sharedPlan!.basePath : "/"}
          className="text-sm font-medium text-muted hover:text-white"
        >
          ← Back to {shared ? "the shared scenario" : "planner"}
        </Link>
        {savedPlans.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted">
            Baseline:
            <select
              value={baselineId}
              onChange={(e) => switchBaseline(e.target.value)}
              className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm font-medium text-slate-200"
            >
              <option value="current">Current plan</option>
              {savedPlans.map((sp) => (
                <option key={sp.id} value={sp.id}>{sp.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {shared && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/5 px-5 py-3">
          <p className="text-sm text-slate-200">
            <span aria-hidden>🔗</span> You&apos;re experimenting on a{" "}
            <strong className="text-white">shared scenario — “{sharedPlan!.name}”</strong>. Nothing here is
            saved — it&apos;s a sandbox on top of the shared plan.
          </p>
          <Link
            href="/"
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-soft"
          >
            Build your own →
          </Link>
        </div>
      )}

      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">What if…</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Turn retirement strategies on and off and see the effect on your super, your income, and
          how long it lasts. Each toggle shows its own impact; the numbers up top show them combined.
        </p>
        <p className="mt-3 flex max-w-2xl items-start gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-slate-300">
          <span aria-hidden>🧪</span>
          <span>
            This is a safe sandbox — experimenting here <strong className="text-white">never changes your saved
            plan</strong>. It just starts from it. Like a combination? <strong className="text-white">Save it as a
            scenario</strong> below to keep a separate copy.
          </span>
        </p>
        <button
          type="button"
          onClick={() => setAssumptionsOpen(true)}
          className="mt-2 text-sm font-medium text-accent hover:underline"
        >
          🔍 See the assumptions behind these numbers
        </button>
      </header>

      {/* Headline metrics */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Money lasts"
          base={lastsLabel(baseRes, baseline)}
          now={changed ? lastsLabel(compRes, composed) : null}
          better={compRes.lastsToLifeExpectancy && !baseRes.lastsToLifeExpectancy}
          worse={!compRes.lastsToLifeExpectancy && baseRes.lastsToLifeExpectancy}
        />
        <MetricCard
          label="Super at retirement"
          base={fmtCurrency(baseRes.superAtRetirement)}
          now={changed ? fmtCurrency(compRes.superAtRetirement) : null}
          better={compRes.superAtRetirement > baseRes.superAtRetirement + 500}
          worse={compRes.superAtRetirement < baseRes.superAtRetirement - 500}
        />
        <MetricCard
          label="Likely to last"
          base={baseMc != null ? `${Math.round(baseMc * 100)}%` : "…"}
          now={changed && compMc != null ? `${Math.round(compMc * 100)}%` : null}
          better={changed && compMc != null && baseMc != null && compMc > baseMc + 0.005}
          worse={changed && compMc != null && baseMc != null && compMc < baseMc - 0.005}
          pending={changed && mcPending}
        />
      </div>

      {/* Spending mix — what a flexible-spending strategy can (discretionary) and
          can't (essentials, home loan) move. */}
      {spendMix && (
        <div className="mb-6 rounded-2xl border border-line bg-panel p-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Your spending</span>
            <span className="text-lg font-bold tabular-nums text-white">
              {fmtCurrency(spendMix.total)}
              <span className="ml-0.5 text-xs font-medium text-muted">/yr</span>
            </span>
          </div>
          <SpendingBreakdown
            essential={spendMix.essential}
            discretionary={spendMix.discretionary}
            loan={spendMix.loan}
            estimated={spendMix.estimated}
          />
        </div>
      )}

      {/* Net worth trajectory */}
      <div className="mb-6 rounded-2xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Net worth at {nwLife}
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              {changed ? (
                <>
                  <span className="text-lg text-muted line-through">{fmtCurrency(baseTermNW)}</span>
                  <span aria-hidden className="text-muted">→</span>
                  <span className="text-2xl font-bold tabular-nums text-white">{fmtCurrency(compTermNW)}</span>
                  <span className={`text-sm font-semibold tabular-nums ${compTermNW >= baseTermNW ? "text-accent" : "text-amber-400"}`}>
                    {fmtDelta(compTermNW - baseTermNW)}
                  </span>
                </>
              ) : (
                <span className="text-2xl font-bold tabular-nums text-white">{fmtCurrency(baseTermNW)}</span>
              )}
            </div>
            <div className="mt-0.5 text-[11px] text-muted">
              Total wealth — super, savings, home &amp; property — through retirement
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Sparkline
              series={changed ? [baseNW, compNW] : [compNW]}
              colors={changed ? ["#94a3b8", "#34d399"] : ["#34d399"]}
            />
            {changed && (
              <div className="flex gap-3 text-[10px] text-muted">
                <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 bg-[#94a3b8]" />Before</span>
                <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 bg-[#34d399]" />After</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="mb-6 rounded-2xl border border-line bg-panel p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-white">
            {chartView === "balance" ? "Balance over time" : chartView === "networth" ? "Net worth (incl. your home)" : "Income sources"}{" "}
            <span className="text-sm font-normal text-muted">(today&apos;s dollars)</span>
          </h2>
          <div className="flex gap-1 rounded-lg border border-line bg-panel-2 p-1 text-xs">
            {([
              ["balance", "Balance"],
              ["networth", "Net worth"],
              ["income", "Income"],
            ] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setChartView(v)}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  chartView === v ? "bg-accent text-ink" : "text-muted hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {chartView === "income" ? (
          <>
            <IncomeChart result={compRes} height={300} animate={false} minDrawdownBands={config.minDrawdownBands} onSelectYear={setSelectedYear} />
            <div className="mt-3 flex flex-wrap gap-4">
              {incomeLegend.map((it) => (
                <span key={it.l} className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: it.c }} />
                  {it.l}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              {changed ? "Your income mix with the selected strategies. " : "Where your income comes from each year. "}
              Dotted lines mark where super&apos;s minimum drawdown rate steps up (5% → 6% → 7%…), which can shift the
              super-vs-savings mix. Click a year to see why it&apos;s that amount.
            </p>
          </>
        ) : (
          <>
            <RetirementChart
              result={compRes}
              baseline={(chartView === "balance" || chartView === "networth") && changed ? baseRes : null}
              baselineLabel="Before"
              showHome={chartView === "networth"}
              onSelectYear={setSelectedYear}
              selectedAge={selectedYear}
              animate={false}
              height={300}
              wageInflationPct={composed.inflation + (config.livingStandardsGrowthPct ?? 0)}
              cpiPct={composed.inflation}
            />
            <div className="mt-3 flex flex-wrap gap-4">
              {[
                ...(chartView === "networth" ? [{ c: "#64748b", l: "Home equity" }] : []),
                ...(chartView === "networth" && getInvestmentProperties(composed).length ? [{ c: "#fb923c", l: "Investment property" }] : []),
                { c: "#34d399", l: "Super" },
                { c: "#38bdf8", l: "Outside super" },
                ...((chartView === "balance" || chartView === "networth") && changed ? [{ c: "#94a3b8", l: "Before" }] : []),
              ].map((it) => (
                <span key={it.l} className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: it.c }} />
                  {it.l}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              {chartView === "networth"
                ? "Your assets incl. your home equity (market value less any mortgage) — a downsize reallocates it (home shrinks, savings grow) without losing net worth. "
                : "Tip: "}
              Click a year to break down that year&apos;s money flow.
            </p>
          </>
        )}
      </div>

      {/* Strategy board */}
      {groups.length === 0 ? (
        <p className="rounded-2xl border border-line bg-panel px-4 py-8 text-center text-muted">
          No strategies apply to this scenario yet. Add a mortgage, investment property, or build a
          plan with working years to unlock levers here.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map(({ group, cards }) => (
            <section key={group}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{GROUP_LABEL[group]}</h3>
              <div className="space-y-3">
                {cards.map((card) => (
                  <StrategyCardRow
                    key={card.id}
                    card={card}
                    on={active.has(card.id)}
                    delta={
                      (card.id === "adjust-spending" ? spendDelta : marginal[card.id]) ?? {
                        years: 0,
                        moneyLeft: 0,
                        shortfallAvoided: 0,
                        netWorth: 0,
                        takeHomeNow: 0,
                      }
                    }
                    incomeDelta={affordable[card.id] ?? null}
                    incomePending={affordablePending}
                    life={baseline.lifeExpectancy}
                    baseTakeHome={baseRes.rows[0]?.takeHome ?? 0}
                    values={resolveValues(card, values[card.id])}
                    onToggle={() => toggle(card)}
                    onParam={(k, v) => setParam(card.id, k, v)}
                    onAssumptions={() => setAssumptionsCard(card)}
                    onTimeline={card.id === "guardrails" ? () => setTimelineOpen(true) : undefined}
                    guardrails={
                      card.id === "guardrails" && grOutlook
                        ? {
                            outlook: grOutlook,
                            pending: grPending,
                            safeStart: safeSpend,
                            safePending,
                            currentStart: annualSpend(composed),
                            loan: spendMix?.loan ?? 0,
                            fixedPct: grUplift ? Math.round(grUplift.fixed * 100) : null,
                            flexPct: grUplift ? Math.round(grUplift.flex * 100) : null,
                            targetPct: Math.round(SAFE_TARGET * 100),
                            // Safe-rate uplift: steady (fixed) vs flexible (guardrails).
                            steadySafeSpend: safeSpend,
                            steadySafeRate: safeRate,
                            flexSafeSpend,
                            flexSafeRate,
                          }
                        : undefined
                    }
                    sustainable={
                      card.id === "adjust-spending" && spendSustainable != null
                        ? {
                            essentials,
                            stretch: spendSustainable,
                            safe: safeSpend,
                            safePending,
                            targetPct: Math.round(SAFE_TARGET * 100),
                            life: baseline.lifeExpectancy,
                            startedPct: anchorMc != null ? Math.round(anchorMc * 100) : null,
                            nowPct: compMc != null ? Math.round(compMc * 100) : null,
                            likelihoodPending: mcPending,
                            nowRate,
                            safeRate,
                            flexSafeRate,
                            flexSafeSpend,
                            loan: spendMix?.loan ?? 0,
                            currentSpend: annualSpend(baseline),
                            onSetSafe: () => {
                              if (safeSpend != null) setParam("adjust-spending", "spend", safeSpend);
                            },
                          }
                        : undefined
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Save (owner) — or, for a shared viewer, an invite to build their own. */}
      {shared ? (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/5 p-4">
          <span className="text-sm text-slate-200">
            Like where this is heading? Build your own plan to save scenarios and share them too.
          </span>
          <Link
            href="/"
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft"
          >
            Build your own →
          </Link>
        </div>
      ) : (
      <div className="mt-8 rounded-2xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-slate-200">Like this combination?</span>
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Name this scenario"
            className="min-w-[12rem] flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-white outline-none focus:border-accent"
          />
          <button
            onClick={doSave}
            disabled={saving || !changed}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save as scenario"}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          Saves a separate copy — your dashboard plan stays exactly as it is.
        </p>
        {!signedIn && <p className="mt-2 text-xs text-muted">Sign in to save scenarios to your account.</p>}
        {saveMsg && <p className="mt-2 text-xs text-accent">{saveMsg}</p>}
      </div>
      )}

      <GuardrailsTimelineModal open={timelineOpen} onClose={() => setTimelineOpen(false)} plan={composed} config={config} />
      <AssumptionsModal open={assumptionsOpen} onClose={() => setAssumptionsOpen(false)} config={config} plan={composed} />
      <StrategyAssumptionsModal
        open={assumptionsCard != null}
        onClose={() => setAssumptionsCard(null)}
        strategyId={assumptionsCard?.id ?? null}
        strategyLabel={assumptionsCard?.label ?? null}
        config={config}
        plan={composed}
      />


      {/* Year explainer for the composed ("with strategies") plan. */}
      {selectedYear != null &&
        (() => {
          const ages = compRes.rows.map((r) => r.age);
          const idx = compRes.rows.findIndex((r) => r.age === selectedYear);
          const row = idx >= 0 ? compRes.rows[idx] : undefined;
          if (!row) return null;
          const nextRow = compRes.rows[idx + 1];
          const min = ages[0];
          const max = ages[ages.length - 1];
          const nav = {
            onClose: () => setSelectedYear(null),
            onPrev: () => setSelectedYear((a) => (a != null ? Math.max(min, a - 1) : a)),
            onNext: () => setSelectedYear((a) => (a != null ? Math.min(max, a + 1) : a)),
            canPrev: selectedYear > min,
            canNext: selectedYear < max,
          };
          return chartView === "income" ? (
            <IncomeYearModal row={row} plan={composed} config={config} {...nav} />
          ) : (
            <YearDetailModal
              row={row}
              nextRow={nextRow}
              view={chartView === "networth" ? "networth" : "savings"}
              plan={composed}
              {...nav}
            />
          );
        })()}
    </div>
  );
}

function MetricCard({
  label,
  base,
  now,
  better,
  worse,
  pending,
}: {
  label: string;
  base: string;
  now: string | null;
  better?: boolean;
  worse?: boolean;
  pending?: boolean;
}) {
  const tone = better ? "text-accent" : worse ? "text-amber-400" : "text-white";
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
        {pending && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-label="updating" />}
      </div>
      <div className={`mt-1 flex items-baseline gap-2 ${pending ? "opacity-60" : ""}`}>
        {now ? (
          <>
            <span className="text-lg text-muted line-through">{base}</span>
            <span aria-hidden className="text-muted">→</span>
            <span className={`text-2xl font-bold tabular-nums ${tone}`}>{now}</span>
          </>
        ) : (
          <span className="text-2xl font-bold tabular-nums text-white">{base}</span>
        )}
      </div>
    </div>
  );
}

// Tiny overlaid line chart of net worth over the retirement window. The last
// series is drawn solid + bold (the composed plan); earlier series are dashed
// (the baseline ghost). Y is scaled to the data range so the shape reads clearly.
function Sparkline({
  series,
  colors,
  width = 240,
  height = 56,
}: {
  series: { age: number; v: number }[][];
  colors: string[];
  width?: number;
  height?: number;
}) {
  const all = series.flat();
  if (all.length < 2) return <div style={{ width, height }} />;
  const ages = all.map((p) => p.age);
  const vals = all.map((p) => p.v);
  const [minAge, maxAge] = [Math.min(...ages), Math.max(...ages)];
  const [minV, maxV] = [Math.min(...vals), Math.max(...vals)];
  const pad = 4;
  const x = (age: number) => pad + (maxAge === minAge ? 0 : (age - minAge) / (maxAge - minAge)) * (width - 2 * pad);
  const y = (v: number) => height - pad - (maxV === minV ? 0 : (v - minV) / (maxV - minV)) * (height - 2 * pad);
  return (
    <svg width={width} height={height} role="img" aria-label="Net worth trajectory">
      {series.map((s, i) => {
        const last = i === series.length - 1;
        return (
          <polyline
            key={i}
            fill="none"
            stroke={colors[i]}
            strokeWidth={last ? 2 : 1.5}
            strokeDasharray={last ? undefined : "3 3"}
            strokeLinejoin="round"
            points={s.map((p) => `${x(p.age)},${y(p.v)}`).join(" ")}
          />
        );
      })}
    </svg>
  );
}

function ImpactBreakdown({ delta, incomeDelta, life }: { delta: Marginal; incomeDelta: number | null; life: number }) {
  const nwDiffers = Math.abs(delta.netWorth - delta.moneyLeft) >= 2_000;
  const incomeStr = incomeDelta != null ? fmtDeltaYr(incomeDelta) : null;
  const rows = [
    ...(incomeStr ? [{ label: "Income you could afford", sub: "most you could safely spend / yr", str: incomeStr, v: incomeDelta! }] : []),
    { label: `Spendable funds at ${life}`, sub: "liquid super + savings", v: delta.moneyLeft },
    { label: "Spending shortfall avoided", sub: "spending you can now cover", v: delta.shortfallAvoided },
    ...(nwDiffers ? [{ label: `Net worth at ${life}`, sub: "adds your home & property", v: delta.netWorth }] : []),
  ].filter((r) => "str" in r || Math.abs(r.v) >= 2_000);
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">On its own — the impact</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4 py-0.5">
          <span className="text-muted">
            {r.label}
            <span className="ml-1 text-[10px] text-muted/70">{r.sub}</span>
          </span>
          <span className={`shrink-0 font-semibold tabular-nums ${r.v > 0 ? "text-accent" : "text-amber-400"}`}>{"str" in r ? r.str : fmtDelta(r.v)}</span>
        </div>
      ))}
    </div>
  );
}

function DeltaChip({
  years,
  moneyLeft,
  netWorth,
  incomeDelta,
  incomePending,
  life,
}: {
  years: number;
  moneyLeft: number;
  netWorth: number;
  incomeDelta: number | null;
  incomePending: boolean;
  life: number;
}) {
  const yAbs = Math.abs(years);
  const yStr = yAbs < 0.05 ? null : `${years > 0 ? "+" : "−"}${yAbs >= 10 ? Math.round(yAbs) : yAbs.toFixed(1)} yrs`;
  const nwStr = fmtDelta(netWorth);
  const incStr = incomeDelta != null ? fmtDeltaYr(incomeDelta) : null;
  // Only surface the liquid "money left" when it meaningfully differs from net
  // worth (i.e. asset levers move the home/property) — otherwise it's redundant.
  const mlStr = Math.abs(moneyLeft - netWorth) >= 2_000 ? fmtDelta(moneyLeft) : null;
  if (!yStr && !mlStr && !nwStr && !incStr) return <span className="text-xs text-muted">≈ no change</span>;
  const tone = (v: number) => (v > 0 ? "text-accent" : "text-amber-400");
  const Line = ({ label, value, v, title, pending }: { label: string; value: string; v: number; title: string; pending?: boolean }) => (
    <span className={`flex items-baseline justify-end gap-1.5 ${pending ? "animate-pulse opacity-60" : ""}`} title={title}>
      <span className="text-[10px] font-normal text-muted">{label}</span>
      <span className={tone(v)}>{value}</span>
    </span>
  );
  return (
    <span className="shrink-0 space-y-0.5 text-right text-xs font-semibold tabular-nums">
      {yStr && <Line label="Money lasts" value={yStr} v={years} title="On its own, how much longer your super + savings cover your spending." />}
      {incStr && (
        <Line
          label="Income you could afford"
          value={incStr}
          v={incomeDelta!}
          pending={incomePending}
          title={`On its own, how much this lever changes the most you could sustainably spend each year — the yearly income headroom it buys (central projection, to age ${life}).`}
        />
      )}
      {mlStr && (
        <Line
          label={`Spendable funds at ${life}`}
          value={mlStr}
          v={moneyLeft}
          title={`Your liquid, spendable money — super + savings — left at age ${life}. (Net worth below also counts your home & property, so a downsize lifts this while barely changing net worth: it frees home equity into spendable funds, it isn't new wealth.)`}
        />
      )}
      {nwStr && (
        <Line label={`Net worth at ${life}`} value={nwStr} v={netWorth} title={`Total wealth — spendable funds (super + savings) PLUS your home & any property — at age ${life}.`} />
      )}
    </span>
  );
}

function StrategyCardRow({
  card,
  on,
  delta,
  incomeDelta,
  incomePending,
  life,
  baseTakeHome,
  values,
  onToggle,
  onParam,
  onAssumptions,
  onTimeline,
  guardrails,
  sustainable,
}: {
  card: StrategyCard;
  on: boolean;
  delta: Marginal;
  incomeDelta: number | null; // Δ affordable income /yr (null until first computed)
  incomePending: boolean;
  life: number;
  baseTakeHome: number;
  values: Record<string, number>;
  onToggle: () => void;
  onParam: (key: string, v: number) => void;
  onAssumptions: () => void;
  onTimeline?: () => void; // guardrails: open the raise/cut timeline modal
  guardrails?: {
    outlook: GuardrailsOutlook;
    pending: boolean;
    safeStart: number | null; // safe STARTING spend with guardrails, LIVING (null while computing)
    safePending: boolean;
    currentStart: number; // the composed plan's current starting LIVING spend
    loan: number; // annual home-loan cost — fixed (never trimmed), added to show TOTAL spend
    fixedPct: number | null; // likelihood to last at the current spend WITHOUT guardrails
    flexPct: number | null; // likelihood to last at the current spend WITH guardrails
    targetPct: number;
    steadySafeSpend: number | null; // safe spend at fixed spending (the % twin: steadySafeRate)
    steadySafeRate: number | null;
    flexSafeSpend: number | null; // safe spend under flexible spending (higher)
    flexSafeRate: number | null;
  };
  sustainable?: {
    essentials: number; // needs floor held fixed — the slider's lower bound
    stretch: number; // deterministic max (assumed return) — the slider ceiling
    safe: number | null; // prudent MC-based safe spend (null while first computing)
    safePending: boolean;
    targetPct: number;
    life: number;
    startedPct: number | null; // MC success at the current (baseline) spend — the anchor
    nowPct: number | null; // MC success at the chosen spend (composed)
    likelihoodPending: boolean;
    nowRate: number | null; // live whole-portfolio withdrawal rate at the chosen spend (fraction)
    safeRate: number | null; // whole-portfolio rate at the (steady) safe spend — the % twin of `safe`
    flexSafeRate: number | null; // safe rate under FLEXIBLE spending (guardrails) — the second marker
    flexSafeSpend: number | null; // safe spend under flexible spending — the $ twin
    loan: number; // composed plan's annual home-loan cost — a held (fixed) spend element on top of living
    currentSpend: number; // baseline living spend, the "vs now" anchor for the note
    onSetSafe: () => void;
  };
}) {
  // Guardrails figures are computed on LIVING spend (what flexes); add the fixed
  // home loan so the card shows TOTAL spend, consistent with the "Your spending"
  // bar (the loan is never trimmed — it behaves like an essential).
  const gLoan = guardrails?.loan ?? 0;
  const gSafeStart = guardrails?.safeStart != null ? guardrails.safeStart + gLoan : null;
  const gCurrent = guardrails ? guardrails.currentStart + gLoan : 0;
  // The trade-off line is derived from the SAME illustrative "rough run" the
  // sparkline draws (outlook.downturnPath), so the words and the chart can't
  // disagree — a run that visibly climbs back must not read "holds there". (The p90
  // Monte Carlo worstCut/yearsBelow are a rougher, separate statistic; mixing them
  // into this line was the inconsistency a user hit on fire-at-45.)
  const gPath = guardrails?.outlook.downturnPath ?? [];
  const gPathStart = (gPath[0]?.spend ?? guardrails?.currentStart ?? 0) + gLoan;
  const gPathTrough = (gPath.length ? Math.min(...gPath.map((p) => p.spend)) : 0) + gLoan;
  const gPathEnd = (gPath[gPath.length - 1]?.spend ?? 0) + gLoan;
  const gPathYrsBelow = gPath.filter((p) => p.spend < (gPath[0]?.spend ?? 0) - 1).length;
  const gPathRecovers = gPathEnd > gPathTrough * 1.03;
  const gPathBackToStart = gPathStart > 0 && gPathEnd >= gPathStart * 0.98;
  const gPathCutPct = gPathStart > 0 ? Math.round((1 - gPathTrough / gPathStart) * 100) : 0;
  // Does the plan ever hand out raises (drives the cost-line framing: two-sided
  // "good years raise, bad years trim" vs a one-sided "trims and holds").
  const gRaises = !!guardrails?.outlook.everRaises;
  // The shared "here's the cost in a rough run" clause, consistent with the sparkline.
  const gTradeoff = (
    <>
      trims you {gPathRecovers ? "as low as" : "to about"}{" "}
      <span className="font-semibold text-amber-300">{fmtCurrency(gPathTrough)}/yr</span> (−{gPathCutPct}%)
      {gPathYrsBelow > 0 ? ` for ~${gPathYrsBelow} years` : ""}
      {gPathRecovers ? (
        gPathBackToStart ? (
          <>, then climbs back to around your {fmtCurrency(gPathStart)}/yr start as the Age Pension arrives.</>
        ) : (
          <>, then recovers partway as the Age Pension arrives — still short of your {fmtCurrency(gPathStart)}/yr start.</>
        )
      ) : (
        <>, and holds there.</>
      )}
      {gLoan > 0 ? " Your home loan is never trimmed." : ""}
    </>
  );
  // GENUINE headroom to spend more — only then is "start higher" real upside, not
  // more austerity. Requires being comfortably safe EVEN WITHOUT guardrails (a
  // clear margin above the bar), not just an optimistic steady-return path: an
  // 87%-fixed plan that raises on average but crashes in a downturn isn't "funded".
  const gHeadroom =
    guardrails?.fixedPct != null && guardrails.fixedPct >= guardrails.targetPct + 5 && gRaises;
  // Withdrawal-rate readout for the spend slider: the % twin of the safe-spend
  // dollar figure, on the same 0–10% band scale (4% anchor + ▲ safe-rate) as the
  // dashboard's rate card, with a live marker that slides as you drag.
  const wr =
    sustainable?.nowRate != null
      ? {
          pct: +(sustainable.nowRate * 100).toFixed(1),
          band: withdrawalBand(sustainable.nowRate),
          marker: Math.min(100, Math.max(0, (sustainable.nowRate / 0.1) * 100)),
        }
      : null;
  const safeRatePct = sustainable?.safeRate != null ? +(sustainable.safeRate * 100).toFixed(1) : null;
  const safeRateMarker =
    sustainable?.safeRate != null ? Math.min(100, Math.max(0, (sustainable.safeRate / 0.1) * 100)) : null;
  // Flexible-spending (guardrails) safe rate — a second marker, only when it's
  // meaningfully above the steady one (it always lifts it, but guard against noise).
  const showFlex =
    sustainable?.flexSafeRate != null && sustainable.safeRate != null && sustainable.flexSafeRate > sustainable.safeRate + 0.002;
  const flexSafePct = showFlex ? +(sustainable!.flexSafeRate! * 100).toFixed(1) : null;
  const flexRateMarker = showFlex ? Math.min(100, Math.max(0, (sustainable!.flexSafeRate! / 0.1) * 100)) : null;
  // A home loan is a held (fixed) spending element funded on top of living costs.
  // When there is one, the spend slider and every spend figure on this card show
  // the loan-inclusive TOTAL, while `values.spend` stays in living terms internally
  // (the sims, safe-spend solve and rate all measure living + the separate loan).
  const spendLoan = sustainable?.loan ?? 0;
  const spendNote =
    sustainable && spendLoan > 0
      ? (() => {
          const total = values.spend + spendLoan;
          const diff = values.spend - sustainable.currentSpend;
          const vs =
            Math.abs(diff) >= 500 ? ` (${diff > 0 ? "+" : "−"}${fmtCurrency(Math.abs(diff))} vs now)` : "";
          return (
            `You're setting total spend to ${fmtCurrency(total)}/yr${vs}. Your essentials and home loan ` +
            `(${fmtCurrency(spendLoan)}/yr) stay fixed underneath — only the discretionary on top moves. ` +
            `Spending more runs your savings down faster (fewer years); spending less makes them last longer.`
          );
        })()
      : null;
  return (
    <div className={`rounded-2xl border p-4 transition ${on ? "border-accent/40 bg-accent/5" : "border-line bg-panel"}`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={onToggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-accent" : "bg-line"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
        </button>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <div className="text-sm font-semibold text-white">{card.label}</div>
        </button>
        {guardrails ? (
          // Guardrails isn't a wealth-mover — it's a spending rule / stress test, so
          // money-lasts / income / net-worth deltas misframe it. Tag it as such.
          <span className="shrink-0 rounded-full bg-panel-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Stress test
          </span>
        ) : (
          <DeltaChip years={delta.years} moneyLeft={delta.moneyLeft} netWorth={delta.netWorth} incomeDelta={incomeDelta} incomePending={incomePending} life={life} />
        )}
      </div>

      {on && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {card.blurb && <p className="text-xs text-muted">{card.blurb}</p>}
          {guardrails ? (
            // Repurposed "impact" slot: frame guardrails as a policy / stress test,
            // since it doesn't move wealth or longevity the way other levers do.
            <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">A spending rule — not a wealth boost</div>
              <p className="text-slate-300">
                Unlike the other levers, guardrails don&apos;t grow your money or make it last longer on their own —
                they&apos;re a rule for <em>how you spend</em>: ease off in bad years, treat yourself in good ones, so a
                rough market can&apos;t sink the plan. The panel below stress-tests it — your odds of lasting, and what
                the flexing costs.
              </p>
            </div>
          ) : (
            <ImpactBreakdown delta={delta} incomeDelta={incomeDelta} life={life} />
          )}
          {card.params.map((pm) => {
            // A param can cap itself against the card's other live values (e.g.
            // the downsizer contribution can't exceed the equity actually freed).
            const cap = pm.dynamicMax ? pm.dynamicMax(values) : Infinity;
            let effMax = Math.min(pm.max, cap);
            let effMin = pm.min;
            // Spend slider: floor at essentials (only the discretionary portion
            // above it flexes) and let it reach the deterministic max ("stretch").
            if (sustainable && pm.key === "spend") {
              const step = pm.step || 1_000;
              effMin = Math.max(effMin, Math.round(sustainable.essentials / step) * step);
              if (sustainable.stretch > effMax) effMax = Math.ceil(sustainable.stretch / step) * step;
            }
            // The freed-equity split is now spelled out in the strategy's note
            // card, so the slider just uses its own hint (the dynamicMax still
            // caps it at the equity actually freed).
            const hint = pm.hint;
            // Spend slider shows the loan-inclusive TOTAL; `values.spend` stays in
            // living terms, so we display +loan and store the entered value −loan.
            const off = sustainable && pm.key === "spend" ? spendLoan : 0;
            return (
              <Field
                key={pm.key}
                label={pm.label}
                value={Math.min(Math.max(values[pm.key], effMin), effMax) + off}
                onChange={(v) => onParam(pm.key, v - off)}
                min={effMin + off}
                max={effMax + off}
                step={pm.step}
                prefix={pm.prefix}
                suffix={pm.suffix}
                hint={hint}
              />
            );
          })}
          {/* Live take-home hit while working (only shows when the lever moves it). */}
          {baseTakeHome > 0 && Math.round(delta.takeHomeNow) !== Math.round(baseTakeHome) && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs">
              <span className="text-muted">Take-home pay while working</span>
              <span className="tabular-nums">
                <span className="text-muted line-through">{fmtCurrency(baseTakeHome)}</span>{" "}
                <span className="text-muted">→</span>{" "}
                <span className={`font-semibold ${delta.takeHomeNow >= baseTakeHome ? "text-accent" : "text-amber-400"}`}>
                  {fmtCurrency(delta.takeHomeNow)}/yr
                </span>
              </span>
            </div>
          )}
          {/* The held (fixed) budget — essentials, plus any home loan — and the
              discretionary portion being flexed. */}
          {sustainable && (
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs">
              <span className="text-muted">
                {spendLoan > 0 ? "Essentials + home loan held: " : "Essentials held: "}
                <span className="font-semibold text-slate-300">
                  {fmtCurrency(sustainable.essentials + spendLoan)}/yr
                </span>
                {spendLoan > 0 && (
                  <span className="text-[10px] text-muted"> (incl. {fmtCurrency(spendLoan)} loan)</span>
                )}
              </span>
              <span className="text-muted">
                Discretionary:{" "}
                <span className="font-semibold text-slate-300">
                  {fmtCurrency(Math.max(0, values.spend - sustainable.essentials))}/yr
                </span>
              </span>
            </div>
          )}
          {guardrails && (
            <div className="space-y-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs">
              {/* Honest headline: the likelihood uplift at the CURRENT spend — not
                  the "safe start" ceiling, which is inflated because guardrails
                  achieve "lasting" by trimming. */}
              <div className="text-slate-300">
                At your <span className="font-semibold text-slate-200">{fmtCurrency(gCurrent)}/yr</span>, guardrails{" "}
                {guardrails.fixedPct == null || guardrails.flexPct == null ? (
                  <>
                    improve your odds of lasting
                    <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent align-middle" />
                  </>
                ) : guardrails.flexPct > guardrails.fixedPct + 1 ? (
                  <>
                    lift your odds from <span className="font-semibold text-amber-300">{guardrails.fixedPct}%</span> to{" "}
                    <span className="font-semibold text-accent">{guardrails.flexPct}%</span> likely to last — by easing spending in the bad years.
                  </>
                ) : (
                  <>
                    keep you ~<span className="font-semibold text-accent">{guardrails.flexPct}%</span> likely to last, and let your
                    spending flex up in the good years.
                  </>
                )}
              </div>
              {/* The safe-rate uplift flexible spending buys, with the trade-off. */}
              {guardrails.steadySafeRate != null &&
                guardrails.flexSafeRate != null &&
                guardrails.flexSafeRate > guardrails.steadySafeRate + 0.002 && (
                  <div className="border-t border-line pt-1.5 text-slate-300">
                    It lifts your <span className="text-sky-300">SWR</span> from{" "}
                    <span className="font-semibold text-sky-300">{(guardrails.steadySafeRate * 100).toFixed(1)}%</span> to a{" "}
                    <span className="font-semibold text-violet-300">flexible {(guardrails.flexSafeRate * 100).toFixed(1)}%</span>
                    {guardrails.steadySafeSpend != null && guardrails.flexSafeSpend != null && (
                      <>
                        {" "}
                        ({fmtCurrency(guardrails.steadySafeSpend + gLoan)} →{" "}
                        <span className="font-semibold text-violet-300">{fmtCurrency(guardrails.flexSafeSpend + gLoan)}/yr</span>)
                      </>
                    )}{" "}
                    — but this becomes a <em>starting</em> rate you&apos;d trim in rough markets, not a fixed draw.
                  </div>
                )}
              {/* The cost — or, for a well-funded plan, the upside. */}
              <div className="border-t border-line pt-1.5 text-slate-300">
                {guardrails.pending ? (
                  <span className="flex items-center gap-1.5 text-muted">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                    Sizing up the trade-off…
                  </span>
                ) : guardrails.outlook.worstCutPct < 0.01 ? (
                  <>Across the runs we tested, spending only ever rose — no cuts were triggered.</>
                ) : gRaises ? (
                  <>Good years raise you above your start; a rough run then {gTradeoff}</>
                ) : (
                  <>The trade-off: a rough run {gTradeoff}</>
                )}
              </div>
              {/* Only genuinely well-funded plans get the "start higher" invite — for
                  a stretched plan a higher start is just more austerity, not upside. */}
              {gHeadroom && gSafeStart != null && gSafeStart > gCurrent + 1_000 && (
                <div className="border-t border-line pt-1.5 text-slate-300">
                  You&apos;re comfortably funded — you could start as high as{" "}
                  <span className="font-semibold text-accent">{fmtCurrency(gSafeStart)}/yr</span> and stay ~
                  {guardrails.targetPct}% likely, mostly enjoying raises. Set it with the spending lever.
                  {guardrails.safePending && (
                    <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent align-middle" />
                  )}
                </div>
              )}
              <div className="flex items-center justify-between gap-2 pt-0.5">
                {guardrails.outlook.downturnPath.length > 2 ? (
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-[10px] text-muted" title="Your spending through a retire-into-a-downturn stress test — the same run as the modal">In a rough run</span>
                    <Sparkline
                      series={[guardrails.outlook.downturnPath.map((p) => ({ age: p.age, v: p.spend + gLoan }))]}
                      colors={["#34d399"]}
                      width={180}
                      height={34}
                    />
                  </div>
                ) : (
                  <span />
                )}
                {onTimeline && (
                  <button
                    type="button"
                    onClick={onTimeline}
                    className="shrink-0 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent transition hover:bg-accent/20"
                  >
                    See how guardrails work →
                  </button>
                )}
              </div>
            </div>
          )}
          {sustainable && (
            <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs">
              {/* Withdrawal rate at the chosen spend, on the dashboard's 0–10% band
                  bar (4% anchor + live white marker + ▲ your safe rate). The same
                  Safe-Withdrawal-Rate lens as the dashboard, so the two agree. */}
              {wr && (
                <div className="mb-1.5 border-b border-line pb-2">
                  <div className="mb-1.5 flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-muted">That&apos;s a</span>
                    <span className={`font-semibold tabular-nums ${WR_TONE[wr.band.tone]}`}>{wr.pct}%</span>
                    <span className="text-muted">withdrawal rate</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${WR_BADGE[wr.band.tone]}`}>
                      {wr.band.label}
                    </span>
                  </div>
                  <div className="relative h-2 w-full overflow-hidden rounded-full">
                    <div className="absolute inset-0 flex">
                      <div className="h-full bg-emerald-500/60" style={{ width: "40%" }} />
                      <div className="h-full bg-amber-500/60" style={{ width: "20%" }} />
                      <div className="h-full bg-red-500/60" style={{ width: "40%" }} />
                    </div>
                    {/* Classic 4% anchor */}
                    <div className="absolute inset-y-0 w-px bg-white/40" style={{ left: "40%" }} />
                    {/* Live marker at the chosen spend's rate */}
                    <div
                      className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-[left] duration-150"
                      style={{ left: `${wr.marker}%` }}
                    />
                  </div>
                  {/* ▲ your steady safe rate (sky) + flexible-spending rate (violet) */}
                  {safeRateMarker != null && (
                    <div className="relative mt-px h-2.5">
                      <span
                        className="absolute top-0 -translate-x-1/2 text-[10px] leading-none text-sky-400"
                        style={{ left: `${safeRateMarker}%` }}
                        aria-hidden
                      >
                        ▲
                      </span>
                      {flexRateMarker != null && (
                        <span
                          className="absolute top-0 -translate-x-1/2 text-[10px] leading-none text-violet-400"
                          style={{ left: `${flexRateMarker}%` }}
                          aria-hidden
                        >
                          ▲
                        </span>
                      )}
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted">
                    <span><span className="font-semibold text-emerald-400">≤4%</span> safe</span>
                    <span><span className="font-semibold text-amber-400">4–6%</span> moderate</span>
                    <span><span className="font-semibold text-red-400">&gt;6%</span> high</span>
                    {safeRatePct != null && (
                      <span className="flex items-center gap-1 text-sky-300">
                        <span aria-hidden>▲</span> SWR ~{safeRatePct}%{sustainable.safePending ? " …" : ""}
                      </span>
                    )}
                    {flexSafePct != null && (
                      <span className="flex items-center gap-1 text-violet-300">
                        <span aria-hidden>▲</span> flexible SWR ~{flexSafePct}%
                      </span>
                    )}
                  </div>
                </div>
              )}
              {/* Likelihood at the current spend (anchor) → at the chosen spend */}
              <div className="mb-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 border-b border-line pb-1.5">
                <span className="text-muted">Chance of lasting to {sustainable.life}:</span>
                {sustainable.startedPct != null ? (
                  <>
                    <span className="font-semibold tabular-nums text-slate-200">{sustainable.startedPct}%</span>
                    <span className="text-[10px] text-muted">at your current spend</span>
                    {sustainable.nowPct != null && sustainable.nowPct !== sustainable.startedPct && (
                      <>
                        <span className="text-muted">→</span>
                        <span className={`font-semibold tabular-nums ${sustainable.nowPct >= sustainable.startedPct ? "text-accent" : "text-amber-400"}`}>
                          {sustainable.nowPct}%
                        </span>
                        <span className="text-[10px] text-muted">at the spend you&apos;ve set</span>
                      </>
                    )}
                  </>
                ) : (
                  <span className="text-muted">…</span>
                )}
                {sustainable.likelihoodPending && (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-label="updating" />
                )}
              </div>
              {sustainable.safe == null && sustainable.safePending ? (
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  Finding your safe spend…
                </span>
              ) : sustainable.safe != null && sustainable.safe <= 10_000 ? (
                <span className="text-amber-400">
                  Even minimal spending is under {sustainable.targetPct}% likely to last to {sustainable.life} — try other
                  levers first.
                </span>
              ) : sustainable.safe != null ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-300">
                      Safe spend: up to{" "}
                      <span className="font-semibold text-accent">{fmtCurrency(sustainable.safe + spendLoan)}/yr</span> — about{" "}
                      {sustainable.targetPct}% likely to last to {sustainable.life}.
                      {sustainable.safePending && (
                        <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent align-middle" />
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={sustainable.onSetSafe}
                      className="shrink-0 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 font-semibold text-accent transition hover:bg-accent/20"
                    >
                      Set to safe
                    </button>
                  </div>
                  <div className="mt-1 text-[11px] text-muted">
                    On steady average returns it stretches to ~{fmtCurrency(sustainable.stretch + spendLoan)}/yr, but with little
                    buffer for market swings.
                  </div>
                  {values.spend > sustainable.safe + 500 && (
                    <div className="mt-1 text-amber-400">
                      Above your safe spend — &ldquo;Likely to last&rdquo; falls from here.
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
          {/* Note + assumptions sit at the very bottom, consistent with every
              other strategy card (this card's analysis box comes just above). */}
          {card.note && (
            <div className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/[0.06] px-4 py-3 text-xs leading-relaxed text-slate-200 shadow-sm ring-1 ring-inset ring-white/5">
              {/* RetireWiz mark. The artwork sits on solid black — mix-blend
                  'lighten' drops that against the card, like the header logo. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/whatif-icon.png"
                alt=""
                aria-hidden
                className="mt-0.5 h-9 w-9 shrink-0"
                style={{ mixBlendMode: "lighten" }}
              />
              <span>{spendNote ?? card.note(values)}</span>
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onAssumptions}
              className="text-[11px] font-medium text-muted underline-offset-2 transition hover:text-accent hover:underline"
            >
              🔍 Assumptions used in this strategy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
