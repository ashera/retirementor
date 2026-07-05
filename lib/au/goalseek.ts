// Goal-seek: "what will it take?" — reverse the engine to find the single-lever
// change (spend less, save more, retire later) that makes the plan fund spending
// to life expectancy on the central (deterministic) projection. Fast: each solve
// is a handful of deterministic simulate() calls via binary search.

import { simulate } from "./simulate";
import { lifestageBreakdown } from "./lifestages";
import { budgetToStages, budgetTotal, isEssential } from "./budget";
import type { EngineConfig } from "./config";
import type { RetirementPlan } from "./types";

/**
 * Find the threshold value of a lever where `evaluate` flips to true.
 * increasing=true  → evaluate becomes true as v rises (savings, retirement age): returns the smallest v that works.
 * increasing=false → evaluate becomes true as v falls (spending): returns the largest v that works.
 * Returns null if the goal can't be met anywhere in [lo, hi].
 */
function solveThreshold(
  evaluate: (v: number) => boolean,
  lo: number,
  hi: number,
  increasing: boolean,
  tol: number,
): number | null {
  if (increasing) {
    if (evaluate(lo)) return lo;
    if (!evaluate(hi)) return null;
    let a = lo;
    let b = hi;
    for (let i = 0; i < 40 && b - a > tol; i++) {
      const m = (a + b) / 2;
      if (evaluate(m)) b = m;
      else a = m;
    }
    return b;
  }
  if (evaluate(hi)) return hi;
  if (!evaluate(lo)) return null;
  let a = lo;
  let b = hi;
  for (let i = 0; i < 40 && b - a > tol; i++) {
    const m = (a + b) / 2;
    if (evaluate(m)) a = m;
    else b = m;
  }
  return a;
}

export interface WhatWillItTake {
  lasts: boolean; // does the current plan last to life expectancy (deterministic)?
  currentSpend: number; // the primary spend figure (flat target or go-go)
  currentRetireAge: number;
  currentSavings: number;
  maxSpend: number | null; // highest sustainable spend
  extraSavings: number | null; // extra annual outside-super savings needed (0 if none)
  retireAge: number | null; // earliest/needed retirement age to last
}

const lasts = (plan: RetirementPlan, config: EngineConfig) =>
  simulate(plan, config).lastsToLifeExpectancy;

export function whatWillItTake(
  plan: RetirementPlan,
  config: EngineConfig,
): WhatWillItTake {
  const isStaged = plan.spendingMode === "stages";
  const currentSpend = isStaged ? plan.spendingStages.goGo : plan.targetSpending;

  // Scale all spending by a factor (keeps the staged shape).
  const withSpendScale = (f: number): RetirementPlan =>
    isStaged
      ? {
          ...plan,
          spendingStages: {
            ...plan.spendingStages,
            goGo: plan.spendingStages.goGo * f,
            slowGo: plan.spendingStages.slowGo * f,
            noGo: plan.spendingStages.noGo * f,
          },
        }
      : { ...plan, targetSpending: plan.targetSpending * f };

  const maxFactor = solveThreshold(
    (f) => lasts(withSpendScale(f), config),
    0.2,
    3,
    false,
    0.004,
  );
  // Floor so the suggested spend is at/under the true boundary (i.e. it actually lasts).
  const maxSpend =
    maxFactor != null ? Math.floor((currentSpend * maxFactor) / 1000) * 1000 : null;

  const minSavings = solveThreshold(
    (v) => lasts({ ...plan, annualOutsideSavings: v }, config),
    0,
    plan.annualOutsideSavings + 200_000,
    true,
    250,
  );
  // Ceil so the suggested extra saving is genuinely enough to make it last.
  const extraSavings =
    minSavings != null
      ? Math.max(0, Math.ceil((minSavings - plan.annualOutsideSavings) / 500) * 500)
      : null;

  const minRetireAge = solveThreshold(
    (v) => lasts({ ...plan, retirementAge: Math.round(v) }, config),
    Math.min(plan.retirementAge, 45),
    75,
    true,
    0.5,
  );
  const retireAge = minRetireAge != null ? Math.ceil(minRetireAge) : null;

  return {
    lasts: lasts(plan, config),
    currentSpend,
    currentRetireAge: plan.retirementAge,
    currentSavings: plan.annualOutsideSavings,
    maxSpend,
    extraSavings,
    retireAge,
  };
}

// ── Essentials-protected spend levers (trim & boost) ─────────────────────────

const floorTo = (v: number, step: number) => Math.max(0, Math.floor(v / step) * step);

export interface SpendStageView {
  key: string;
  ageFrom: number;
  ageTo: number;
  discBefore: number;
  discAfter: number;
  totalBefore: number; // living (essentials + discretionary), before
  totalAfter: number; // living, after
}
export type TrimStageView = SpendStageView;

