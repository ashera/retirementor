// Independent analytical reference for the scenario suite.
//
// These re-derive the key quantities straight from the published rules and
// closed-form maths — deliberately NOT via the engine's year-by-year loop. A
// scenario asserts that `simulate(...)` agrees with these; a mismatch flags a
// real bug in one side or the other. Sources: ATO (super/tax), Services
// Australia (Age Pension income + assets tests, deeming).

import type { EngineConfig } from "../config";
import type { Household, MortgageDetail, PropertyDetail } from "../types";

/** Real (after-inflation) rate — the model's core convention. */
export function realRate(nominalPct: number, inflationPct: number): number {
  return (1 + nominalPct / 100) / (1 + inflationPct / 100) - 1;
}

/**
 * Closed-form future value of a pool that grows at `g` with `contrib` added at
 * the START of each year and then grown (matching the engine's add-then-grow):
 *   Bₙ = B₀(1+g)ⁿ + c·(1+g)·((1+g)ⁿ − 1)/g
 * Assumes a constant contribution (i.e. constant, uncapped salary inputs).
 */
export function futureValue(
  opening: number,
  contrib: number,
  g: number,
  n: number,
  contribGrowthExp = 1, // 1 = add-then-grow; 0.5 = mid-year (contribution grows ½ a year)
): number {
  if (Math.abs(g) < 1e-12) return opening + contrib * n;
  const gp = Math.pow(1 + g, n);
  return opening * gp + (contrib * Math.pow(1 + g, contribGrowthExp) * (gp - 1)) / g;
}

/** Net annual super contribution: concessional net of 15% (+ Division 293), plus non-concessional. */
export function netAnnualContribution(
  salary: number,
  sgRate: number,
  volConcessional: number,
  concCap: number,
  contribTax: number,
  volNonConcessional: number,
  nccCap: number,
  div293Threshold = Infinity,
  div293ExtraRate = 0,
): number {
  const concessional = Math.min(salary * sgRate + volConcessional, concCap);
  const ncc = Math.min(volNonConcessional, nccCap);
  const taxed293 = Math.min(concessional, Math.max(0, salary + concessional - div293Threshold));
  const extra293 = taxed293 * div293ExtraRate;
  return concessional * (1 - contribTax) - extra293 + ncc;
}

/**
 * Super balance after `years` of accumulation (15% earnings tax on returns).
 * `feePct` reduces the return (admin+investment fee); `annualDeduction` is the
 * fixed admin + insurance $ removed each year.
 */
export function superBalanceAt(
  opening: number,
  netContrib: number,
  nominalReturnPct: number,
  inflationPct: number,
  earningsTaxRate: number,
  years: number,
  feePct = 0,
  annualDeduction = 0,
): number {
  const g = realRate(nominalReturnPct * (1 - earningsTaxRate) - feePct, inflationPct);
  return futureValue(opening, netContrib - annualDeduction, g, years, 0.5);
}

/** Outside-super balance after `years` (no earnings tax). */
export function outsideBalanceAt(
  opening: number,
  savings: number,
  nominalReturnPct: number,
  inflationPct: number,
  years: number,
): number {
  return futureValue(opening, savings, realRate(nominalReturnPct, inflationPct), years, 0.5);
}

/** Income deemed on financial assets — two-tier, per Services Australia. */
export function deemedIncome(financial: number, household: Household, config: EngineConfig): number {
  const t =
    household === "single" ? config.deeming.threshold.single : config.deeming.threshold.couple;
  return (
    Math.min(financial, t) * config.deeming.lowerRate +
    Math.max(0, financial - t) * config.deeming.upperRate
  );
}

export interface PensionRefInput {
  household: Household;
  homeowner: boolean;
  assessableAssets: number; // excludes the exempt family home
  financialAssets: number; // subset that is deemed
  otherIncome?: number; // actual (non-deemed) income, e.g. net rent
}

/**
 * Age Pension = the LOWER of the income test and the assets test. Independent
 * re-derivation of the published formula (max annual, free areas, tapers).
 */
