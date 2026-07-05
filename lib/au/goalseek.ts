// Goal-seek: "what will it take?" — reverse the engine to find the single-lever
// change (spend less, save more, retire later) that makes the plan fund spending
// to life expectancy on the central (deterministic) projection. Fast: each solve
// is a handful of deterministic simulate() calls via binary search.

import { simulate } from "./simulate";
import { lifestageBreakdown } from "./lifestages";
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

// ── Essentials-protected spending trim ───────────────────────────────────────

const floorTo = (v: number, step: number) => Math.max(0, Math.floor(v / step) * step);

export interface TrimStageView {
  key: string;
  ageFrom: number;
  ageTo: number;
  discBefore: number;
  discAfter: number;
  totalBefore: number; // living (essentials + discretionary), before
  totalAfter: number; // living, after
}

export interface SpendingTrim {
  applicable: boolean; // the plan doesn't already last, so a trim is relevant
  feasible: boolean; // cutting discretionary (down to the essentials floor) can make it last
  essentials: number; // the flat essentials floor — held constant, never trimmed
  essentialsEstimated: boolean; // true when estimated from ASFA (no user budget)
  discretionaryKeptPct: number; // 0–100, share of discretionary retained after the trim
  loanCost: number; // ongoing home-loan cost, left untouched
  patch: Partial<RetirementPlan>; // the spending change to apply (meaningful when feasible)
  stages: TrimStageView[]; // one row (flat) or three (staged)
  depletedAgeIfEssentialsOnly: number | null; // when infeasible: where essentials-only still runs out
}

/**
 * Trim the budget so it lasts to life expectancy by cutting ONLY the
 * discretionary spend and holding the essentials floor flat. Essentials come
 * from the user's budget (or an ASFA estimate); each stage is
 * `essentials + d × discretionary`, and we solve for the largest `d` that still
 * lasts. If even `d = 0` (essentials only) can't last, the trim is infeasible —
 * a signal that saving more / retiring later is needed, not belt-tightening.
 */
export function trimSpending(plan: RetirementPlan, config: EngineConfig): SpendingTrim {
  const bd = lifestageBreakdown(plan, config);
  const essentials = bd.essentials;
  const staged = bd.staged;
  const s = plan.spendingStages;

  const scaleDisc = (living: number, d: number) => essentials + d * Math.max(0, living - essentials);
  const planAt = (d: number): RetirementPlan =>
    staged
      ? { ...plan, spendingStages: { ...s, goGo: scaleDisc(s.goGo, d), slowGo: scaleDisc(s.slowGo, d), noGo: scaleDisc(s.noGo, d) } }
      : { ...plan, targetSpending: scaleDisc(plan.targetSpending, d) };

  const applicable = !lasts(plan, config);
  const d = solveThreshold((dd) => lasts(planAt(dd), config), 0, 1, false, 0.004);
  const feasible = applicable && d != null;
  const dd = d ?? 0;

  // Applied amounts: discretionary cut to fraction dd, floored to $100 (so it
  // sits at/under the boundary and genuinely lasts). Essentials are a $100
  // multiple already, so the total never dips below the essentials floor.
  const trimmedLiving = (living: number) => floorTo(scaleDisc(living, dd), 100);

  const stages: TrimStageView[] = bd.rows.map((r) => {
    const totalAfter = feasible ? trimmedLiving(r.living) : essentials;
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

  const patch: Partial<RetirementPlan> = staged
    ? { spendingStages: { ...s, goGo: trimmedLiving(s.goGo), slowGo: trimmedLiving(s.slowGo), noGo: trimmedLiving(s.noGo) } }
    : { targetSpending: trimmedLiving(plan.targetSpending) };

  return {
    applicable,
    feasible,
    essentials,
    essentialsEstimated: bd.estimated,
    discretionaryKeptPct: Math.round(dd * 100),
    loanCost: bd.goal.loanCost,
    patch,
    stages,
    depletedAgeIfEssentialsOnly: simulate(planAt(0), config).depletedAge,
  };
}
