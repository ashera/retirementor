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
export function futureValue(opening: number, contrib: number, g: number, n: number): number {
  if (Math.abs(g) < 1e-12) return opening + contrib * n;
  const gp = Math.pow(1 + g, n);
  return opening * gp + (contrib * (1 + g) * (gp - 1)) / g;
}

/** Net annual super contribution: concessional net of 15%, plus non-concessional. */
export function netAnnualContribution(
  salary: number,
  sgRate: number,
  volConcessional: number,
  concCap: number,
  contribTax: number,
  volNonConcessional: number,
  nccCap: number,
): number {
  const concessional = Math.min(salary * sgRate + volConcessional, concCap);
  const ncc = Math.min(volNonConcessional, nccCap);
  return concessional * (1 - contribTax) + ncc;
}

/** Super balance after `years` of accumulation (15% earnings tax on returns). */
export function superBalanceAt(
  opening: number,
  netContrib: number,
  nominalReturnPct: number,
  inflationPct: number,
  earningsTaxRate: number,
  years: number,
): number {
  const g = realRate(nominalReturnPct * (1 - earningsTaxRate), inflationPct);
  return futureValue(opening, netContrib, g, years);
}

/** Outside-super balance after `years` (no earnings tax). */
export function outsideBalanceAt(
  opening: number,
  savings: number,
  nominalReturnPct: number,
  inflationPct: number,
  years: number,
): number {
  return futureValue(opening, savings, realRate(nominalReturnPct, inflationPct), years);
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

/** Assert two dollar figures agree within `tol` (default $1), with a helpful message. */
export function near(actual: number, expected: number, label: string, tol = 1): void {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${label}: expected ~${expected.toFixed(2)}, got ${actual.toFixed(2)}`);
  }
}
