// Historical stress test: replay each major bear-market ERA's actual return
// sequence against a scenario, STARTING AT RETIREMENT — the canonical
// sequence-of-returns worst case (a crash just as drawdown begins).
//
// Methodology (see also historicalReturns.ts):
//  - We overlay each era's real-return DEVIATIONS from history's own mean onto the
//    plan's ASSUMED return, so the long-run drift stays the user's while the crash
//    SHAPE is history's — not the US market's ~7% real level.
//  - At FULL historical severity: a real −40% year stays −40% (not shrunk to the
//    plan's volatility). That's deliberate — a stress test should use history's
//    actual severity, which is harsher than the vol-scaled bootstrap Monte Carlo.
//  - Accumulation years (before retirement) run at the plan's normal return; the
//    era hits at the retirement year. When an era's data runs out (e.g. 2008→2025),
//    remaining years revert to the assumed return — so recent eras still test the
//    crash + partial recovery, then normal.
//  - The outside-super pool moves with the equity shock scaled by its own volatility
//    (a cash-like pool doesn't crash as hard) — the same correlation model the MC uses.

import type { RetirementPlan, SimResult } from "./types";
import { householdRetirementOffset } from "./types";
import type { EngineConfig } from "./config";
import { simulate } from "./simulate";
import { HISTORICAL_REAL_EQUITY, HIST_START_YEAR, HISTORICAL_REAL_MEAN } from "./historicalReturns";
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

export interface StressEraResult extends StressEra {
  lasts: boolean; // money still lasts to life expectancy
  depletionAge: number | null; // age it runs out, when it doesn't last
  finalBalance: number; // balance at life expectancy (today's $)
  minBalance: number; // lowest total balance during retirement
  minAge: number; // age at that trough
  maxDrawdownPct: number; // worst peak-to-trough drop in retirement (%)
}

export interface StressTestResult {
  eras: StressEraResult[]; // worst-first
  survived: number;
  total: number;
  worst: StressEraResult | null;
}

/** Build the nominal return path (percent per year) for one era: normal returns up
 *  to retirement, then the era's real deviations at full severity, then mean-revert. */
function eraReturnPath(
  plan: RetirementPlan,
  config: EngineConfig,
  era: StressEra,
): { returns: number[]; outsideReturns?: number[]; retireOffset: number } {
  const p = returnParams(plan, config);
  const oldest = Math.max(...plan.people.map((x) => x.currentAge));
  const horizon = Math.max(0, plan.lifeExpectancy - oldest);
  const retireOffset = householdRetirementOffset(plan);
  const scale = p.sd > 0 ? p.outsideSd / p.sd : 0; // outside pool's share of the equity shock
  const returns = new Array<number>(horizon + 1);
  const outsideReturns = p.splitPools ? new Array<number>(horizon + 1) : undefined;
  for (let t = 0; t <= horizon; t++) {
    let devPct = 0; // percentage-point real deviation from history's mean
    if (t >= retireOffset) {
      const idx = era.startYear - HIST_START_YEAR + (t - retireOffset);
      if (idx >= 0 && idx < HISTORICAL_REAL_EQUITY.length) {
        devPct = 100 * (HISTORICAL_REAL_EQUITY[idx] - HISTORICAL_REAL_MEAN);
      }
    }
    returns[t] = p.mean + devPct;
    if (outsideReturns) outsideReturns[t] = p.outsideMean + devPct * scale;
  }
  return { returns, outsideReturns, retireOffset };
}

/** Summarise one simulated era run into a scorecard row. */
function summarise(era: StressEra, res: SimResult, retireStartAge: number): StressEraResult {
  const retRows = res.rows.filter((r) => r.age >= retireStartAge);
  const finalBalance = res.rows.length ? res.rows[res.rows.length - 1].total : 0;
  let minBalance = Infinity;
  let minAge = retireStartAge;
  let peak = 0;
  let maxDD = 0;
  for (const r of retRows) {
    if (r.total < minBalance) { minBalance = r.total; minAge = r.age; }
    if (r.total > peak) peak = r.total;
    if (peak > 0) maxDD = Math.max(maxDD, (peak - r.total) / peak);
  }
  if (!Number.isFinite(minBalance)) minBalance = finalBalance;
  return {
    ...era,
    lasts: res.lastsToLifeExpectancy,
    depletionAge: res.depletedAge,
    finalBalance,
    minBalance,
    minAge,
    maxDrawdownPct: maxDD * 100,
  };
}

/** Run the whole battery. Sorted worst-first: failures by earliest depletion, then
 *  survivors by lowest final balance (closest calls first). */
export function runStressTest(plan: RetirementPlan, config: EngineConfig): StressTestResult {
  const oldest = Math.max(...plan.people.map((x) => x.currentAge));
  const results = STRESS_ERAS.map((era) => {
    const { returns, outsideReturns, retireOffset } = eraReturnPath(plan, config, era);
    const res = simulate(plan, config, returns, outsideReturns);
    return summarise(era, res, oldest + retireOffset);
  });
  results.sort((a, b) => {
    if (a.lasts !== b.lasts) return a.lasts ? 1 : -1; // failures first
    if (!a.lasts && !b.lasts) return (a.depletionAge ?? 0) - (b.depletionAge ?? 0); // earliest depletion worst
    return a.finalBalance - b.finalBalance; // survivors: closest calls first
  });
  const survived = results.filter((r) => r.lasts).length;
  return { eras: results, survived, total: results.length, worst: results[0] ?? null };
}