interface DiscretionaryScaler {
  bd: ReturnType<typeof lifestageBreakdown>;
  essentials: number;
  staged: boolean;
  planAt: (d: number) => RetirementPlan; // full plan at discretionary fraction d
  patchAt: (d: number) => Partial<RetirementPlan>; // the change to apply at d
}

/**
 * Shared machinery for the two essentials-protected spend levers. It holds the
 * essentials floor flat and scales ONLY discretionary by a fraction `d`: `d < 1`
 * trims discretionary (make it last), `d > 1` boosts it (spend the headroom).
 *
 * With a built budget it scales the DISCRETIONARY budget categories (essentials
 * untouched) and re-derives spending from them, so the returned patch keeps
 * `plan.budget` in lockstep with the spending it applies — builder and engine
 * never disagree. Without a budget it scales the living amounts around the
 * essentials floor.
 */
function discretionaryScaler(plan: RetirementPlan, config: EngineConfig): DiscretionaryScaler {
  const bd = lifestageBreakdown(plan, config);
  const essentials = bd.essentials;
  const staged = bd.staged;
  const s = plan.spendingStages;
  const budget = plan.budget;

  const scaleCategories = (d: number): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(budget!.categories)) {
      out[k] = isEssential(k) ? v : Math.round(v * d);
    }
    return out;
  };
  const scaleDisc = (living: number, d: number) => essentials + d * Math.max(0, living - essentials);

  const planAt = (d: number): RetirementPlan => {
    if (budget) {
      const categories = scaleCategories(d);
      const applyPhases = budget.applyPhases;
      const next: RetirementPlan = {
        ...plan,
        budget: { ...budget, categories },
        targetSpending: budgetTotal(categories),
        spendingMode: applyPhases ? "stages" : "flat",
      };
      if (applyPhases) next.spendingStages = budgetToStages(config, categories);
      return next;
    }
    return staged
      ? { ...plan, spendingStages: { ...s, goGo: scaleDisc(s.goGo, d), slowGo: scaleDisc(s.slowGo, d), noGo: scaleDisc(s.noGo, d) } }
      : { ...plan, targetSpending: scaleDisc(plan.targetSpending, d) };
  };

  const patchAt = (d: number): Partial<RetirementPlan> => {
    if (budget) {
      const categories = scaleCategories(d);
      const applyPhases = budget.applyPhases;
      return {
        budget: { ...budget, categories },
        targetSpending: budgetTotal(categories),
        spendingMode: applyPhases ? "stages" : "flat",
        ...(applyPhases ? { spendingStages: budgetToStages(config, categories) } : {}),
      };
    }
    // Floor the applied living to the $100 below the boundary so it stays on the
    // safe side (still lasts when trimming; still just-lasts when boosting).
    const scaledLiving = (living: number) => floorTo(scaleDisc(living, d), 100);
    return staged
      ? { spendingStages: { ...s, goGo: scaledLiving(s.goGo), slowGo: scaledLiving(s.slowGo), noGo: scaledLiving(s.noGo) } }
      : { targetSpending: scaledLiving(plan.targetSpending) };
  };

  return { bd, essentials, staged, planAt, patchAt };
}

// Read the applied per-stage living from a patch (stages when phased, else the
// flat target for the single row).
function livingReader(patch: Partial<RetirementPlan>): (key: string) => number {
  const st = patch.spendingStages;
  const target = patch.targetSpending;
  return (key: string) => {
    if (st) return key === "Go-go" ? st.goGo : key === "Slow-go" ? st.slowGo : st.noGo;
    return target ?? 0;
  };
}

export interface SpendingTrim {
  applicable: boolean; // the plan doesn't already last, so a trim is relevant
  feasible: boolean; // cutting discretionary (down to the essentials floor) can make it last
  essentials: number; // the flat essentials floor — held constant, never trimmed
  essentialsEstimated: boolean; // true when estimated from ASFA (no user budget)
  discretionaryKeptPct: number; // 0–100, share of discretionary retained after the trim
  loanCost: number; // ongoing home-loan cost, left untouched
  patch: Partial<RetirementPlan>; // the spending change to apply (meaningful when feasible)
  stages: SpendStageView[]; // one row (flat) or three (staged)
  depletedAgeIfEssentialsOnly: number | null; // when infeasible: where essentials-only still runs out
}

/**
 * Trim the budget so it lasts to life expectancy by cutting ONLY discretionary
 * and holding the essentials floor flat. Each stage is `essentials + d ×
 * discretionary`; we solve for the largest `d ≤ 1` that still lasts. If even
 * `d = 0` (essentials only) can't last, the trim is infeasible — a signal that
 * saving more / retiring later is needed, not belt-tightening.
 */
