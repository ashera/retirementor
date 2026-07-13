// Monte Carlo layer over the deterministic engine. Instead of one fixed return
// every year, we run the plan across many random return sequences to expose
// SEQUENCING RISK (a bad run of returns early in retirement does far more damage
// than the same run late) and report a success probability + a fan of outcomes.

import { simulate } from "./simulate";
import { bootstrapRealPath } from "./historicalReturns";
import { householdRetirementOffset } from "./types";
import type { EngineConfig } from "./config";
import type { RetirementPlan } from "./types";

/** Deterministic PRNG so results are stable across renders (only change with the plan). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One standard-normal draw via Box–Muller. */
export function standardNormal(rand: () => number): number {
  const u1 = Math.max(1e-9, rand());
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export interface FanPoint {
  age: number;
  p10: number; // pessimistic total balance
  p50: number; // median
  p90: number; // optimistic
  solvent: number; // fraction of runs that still have savings at this age (0–1)
}

// A "prudent" spend recommendation is the most you can spend while your Monte
// Carlo success rate still clears this bar — shared so every "how much can I
// safely spend?" answer (What-If safe spend, Help-me-spend-more) uses one target.
export const MC_CONFIDENCE_TARGET = 0.85;
// Use the SAME seed as runMonteCarlo's default (0x9e3779b9) so the goal-seek /
// trim / boost numbers line up with the dashboard "How likely" card for the same
// plan — a different seed made them disagree by several points on the same plan.
// Fewer iterations (300 vs the dashboard's 1000) keeps the many binary-search
// evaluations fast; that only leaves ~1pp of sampling noise between the two.
export const MC_CONFIDENCE_MC = { iterations: 300, seed: 0x9e3779b9 } as const;

export interface MonteCarloResult {
  iterations: number;
  successRate: number; // fraction of runs that fund spending to life expectancy
  fan: FanPoint[]; // percentile balance paths by age
  medianDepletionAge: number | null; // median age money runs short among failures
  worstCaseDepletionAge: number | null; // 10th-percentile (early) depletion age
  centralTerminalBalance: number; // deterministic ending balance at life expectancy (the central projection)
  medianTerminalBalance: number; // typical (p50) ending balance across runs
  aheadRate: number; // fraction of runs ending ahead of the central projection
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.round((p / 100) * (sortedAsc.length - 1))),
  );
  return sortedAsc[idx];
}