export function agePension(
  input: PensionRefInput,
  config: EngineConfig,
): { annual: number; binding: "income" | "assets" } {
  const side =
    input.household === "single" ? config.agePension.single : config.agePension.couple;
  const max = side.maxAnnual;

  const income =
    deemedIncome(input.financialAssets, input.household, config) + (input.otherIncome ?? 0);
  const incomeTest = Math.max(
    0,
    max - Math.max(0, income - side.incomeFreeAreaAnnual) * config.agePension.incomeTaperPerDollar,
  );

  const freeArea = input.homeowner
    ? side.assetsFreeArea.homeowner
    : side.assetsFreeArea.nonHomeowner;
  const assetsTest = Math.max(
    0,
    max - Math.max(0, input.assessableAssets - freeArea) * config.agePension.assetsTaperPerDollar,
  );

  return assetsTest <= incomeTest
    ? { annual: assetsTest, binding: "assets" }
    : { annual: incomeTest, binding: "income" };
}

// ── Investment property (re-derived from first principles) ───────────────────
export function propertyValueAt(p: PropertyDetail, years: number): number {
  return p.value * Math.pow(1 + p.growthReal / 100, years);
}
export function propertyNetRent(p: PropertyDetail, years: number): number {
  const v = propertyValueAt(p, years);
  return v * (p.grossYield / 100) * (1 - p.costRatio / 100) - p.loanBalance * (p.loanRate / 100);
}
export function propertyNetEquity(p: PropertyDetail, years: number): number {
  return Math.max(0, propertyValueAt(p, years) - p.loanBalance);
}
export function propertyCGT(p: PropertyDetail, years: number): number {
  const gain = Math.max(0, propertyValueAt(p, years) - p.purchasePrice);
  return incomeTax(gain * 0.5); // 50% CGT discount, held > 12 months
}
export function propertySaleProceeds(p: PropertyDetail, years: number): number {
  return Math.max(0, propertyValueAt(p, years) - p.loanBalance - propertyCGT(p, years));
}

// ── Mortgage cost (fixed nominal, deflated to today's dollars) ───────────────
export function mortgageNominalCost(m: MortgageDetail): number {
  return m.type === "interest_only" ? m.balance * (m.interestRate / 100) : m.annualRepayment;
}
export function mortgageRealCost(m: MortgageDetail, inflationPct: number, years: number): number {
  return mortgageNominalCost(m) / Math.pow(1 + inflationPct / 100, years);
}

// ── Resident income tax (FY2026-27), used for the CGT above ──────────────────
export function incomeTax(taxable: number): number {
  const t = Math.max(0, taxable);
  if (t <= 18_200) return 0;
  if (t <= 45_000) return (t - 18_200) * 0.16;
  if (t <= 135_000) return 4_288 + (t - 45_000) * 0.3;
  if (t <= 190_000) return 31_288 + (t - 135_000) * 0.37;
  return 51_638 + (t - 190_000) * 0.45;
}

// ── Low Income Tax Offset (LITO) ─────────────────────────────────────────────
// Non-refundable, available to all residents. $700 to $37.5k, withdrawn to $325
// at $45k, then to $0 at $66,667. Re-stated from the ATO figures.
export function lito(taxable: number): number {
  const i = Math.max(0, taxable);
  if (i <= 37_500) return 700;
  if (i <= 45_000) return 700 - 0.05 * (i - 37_500);
  if (i <= 66_667) return Math.max(0, 325 - 0.015 * (i - 45_000));
  return 0;
}

/** Ordinary resident income tax after LITO (non-refundable). */
export function residentIncomeTax(taxable: number): number {
  return Math.max(0, incomeTax(taxable) - lito(taxable));
}

// ── Seniors & Pensioners Tax Offset (SAPTO) ──────────────────────────────────
// Max SAPTO per person (ATO). Makes modest senior income effectively tax-free
// (single ~$35k; each of a couple ~$32k). Re-stated from the published figure so
// the reference doesn't share the engine's tax module.
const SAPTO_MAX = { single: 2_230, couple: 1_602 } as const;

/** Resident income tax on a senior/pensioner, per person: ordinary tax less LITO
 *  AND SAPTO (floored at 0). Ignores the high-income phase-out + Medicare levy (as
 *  the engine does). Covers part-time employment AND outside investment earnings. */
export function seniorIncomeTax(income: number, household: Household): number {
  return Math.max(0, incomeTax(income) - lito(income) - SAPTO_MAX[household]);
}

