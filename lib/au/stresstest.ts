// Historical stress test: replay each major bear-market ERA's actual return
// sequence against a scenario, STARTING AT RETIREMENT — the canonical
// sequence-of-returns worst case (a crash just as drawdown begins).
//
// Methodology (see also historicalReturns.ts):
//  - Each era replays its ACTUAL year-by-year real returns — crashes AND recoveries
//    exactly as they happened (1928–2025 US market history, a proxy for a globally
//    diversified portfolio). "Retire in 2008" runs the real 2008 sequence, so the
//    strong 2009–21 recovery is fully reflected — not a weakened version.
//  - Accumulation years (before retirement) run at the plan's normal return; the
//    era hits at the retirement year. When an era's data runs out (e.g. 2008→2025),
//    remaining years revert to the plan's assumed return.
//  - The outside-super pool moves with the same real move scaled by its own
//    volatility (a cash-like pool doesn't swing as hard) — the MC's correlation model.

import type { RetirementPlan, SimResult } from "./types";
import { householdRetirementOffset, spendingForAge } from "./types";
import type { EngineConfig } from "./config";
import { simulate } from "./simulate";
import { HISTORICAL_REAL_EQUITY, HIST_START_YEAR } from "./historicalReturns";
import { returnParams } from "./montecarlo";

export interface StressEra {
  id: string;
  label: string;
  startYear: number;
  blurb: string;
}

/** The battery of major multi-year bear-market eras (annual data → we target the
 *  sustained sequences that actually deplete a portfolio, not one-day crashes like
 *  1987/2020 that closed their year flat-to-up). */
export const STRESS_ERAS: readonly StressEra[] = [
  { id: "1929", label: "The Great Depression", startYear: 1929, blurb: "The deepest collapse on record — equities fell to roughly a fifth of their value over three-plus years, amid deflation." },
  { id: "1937", label: "Recession of 1937–38", startYear: 1937, blurb: "A sharp relapse mid-recovery as stimulus was pulled back too soon." },
  { id: "1966", label: "Stagflation start (1966)", startYear: 1966, blurb: "The worst modern retiree start: a long grind through the 1970s as inflation shredded real returns." },
  { id: "1973", label: "Oil crisis (1973–74)", startYear: 1973, blurb: "A ~40% real fall over two years as the oil shock met stagflation." },
  { id: "2000", label: "Dot-com bust (2000–02)", startYear: 2000, blurb: "Three straight down years as the tech bubble unwound." },
  { id: "2008", label: "Global Financial Crisis", startYear: 2008, blurb: "Roughly a 50% peak-to-trough fall — the modern benchmark for a market crash." },
  { id: "2022", label: "Inflation & rate shock (2022)", startYear: 2022, blurb: "Shares and bonds fell together as inflation forced the fastest rate rises in decades." },
];

export interface BalancePoint {
  age: number;
  total: number;
}

export interface StressEraResult extends StressEra {
  lasts: boolean; // money still lasts to life expectancy
  depletionAge: number | null; // age it runs out, when it doesn't last
  finalBalance: number; // balance at life expectancy (today's $)
  minBalance: number; // lowest total balance during retirement
  minAge: number; // age at that trough
  maxDrawdownPct: number; // worst peak-to-trough drop in retirement (%)
  path: BalancePoint[]; // total balance by age (today's $) under this era
  // The COST of flexing (only non-zero when guardrails are on): how far spending was
  // cut below the plan's intended amount, and for how long. This is what "flexible
  // spending survives" actually demands — the price behind the survival.
  minLivingSpend: number; // lowest lifestyle spend in retirement (today's $)
  deepestCutPct: number; // deepest cut below the intended spend (%)
  cutYears: number; // retirement years spending was cut >5% below intended
}

export interface StressTestResult {
  eras: StressEraResult[]; // worst-first
  survived: number;
  total: number;
  worst: StressEraResult | null;
  central: BalancePoint[]; // the smooth, no-shock projection (reference line)
  retireAge: number; // age the household begins retirement (chart marker)
}

/** Build the nominal return path (percent per year) for one era: the plan's assumed
 *  return up to retirement, then the era's ACTUAL historical real returns, then the
 *  assumed return again once the era's data runs out. Returns are nominal because the
 *  engine deflates by the plan's inflation — so we gross each real figure up by it. */