export function trimSpending(plan: RetirementPlan, config: EngineConfig): SpendingTrim {
  const sc = discretionaryScaler(plan, config);
  const { bd, essentials } = sc;

  const applicable = !lasts(plan, config);
  const d = solveThreshold((dd) => lasts(sc.planAt(dd), config), 0, 1, false, 0.004);
  const feasible = applicable && d != null;
  const dd = d ?? 0;
  const patch = sc.patchAt(dd);

  const afterLiving = livingReader(patch);
  const stages: SpendStageView[] = bd.rows.map((r) => {
    const totalAfter = feasible ? afterLiving(r.key) : essentials;
    return {
      key: r.key,
      ageFrom: r.ageFrom,
      ageTo: r.ageTo,
      discBefore: r.discretionary,
      discAfter: Math.max(0, totalAfter - essentials),
      totalBefore: r.living,
      totalAfter,
    };
  });

  return {
    applicable,
    feasible,
    essentials,
    essentialsEstimated: bd.estimated,
    discretionaryKeptPct: Math.round(dd * 100),
    loanCost: bd.goal.loanCost,
    patch,
    stages,
    depletedAgeIfEssentialsOnly: simulate(sc.planAt(0), config).depletedAge,
  };
}

// ── Essentials-protected spending boost (the mirror of trim) ─────────────────

export interface SpendingBoost {
  applicable: boolean; // the plan already lasts, so there may be headroom to spend
  hasHeadroom: boolean; // discretionary can rise meaningfully and still last
  allEssentials: boolean; // no discretionary line to grow (won't inflate essentials)
  essentials: number; // the flat essentials floor — held constant, never inflated
  essentialsEstimated: boolean; // true when estimated from ASFA (no user budget)
  discretionaryUpliftPct: number; // % more discretionary after the boost (e.g. 60 = +60%)
  loanCost: number; // ongoing home-loan cost, left untouched
  patch: Partial<RetirementPlan>; // the spending change to apply (meaningful when hasHeadroom)
  stages: SpendStageView[]; // one row (flat) or three (staged)
  extraPerYear: number; // increase in the headline (go-go / flat) living spend
  newHeadlineLiving: number; // headline living after the boost
  lastsAfter: boolean; // the boosted plan still lasts to life expectancy
  depletedAgeAfter: number | null; // where the boosted plan runs out, if it does
}

/**
 * Raise the budget to the most it can sustainably afford by growing ONLY
 * discretionary and holding the essentials floor flat — the exact inverse of
 * {@link trimSpending}. Applicable when the plan already lasts (there's
 * headroom). Solves for the largest `d ≥ 1` where the plan still funds spending
 * to life expectancy. We won't inflate essentials automatically, so if the
 * budget is all essentials (no discretionary to grow) it reports `allEssentials`
 * rather than padding the floor — mirroring trim's refusal to cut into it.
 */
export function boostSpending(plan: RetirementPlan, config: EngineConfig): SpendingBoost {
  const sc = discretionaryScaler(plan, config);
  const { bd, essentials } = sc;

  const applicable = lasts(plan, config);
  const headlineDisc = bd.rows[0]?.discretionary ?? 0;
  const canGrow = applicable && headlineDisc > 1;

  // Largest discretionary multiple (≥1) that still lasts. d = 1 lasts by
  // definition when `applicable`, so this only ever grows spending.
  const DMAX = 12;
  const solved = canGrow ? solveThreshold((dd) => lasts(sc.planAt(dd), config), 1, DMAX, false, 0.004) : null;
  const d = solved ?? 1;
  const patch = canGrow ? sc.patchAt(d) : {};
  const after = canGrow ? simulate({ ...plan, ...patch }, config) : null;

  const afterLiving = livingReader(patch);
  const stages: SpendStageView[] = bd.rows.map((r) => {
    const totalAfter = canGrow ? afterLiving(r.key) : r.living;
    return {
      key: r.key,
      ageFrom: r.ageFrom,
      ageTo: r.ageTo,
      discBefore: r.discretionary,
      discAfter: Math.max(0, totalAfter - essentials),
      totalBefore: r.living,
      totalAfter,
    };
  });

  const headline = stages[0];
  const extraPerYear = headline ? Math.max(0, headline.totalAfter - headline.totalBefore) : 0;
  const hasHeadroom = canGrow && extraPerYear >= 500;

  return {
    applicable,
    hasHeadroom,
    allEssentials: applicable && headlineDisc <= 1,
    essentials,
    essentialsEstimated: bd.estimated,
    discretionaryUpliftPct: Math.round((d - 1) * 100),
    loanCost: bd.goal.loanCost,
    patch,
    stages,
    extraPerYear,
    newHeadlineLiving: headline?.totalAfter ?? 0,
    lastsAfter: after ? after.lastsToLifeExpectancy : true,
    depletedAgeAfter: after ? after.depletedAge : null,
  };
}