/** Retirement-phase per-person income tax. SAPTO only applies from Age Pension
 *  age; before that it's the ordinary resident scale (with LITO). */
export function retireeIncomeTax(income: number, household: Household, senior: boolean): number {
  return senior ? seniorIncomeTax(income, household) : residentIncomeTax(income);
}

/** Tax on a retiree's outside-super (nominal) earnings, charged as the MARGINAL
 *  amount stacked on top of any part-time work income — so the tax-free
 *  threshold + SAPTO aren't used twice (matches the engine). `grownOutside` is
 *  the outside balance AFTER the year's growth (the base the engine taxes). */
export function outsideEarningsTax(
  grownOutside: number, nomReturnPct: number, grossWork: number, workers: number, household: Household, senior: boolean,
): number {
  const earnings = Math.max(0, grownOutside * (nomReturnPct / 100));
  if (earnings <= 0) return 0;
  const workPer = grossWork / workers;
  const earnPer = earnings / workers;
  return workers * Math.max(0, retireeIncomeTax(workPer + earnPer, household, senior) - retireeIncomeTax(workPer, household, senior));
}

// ── Part-time work in retirement (Work Bonus + tax) ──────────────────────────
/** Work Bonus: the first $300/fortnight ($7,800/yr) of employment income per
 *  person is excluded from the Age Pension INCOME test (Services Australia). */
export const WORK_BONUS_ANNUAL = 7_800;
export function workBonusAssessable(grossWork: number, workers: number): number {
  return Math.max(0, grossWork - WORK_BONUS_ANNUAL * workers);
}
/** Net part-time work income after senior income tax (this is what offsets the
 *  household's drawdown need). */
export function netWorkIncome(grossWork: number, workers: number, household: Household, senior: boolean): number {
  return grossWork - workers * retireeIncomeTax(grossWork / workers, household, senior);
}

// ── Transition to Retirement arbitrage ───────────────────────────────────────
/** Net gain to super from swapping `extraSacrifice` of pre-tax salary into a
 *  tax-free TTR pension: income tax saved on that slice LESS the 15%
 *  contributions tax, bounded by the remaining concessional-cap room. Negative
 *  when the marginal rate is under 15%. Person 0 only, from preservation age. */
export function ttrBenefit(
  salary: number, volConcessional: number, extraSacrifice: number,
  sgRate: number, concessionalCap: number, contribTax: number,
): number {
  const concessional = Math.min(salary * sgRate + volConcessional, concessionalCap);
  const sacrificed = Math.max(0, concessional - salary * sgRate);
  const taxable = Math.max(0, salary - sacrificed);
  const ttrSacrificed = Math.min(extraSacrifice, Math.max(0, concessionalCap - concessional));
  if (ttrSacrificed <= 0) return 0;
  const taxSaved = residentIncomeTax(taxable) - residentIncomeTax(Math.max(0, taxable - ttrSacrificed));
  return taxSaved - ttrSacrificed * contribTax;
}

// ── Home as an asset: appreciation, downsize & sell-up equity release ─────────
/** The (exempt) home's value after `years`, appreciating at a real rate. */
export function homeValueAt(value: number, growthRealPct: number, years: number): number {
  return value * Math.pow(1 + growthRealPct / 100, years);
}
/** Equity freed by downsizing to `newValue` at `years` — the grown home less the
 *  new (smaller) home and any loan. A `toSuper` slice becomes a downsizer
 *  contribution; the remainder lands in (deemed) savings. */
export function downsizerRelease(
  value: number, growthRealPct: number, years: number, newValue: number, loan = 0,
): number {
  return Math.max(0, homeValueAt(value, growthRealPct, years) - newValue - loan);
}
/** Equity freed by selling up and renting at `years` — all grown equity net of any loan. */
export function sellUpRelease(
  value: number, growthRealPct: number, years: number, loan = 0,
): number {
  return Math.max(0, homeValueAt(value, growthRealPct, years) - loan);
}

/** Assert two dollar figures agree within `tol` (default $1), with a helpful message. */
export function near(actual: number, expected: number, label: string, tol = 1): void {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${label}: expected ~${expected.toFixed(2)}, got ${actual.toFixed(2)}`);
  }
}
