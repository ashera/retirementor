// The "Rich, Broke or Dead" lens: weight the Monte-Carlo depletion distribution by
// the probability of being alive, so a deep-tail shortfall is discounted by how
// unlikely you are to be there to see it. Pure display maths — no engine change.

import type { MonteCarloResult } from "./montecarlo";
import type { SurvivalPoint } from "./mortality";

export interface RbdPoint {
  age: number; // oldest-person age (same axis as the balance / fan charts)
  dead: number; // P(not alive at this age)
  broke: number; // P(alive AND the plan has depleted by this age)
  solvent: number; // P(alive AND money still lasting) — dead+broke+solvent = 1
}

export interface SurvivalLens {
  points: RbdPoint[];
  outliveMoneyRisk: number; // P(alive at the moment the money runs out) — the honest tail risk
  fixedFailRate: number; // the plain MC failure rate (ignores mortality), for contrast
  medianAgeAtDeath: number | null; // oldest-age where household survival crosses 50%
}

/** Combine a Monte-Carlo run distribution with a survival curve (single or household,
 *  keyed by the oldest person's age). */
export function survivalLens(mc: MonteCarloResult, survival: SurvivalPoint[]): SurvivalLens {
  const N = Math.max(1, mc.iterations);
  const dep = mc.depletionAges.slice().sort((a, b) => a - b);
  const first = survival[0];
  const last = survival[survival.length - 1];

  // Fraction of runs depleted BY `age` (empirical CDF via binary search).
  const F = (age: number): number => {
    let lo = 0;
    let hi = dep.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (dep[m] <= age) lo = m + 1;
      else hi = m;
    }
    return lo / N;
  };
  const sByAge = new Map(survival.map((p) => [p.age, p.p]));
  const S = (age: number): number => {
    if (!first) return 0;
    if (age <= first.age) return first.p;
    if (age >= last.age) return last.p;
    return sByAge.get(age) ?? 0;
  };

  const points: RbdPoint[] = survival.map((pt) => {
    const s = pt.p;
    const f = F(pt.age);
    return { age: pt.age, dead: 1 - s, broke: s * f, solvent: s * (1 - f) };
  });

  // Honest tail risk: over ALL runs, the chance you were still alive when the money
  // ran out (failed runs contribute S(depletionAge); successful runs contribute 0).
  const outliveMoneyRisk = dep.reduce((sum, d) => sum + S(d), 0) / N;

  // Median age at (last) death — first age household survival dips to 50%.
  let medianAgeAtDeath: number | null = null;
  for (const pt of survival) {
    if (pt.p <= 0.5) {
      medianAgeAtDeath = pt.age;
      break;
    }
  }

  return { points, outliveMoneyRisk, fixedFailRate: 1 - mc.successRate, medianAgeAtDeath };
}