function eraReturnPath(
  plan: RetirementPlan,
  config: EngineConfig,
  era: StressEra,
): { returns: number[]; outsideReturns?: number[]; retireOffset: number } {
  const p = returnParams(plan, config);
  const oldest = Math.max(...plan.people.map((x) => x.currentAge));
  const horizon = Math.max(0, plan.lifeExpectancy - oldest);
  const retireOffset = householdRetirementOffset(plan);
  const infl = plan.inflation / 100;
  const toNominal = (real: number) => 100 * ((1 + real) * (1 + infl) - 1); // deflates back to `real`
  const scale = p.sd > 0 ? p.outsideSd / p.sd : 0; // outside pool's share of the market move
  const superRealMean = (1 + p.mean / 100) / (1 + infl) - 1;
  const outsideRealMean = (1 + p.outsideMean / 100) / (1 + infl) - 1;
  const returns = new Array<number>(horizon + 1);
  const outsideReturns = p.splitPools ? new Array<number>(horizon + 1) : undefined;
  for (let t = 0; t <= horizon; t++) {
    const idx = t >= retireOffset ? era.startYear - HIST_START_YEAR + (t - retireOffset) : -1;
    if (idx >= 0 && idx < HISTORICAL_REAL_EQUITY.length) {
      const histReal = HISTORICAL_REAL_EQUITY[idx];
      returns[t] = toNominal(histReal); // super pool: the actual historical real return
      if (outsideReturns) outsideReturns[t] = toNominal(outsideRealMean + (histReal - superRealMean) * scale);
    } else {
      returns[t] = p.mean; // accumulation + post-era: the plan's assumed return
      if (outsideReturns) outsideReturns[t] = p.outsideMean;
    }
  }
  return { returns, outsideReturns, retireOffset };
}

/** Summarise one simulated era run into a scorecard row. */
function summarise(era: StressEra, res: SimResult, retireStartAge: number, plan: RetirementPlan): StressEraResult {
  const retRows = res.rows.filter((r) => r.age >= retireStartAge);
  const finalBalance = res.rows.length ? res.rows[res.rows.length - 1].total : 0;
  let minBalance = Infinity;
  let minAge = retireStartAge;
  let peak = 0;
  let maxDD = 0;
  let minLivingSpend = Infinity;
  let deepestCut = 0;
  let cutYears = 0;
  for (const r of retRows) {
    if (r.total < minBalance) { minBalance = r.total; minAge = r.age; }
    if (r.total > peak) peak = r.total;
    if (peak > 0) maxDD = Math.max(maxDD, (peak - r.total) / peak);
    // Cost of flexing: actual lifestyle spend vs the plan's intended spend for the age.
    const living = r.breakdown.livingSpend;
    const intended = spendingForAge(plan, r.age);
    if (living < minLivingSpend) minLivingSpend = living;
    if (intended > 1) {
      const cut = (intended - living) / intended;
      if (cut > deepestCut) deepestCut = cut;
      if (cut > 0.05) cutYears++;
    }
  }
  if (!Number.isFinite(minBalance)) minBalance = finalBalance;
  if (!Number.isFinite(minLivingSpend)) minLivingSpend = 0;
  return {
    ...era,
    lasts: res.lastsToLifeExpectancy,
    depletionAge: res.depletedAge,
    finalBalance,
    minBalance,
    minAge,
    maxDrawdownPct: maxDD * 100,
    path: res.rows.map((r) => ({ age: r.age, total: r.total })),
    minLivingSpend,
    deepestCutPct: deepestCut * 100,
    cutYears,
  };
}

/** Run the whole battery. Sorted worst-first: failures by earliest depletion, then
 *  survivors by lowest final balance (closest calls first). */
export function runStressTest(plan: RetirementPlan, config: EngineConfig): StressTestResult {
  const oldest = Math.max(...plan.people.map((x) => x.currentAge));
  const retireAge = oldest + householdRetirementOffset(plan);
  const results = STRESS_ERAS.map((era) => {
    const { returns, outsideReturns, retireOffset } = eraReturnPath(plan, config, era);
    const res = simulate(plan, config, returns, outsideReturns);
    return summarise(era, res, oldest + retireOffset, plan);
  });
  results.sort((a, b) => {
    if (a.lasts !== b.lasts) return a.lasts ? 1 : -1; // failures first
    if (!a.lasts && !b.lasts) return (a.depletionAge ?? 0) - (b.depletionAge ?? 0); // earliest depletion worst
    return a.finalBalance - b.finalBalance; // survivors: closest calls first
  });
  const survived = results.filter((r) => r.lasts).length;
  const central = simulate(plan, config).rows.map((r) => ({ age: r.age, total: r.total }));
  return { eras: results, survived, total: results.length, worst: results[0] ?? null, central, retireAge };
}
