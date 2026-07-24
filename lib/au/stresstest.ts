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
import { householdHorizon, householdRetirementOffset, spendingForAge } from "./types";
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
  // What's actually spendable this year: outside-super plus super only once it has
  // unlocked (preservation age). Before an early retiree's super unlocks, the locked
  // super (total − spendable) is wealth you hold but legally can't draw — the bridge.
  spendable: number;
}

export interface StressEraResult extends StressEra {
  lasts: boolean; // spending was fully funded every year to life expectancy
  depletionAge: number | null; // first age spending couldn't be met, when it doesn't last
  unfundedYears: number; // count of retirement years spending couldn't be fully met
  gapAges: number[]; // the specific retirement ages spending couldn't be fully met (for chart markers) — often a liquidity gap: the wealth is there but locked in super
  recovered: boolean; // had unfunded years BUT the plan recovered (funded again by the end, positive balance) — a temporary gap, not permanent depletion
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
  superUnlockAge: number | null; // age preserved super unlocks after an early retirement begins (null if super is already accessible at retirement) — the end of the locked bridge
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
  const horizon = householdHorizon(plan);
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
  const gapAges = retRows.filter((r) => !r.funded).map((r) => r.age);
  const unfundedYears = gapAges.length;
  const lastFunded = retRows.length ? retRows[retRows.length - 1].funded : true;
  // Recovered = it had lean/unfunded years but was funding again by the end with money
  // left (e.g. an early-retirement bridge that ran dry before super unlocked, then
  // recovered) — NOT a permanent run-out.
  const recovered = !res.lastsToLifeExpectancy && lastFunded && finalBalance > 1000;
  return {
    ...era,
    lasts: res.lastsToLifeExpectancy,
    depletionAge: res.depletedAge,
    unfundedYears,
    gapAges,
    recovered,
    finalBalance,
    minBalance,
    minAge,
    maxDrawdownPct: maxDD * 100,
    path: res.rows.map((r) => ({
      age: r.age,
      total: r.total,
      // Super is locked until it unlocks (preservation age for an early retiree);
      // before then only the outside pool is spendable.
      spendable: res.superUnlockAge != null && r.age < res.superUnlockAge ? r.outside : r.total,
    })),
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
    if (!a.lasts && !b.lasts) {
      // A permanent run-out is worse than a plan that recovered from a lean patch.
      if (a.recovered !== b.recovered) return a.recovered ? 1 : -1;
      return (a.depletionAge ?? 0) - (b.depletionAge ?? 0); // then earliest shortfall worst
    }
    return a.finalBalance - b.finalBalance; // survivors: closest calls first
  });
  const survived = results.filter((r) => r.lasts).length;
  const centralRes = simulate(plan, config);
  const central = centralRes.rows.map((r) => ({
    age: r.age,
    total: r.total,
    spendable: centralRes.superUnlockAge != null && r.age < centralRes.superUnlockAge ? r.outside : r.total,
  }));
  return { eras: results, survived, total: results.length, worst: results[0] ?? null, central, retireAge, superUnlockAge: centralRes.superUnlockAge };
}

// ── Failsafe withdrawal (ERN-style) ───────────────────────────────────────────
// The highest FIXED, never-cut spend a plan could START on and still fund every
// single year through EVERY historical stress era — the "worst-case-proof" spend.
// Guardrails are stripped (a failsafe is by definition a spend you never have to
// trim). The Age Pension is included by the engine, so this is what YOUR savings +
// pension can guarantee even if you retire straight into the worst run on record.

export interface Failsafe {
  spend: number; // failsafe first-year spend (today's $), never trimmed
  rate: number; // spend ÷ retirement portfolio (gross of the Age Pension)
  currentSpend: number; // the plan's own first-year spend, for comparison
  bindingEra: StressEra | null; // the era that fails first as you spend more
  headroomPct: number; // (failsafe − current) ÷ current — negative = you're above failsafe
}

/** Set the plan's FIRST-YEAR retirement spend to `level`, scaling a staged smile
 *  proportionally, and strip guardrails (failsafe = fixed spending). */
function withFirstYearSpend(plan: RetirementPlan, level: number, firstAge: number): RetirementPlan {
  const fixed = { ...plan, guardrails: undefined };
  if (plan.spendingMode !== "stages" || !plan.spendingStages) {
    return { ...fixed, targetSpending: level };
  }
  const current = spendingForAge(plan, firstAge);
  const f = current > 0 ? level / current : 0;
  const s = plan.spendingStages;
  return { ...fixed, spendingStages: { ...s, goGo: s.goGo * f, slowGo: s.slowGo * f, noGo: s.noGo * f } };
}

export function failsafeSpend(plan: RetirementPlan, config: EngineConfig): Failsafe {
  const oldest = Math.max(...plan.people.map((p) => p.currentAge));
  const firstAge = oldest + householdRetirementOffset(plan);
  const currentSpend = spendingForAge(plan, firstAge);
  const portfolio = Math.max(1, simulate({ ...plan, guardrails: undefined }, config).totalAtRetirement);

  const survivesAll = (level: number): boolean => {
    const p = withFirstYearSpend(plan, level, firstAge);
    for (const era of STRESS_ERAS) {
      const { returns, outsideReturns } = eraReturnPath(p, config, era);
      if (!simulate(p, config, returns, outsideReturns).lastsToLifeExpectancy) return false;
    }
    return true;
  };

  // Binary search the highest surviving spend. $0 always survives (the pool only
  // grows), so `lo` is a valid floor; `hi` is a generous ceiling no failsafe exceeds.
  let lo = 0;
  let hi = Math.max(currentSpend * 3, portfolio * 0.12, 1000);
  for (let i = 0; i < 34; i++) {
    const mid = (lo + hi) / 2;
    if (survivesAll(mid)) lo = mid; else hi = mid;
  }
  const spend = lo;

  // Which era binds just above the failsafe (fails at the earliest age)?
  let bindingEra: StressEra | null = null;
  if (spend > 1) {
    const probe = withFirstYearSpend(plan, spend * 1.03, firstAge);
    let worstDep = Infinity;
    for (const era of STRESS_ERAS) {
      const { returns, outsideReturns } = eraReturnPath(probe, config, era);
      const r = simulate(probe, config, returns, outsideReturns);
      if (!r.lastsToLifeExpectancy && (r.depletedAge ?? Infinity) < worstDep) {
        worstDep = r.depletedAge ?? Infinity;
        bindingEra = era;
      }
    }
  }

  return {
    spend,
    rate: spend / portfolio,
    currentSpend,
    bindingEra,
    headroomPct: currentSpend > 0 ? (spend - currentSpend) / currentSpend : 0,
  };
}