export function runMonteCarlo(
  plan: RetirementPlan,
  config: EngineConfig,
  opts?: { iterations?: number; seed?: number; model?: "gaussian" | "bootstrap"; blockYears?: number },
): MonteCarloResult {
  const iterations = opts?.iterations ?? 1000;
  const rand = mulberry32(opts?.seed ?? 0x9e3779b9);
  // Return model: "gaussian" draws each year independently (default); "bootstrap"
  // resamples contiguous blocks of real historical returns, preserving the
  // mean-reversion/clustering that makes long-horizon Gaussian draws too pessimistic.
  const bootstrap = opts?.model === "bootstrap";
  const mean = plan.investmentReturn;
  const sd = Math.max(0, plan.returnVolatility);
  // Outside-super money may carry its own return/volatility (e.g. cash). Each pool
  // shares the SAME market shock z each year (perfect correlation — super and
  // outside investments move together) but scales it by its own volatility, so a
  // low-return, low-vol outside pool stays stable like cash. Both default to super.
  const outsideMean = plan.outsideReturn ?? plan.investmentReturn;
  const outsideSd = Math.max(0, plan.outsideVolatility ?? plan.returnVolatility);
  const splitPools = outsideMean !== mean || outsideSd !== sd;

  const startOldest = Math.max(...plan.people.map((p) => p.currentAge));
  const horizon = Math.max(0, Math.round(plan.lifeExpectancy - startOldest));

  // totalsByYear[t] collects the total balance at each age across all runs.
  const totalsByYear: number[][] = Array.from({ length: horizon + 1 }, () => []);
  const depletionAges: number[] = [];
  let successes = 0;

  // Bootstrap supplies REAL returns; re-inflate by the plan's CPI so simulate's own
  // deflation recovers them (and pension/wage indexing stay on the plan's inflation).
  const cpiFactor = 1 + plan.inflation / 100;

  for (let iter = 0; iter < iterations; iter++) {
    const returns = new Array(horizon + 1);
    const outsideReturns = splitPools ? new Array(horizon + 1) : undefined;
    if (bootstrap) {
      // All-equity historical path shared by both pools (a cash/bond sleeve would
      // need its own series — a later addition).
      const real = bootstrapRealPath(rand, horizon, opts?.blockYears);
      for (let t = 0; t <= horizon; t++) {
        const nom = ((1 + real[t]) * cpiFactor - 1) * 100;
        returns[t] = nom;
        if (outsideReturns) outsideReturns[t] = nom;
      }
    } else {
      for (let t = 0; t <= horizon; t++) {
        const z = standardNormal(rand);
        returns[t] = mean + sd * z;
        if (outsideReturns) outsideReturns[t] = outsideMean + outsideSd * z;
      }
    }

    const r = simulate(plan, config, returns, outsideReturns);
    if (r.lastsToLifeExpectancy) successes++;
    else if (r.depletedAge !== null) depletionAges.push(r.depletedAge);

    for (const row of r.rows) {
      const t = row.age - startOldest;
      if (t >= 0 && t <= horizon) totalsByYear[t].push(row.total);
    }
  }

  const fan: FanPoint[] = totalsByYear.map((vals, t) => {
    const sorted = vals.slice().sort((a, b) => a - b);
    return {
      age: startOldest + t,
      p10: percentile(sorted, 10),
      p50: percentile(sorted, 50),
      p90: percentile(sorted, 90),
      solvent: vals.length ? vals.filter((v) => v > 1).length / vals.length : 1,
    };
  });

  // RG 276 two-stage deflation: accumulation-year balances are in WAGE-deflated
  // today's dollars, retirement onward in CPI-deflated dollars. The engine rebases
  // the stock at the retirement boundary, which — plotted raw — makes the fan step
  // up ~50% right at retirement. The balance chart already lifts the accumulation
  // years onto the CPI basis for one smooth line (RetirementChart.cpiBasis); do the
  // same here so the fan agrees. The rebase is a single deterministic factor per
  // year, so scaling each percentile is exact and touches no success/solvency math.
  const step = (1 + (plan.inflation + (config.livingStandardsGrowthPct ?? 0)) / 100) / (1 + plan.inflation / 100);
  const accumYears = householdRetirementOffset(plan); // t < accumYears is still accumulation
  if (Math.abs(step - 1) > 1e-9) {
    for (let t = 1; t < Math.min(fan.length, accumYears); t++) {
      const f = Math.pow(step, t);
      fan[t].p10 *= f;
      fan[t].p50 *= f;
      fan[t].p90 *= f;
    }
  }

  const depSorted = depletionAges.slice().sort((a, b) => a - b);

  // "Ahead / behind your plan": compare each run's ending balance to the
  // deterministic central projection (constant mean return every year). Because
  // of volatility drag, the typical run usually finishes BELOW the smooth-return
  // line — so this exposes how optimistic the single central estimate is.
  // No sequences → each pool uses its own deterministic mean (super = mean,
  // outside = outsideMean), which is exactly the central projection.
  const central = simulate(plan, config);
  const centralTerminalBalance = central.rows.length
    ? central.rows[central.rows.length - 1].total
    : 0;
  const terminals = totalsByYear[horizon] ?? [];
  const terminalsSorted = terminals.slice().sort((a, b) => a - b);
  const aheadRate = terminals.length
    ? terminals.filter((v) => v > centralTerminalBalance).length / terminals.length
    : 0;

  return {
    iterations,
    successRate: successes / iterations,
    fan,
    medianDepletionAge: depSorted.length ? percentile(depSorted, 50) : null,
    worstCaseDepletionAge: depSorted.length ? percentile(depSorted, 10) : null,
    centralTerminalBalance,
    medianTerminalBalance: percentile(terminalsSorted, 50),
    aheadRate,
  };
}
