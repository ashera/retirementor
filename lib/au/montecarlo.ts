// Monte Carlo layer over the deterministic engine. Instead of one fixed return
// every year, we run the plan across many random return sequences to expose
// SEQUENCING RISK (a bad run of returns early in retirement does far more damage
// than the same run late) and report a success probability + a fan of outcomes.

import { simulate } from "./simulate";
import type { EngineConfig } from "./config";
import type { RetirementPlan } from "./types";

/** Deterministic PRNG so results are stable across renders (only change with the plan). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One standard-normal draw via Box–Muller. */
function normal(rand: () => number, mean: number, sd: number): number {
  const u1 = Math.max(1e-9, rand());
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + sd * z;
}

export interface FanPoint {
  age: number;
  p10: number; // pessimistic total balance
  p50: number; // median
  p90: number; // optimistic
  solvent: number; // fraction of runs that still have savings at this age (0–1)
}

export interface MonteCarloResult {
  iterations: number;
  successRate: number; // fraction of runs that fund spending to life expectancy
  fan: FanPoint[]; // percentile balance paths by age
  medianDepletionAge: number | null; // median age money runs short among failures
  worstCaseDepletionAge: number | null; // 10th-percentile (early) depletion age
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
  opts?: { iterations?: number; seed?: number },
): MonteCarloResult {
  const iterations = opts?.iterations ?? 1000;
  const rand = mulberry32(opts?.seed ?? 0x9e3779b9);
  const mean = plan.investmentReturn;
  const sd = Math.max(0, plan.returnVolatility);

  const startOldest = Math.max(...plan.people.map((p) => p.currentAge));
  const horizon = Math.max(0, Math.round(plan.lifeExpectancy - startOldest));

  // totalsByYear[t] collects the total balance at each age across all runs.
  const totalsByYear: number[][] = Array.from({ length: horizon + 1 }, () => []);
  const depletionAges: number[] = [];
  let successes = 0;

  for (let iter = 0; iter < iterations; iter++) {
    const returns = new Array(horizon + 1);
    for (let t = 0; t <= horizon; t++) returns[t] = normal(rand, mean, sd);

    const r = simulate(plan, config, returns);
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

  const depSorted = depletionAges.slice().sort((a, b) => a - b);

  return {
    iterations,
    successRate: successes / iterations,
    fan,
    medianDepletionAge: depSorted.length ? percentile(depSorted, 50) : null,
    worstCaseDepletionAge: depSorted.length ? percentile(depSorted, 10) : null,
  };
}
