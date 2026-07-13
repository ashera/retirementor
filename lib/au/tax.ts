// Minimal resident income tax — used to estimate capital gains tax on the sale of
// an investment property. Uses the current resident rates (no Medicare levy, no
// offsets); the gain is treated in today's dollars, consistent with the engine.

interface Bracket {
  upTo: number;
  base: number; // tax owing at the bottom of this bracket
  rate: number; // marginal rate within it
}

// FY2026-27 resident scale. The $18,201–$45,000 bracket is 15% from 1 July 2026
// (the legislated cost-of-living tax cut; drops again to 14% from 1 July 2027).
// `base` = cumulative tax at the bottom of each bracket, e.g. 45k → 26,800·0.15.
const BRACKETS: Bracket[] = [
  { upTo: 18_200, base: 0, rate: 0 },
  { upTo: 45_000, base: 0, rate: 0.15 },
  { upTo: 135_000, base: 4_020, rate: 0.3 },
  { upTo: 190_000, base: 31_020, rate: 0.37 },
  { upTo: Infinity, base: 51_370, rate: 0.45 },
];

/** Resident income tax on a taxable amount, BEFORE offsets (today's dollars).
 *  Used as the base and, standalone, to estimate CGT on a discounted gain. */
export function incomeTax(taxable: number): number {
  const t = Math.max(0, taxable);
  let lower = 0;
  for (const b of BRACKETS) {
    if (t <= b.upTo) return b.base + (t - lower) * b.rate;
    lower = b.upTo;
  }
  return 0; // unreachable — last bracket is Infinity
}

/** Low Income Tax Offset (LITO) — a non-refundable offset available to ALL
 *  residents. $700 up to $37,500, then withdrawn at 5c/$ to $325 at $45,000, then
 *  1.5c/$ to $0 at $66,667. (ATO, current rates.) */
export function lito(taxable: number): number {
  const i = Math.max(0, taxable);
  if (i <= 37_500) return 700;
  if (i <= 45_000) return 700 - 0.05 * (i - 37_500);
  if (i <= 66_667) return Math.max(0, 325 - 0.015 * (i - 45_000));
  return 0;
}

/** Ordinary resident income tax after the LITO (non-refundable) — the tax on
 *  wages and other assessable income for a working-age person. */
export function residentIncomeTax(taxable: number): number {
  return Math.max(0, incomeTax(taxable) - lito(taxable));
}

// Medicare levy low-income threshold (single, ATO — indexed yearly).
const MEDICARE_LOW_INCOME_THRESHOLD = 27_222;

/** The 2% Medicare levy on a working-age person's taxable income: nil below the
 *  low-income threshold, shaded in at 10c per $ over it, then a flat 2%. Kept
 *  SEPARATE from residentIncomeTax (which is also used for CGT, where we deliberately
 *  exclude the levy) — this is added only to a wage-earner's take-home. */
export function medicareLevy(taxable: number): number {
  const t = Math.max(0, taxable);
  if (t <= MEDICARE_LOW_INCOME_THRESHOLD) return 0;
  return Math.min(0.02 * t, 0.1 * (t - MEDICARE_LOW_INCOME_THRESHOLD));
}

// Max SAPTO (Seniors & Pensioners Tax Offset), per person. The offset makes
// modest senior income effectively tax-free (single ~$35k, each of a couple
// ~$32k before any tax).
const SAPTO_MAX = { single: 2_230, couple: 1_602 };

/** Approx income tax on a senior/pensioner's assessable income (per person):
 *  ordinary resident tax less LITO AND the SAPTO offset (both non-refundable).
 *  Ignores SAPTO's high-income phase-out — fine for the modest amounts modelled —
 *  and the Medicare levy (which SAPTO recipients on low incomes generally don't
 *  pay). Used for both part-time employment income and outside-super earnings. */
export function seniorIncomeTax(income: number, household: "single" | "couple"): number {
  return Math.max(0, incomeTax(income) - lito(income) - SAPTO_MAX[household]);
}

/** @deprecated Renamed to {@link seniorIncomeTax} (also covers investment earnings). */
export const seniorEmploymentTax = seniorIncomeTax;
