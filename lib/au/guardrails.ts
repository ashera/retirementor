// Outlook for a guardrails (flexible-spending) plan: the honest downside a fixed
// safe-spend can't show. It runs the plan across random return sequences (the same
// split-pool sampling the main Monte Carlo uses) and summarises how deep and how
// often spending would be trimmed — plus the central (steady-return) spend path
// for a sparkline. Only meaningful when plan.guardrails is set.

import { simulate } from "./simulate";
import { mulberry32, standardNormal } from "./montecarlo";
import type { EngineConfig } from "./config";
import type { RetirementPlan } from "./types";

export interface GuardrailsOutlook {
  startSpend: number; // living-spend in the first retired year (the reference)
  worstCutPct: number; // in a rough (p10) run, how far below the start spending is trimmed (fraction)
  worstCutSpend: number; // the trimmed living-spend in that run (today's $)
  yearsBelowBad: number; // in a rough run, how many retirement years are spent below the start
  everRaises: boolean; // does the central path give a raise above the start spend?
  centralPath: { age: number; spend: number }[]; // deterministic living-spend path (for the sparkline)
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((p / 100) * (sortedAsc.length - 1))));
  return sortedAsc[idx];
}

const retirementSpends = (plan: RetirementPlan, config: EngineConfig, returns?: number[], outside?: number[]) =>
  simulate(plan, config, returns, outside).rows.filter((r) => r.phase !== "accumulation").map((r) => r.breakdown.livingSpend);

export function guardrailsOutlook(
  plan: RetirementPlan,
  config: EngineConfig,
  opts?: { iterations?: number; seed?: number },
): GuardrailsOutlook {
  const centralSpends = retirementSpends(plan, config);
  const startSpend = centralSpends.length ? Math.round(centralSpends[0]) : 0;
  const centralPath = simulate(plan, config).rows
    .filter((r) => r.phase !== "accumulation")
    .map((r) => ({ age: r.age, spend: Math.round(r.breakdown.livingSpend) }));
  const everRaises = centralPath.some((p) => p.spend > startSpend * 1.01);

  const iterations = opts?.iterations ?? 150;
  const rand = mulberry32(opts?.seed ?? 0x9e3779b9);
  const mean = plan.investmentReturn;
  const sd = Math.max(0, plan.returnVolatility);
  const outsideMean = plan.outsideReturn ?? plan.investmentReturn;
  const outsideSd = Math.max(0, plan.outsideVolatility ?? plan.returnVolatility);
  const splitPools = outsideMean !== mean || outsideSd !== sd;
  const startOldest = Math.max(...plan.people.map((p) => p.currentAge));
  const horizon = Math.max(0, Math.round(plan.lifeExpectancy - startOldest));

  const minSpends: number[] = [];
  const yearsBelow: number[] = [];
  for (let iter = 0; iter < iterations; iter++) {
    const returns = new Array(horizon + 1);
    const outsideReturns = splitPools ? new Array(horizon + 1) : undefined;
    for (let t = 0; t <= horizon; t++) {
      const z = standardNormal(rand);
      returns[t] = mean + sd * z;
      if (outsideReturns) outsideReturns[t] = outsideMean + outsideSd * z;
    }
    const spends = retirementSpends(plan, config, returns, outsideReturns);
    if (!spends.length) continue;
    minSpends.push(Math.min(...spends));
    yearsBelow.push(spends.filter((v) => v < startSpend - 1).length);
  }

  minSpends.sort((a, b) => a - b);
  yearsBelow.sort((a, b) => a - b);
  const p10Min = percentile(minSpends, 10); // a rough (bottom-decile) run's deepest spend
  const worstCutPct = startSpend > 0 ? Math.max(0, 1 - p10Min / startSpend) : 0;

  return {
    startSpend,
    worstCutPct,
    worstCutSpend: Math.round(startSpend * (1 - worstCutPct)),
    yearsBelowBad: percentile(yearsBelow, 90), // pairs with the rough-run cut depth
    everRaises,
    centralPath,
  };
}
