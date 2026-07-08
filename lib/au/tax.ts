// Minimal resident income tax — used to estimate capital gains tax on the sale of
// an investment property. Uses the current resident rates (no Medicare levy, no
// offsets); the gain is treated in today's dollars, consistent with the engine.

interface Bracket {
  upTo: number;
  base: number; // tax owing at the bottom of this bracket
  rate: number; // marginal rate within it
}

// FY2026-27 resident scale.
const BRACKETS: Bracket[] = [
  { upTo: 18_200, base: 0, rate: 0 },
  { upTo: 45_000, base: 0, rate: 0.16 },
  { upTo: 135_000, base: 4_288, rate: 0.3 },
  { upTo: 190_000, base: 31_288, rate: 0.37 },
  { upTo: Infinity, base: 51_638, rate: 0.45 },
];

/** Resident income tax on a taxable amount (today's dollars). */
export function incomeTax(taxable: number): number {
  const t = Math.max(0, taxable);
  let lower = 0;
  for (const b of BRACKETS) {
    if (t <= b.upTo) return b.base + (t - lower) * b.rate;
    lower = b.upTo;
  }
  return 0; // unreachable — last bracket is Infinity
}

// Max SAPTO (Seniors & Pensioners Tax Offset), per person. The offset makes
// modest senior income effectively tax-free (single ~$35k, each of a couple
// ~$32k before any tax).
const SAPTO_MAX = { single: 2_230, couple: 1_602 };

/** Approx income tax on a senior/pensioner's assessable income (per person):
 *  ordinary resident tax less the SAPTO offset. Ignores SAPTO's high-income
 *  phase-out — fine for the modest amounts modelled — and the Medicare levy
 *  (which SAPTO recipients on low incomes generally don't pay). Used for both
 *  part-time employment income and outside-super investment earnings. */
export function seniorIncomeTax(income: number, household: "single" | "couple"): number {
  return Math.max(0, incomeTax(income) - SAPTO_MAX[household]);
}

/** @deprecated Renamed to {@link seniorIncomeTax} (also covers investment earnings). */
export const seniorEmploymentTax = seniorIncomeTax;
