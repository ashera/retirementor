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

// SAPTO (Seniors & Pensioners Tax Offset), per person. Max offset makes modest
// senior income effectively tax-free (single ~$35k, each of a couple ~$32k), then
// shades out at 12.5c per $1 of rebate income above the threshold — fully gone by
// ~$50,119 (single) / ~$41,790 each (couple). (ATO SAPTO rates.)
const SAPTO_MAX = { single: 2_230, couple: 1_602 };
const SAPTO_SHADE_IN = { single: 32_279, couple: 28_974 }; // rebate income where the taper begins
const SAPTO_TAPER = 0.125;

/** The SAPTO available at a given rebate income (≈ taxable income in this model),
 *  after the 12.5c/$ high-income phase-out. */
export function sapto(rebateIncome: number, household: "single" | "couple"): number {
  return Math.max(0, SAPTO_MAX[household] - SAPTO_TAPER * Math.max(0, rebateIncome - SAPTO_SHADE_IN[household]));
}

/** Approx income tax on a senior/pensioner's assessable income (per person):
 *  ordinary resident tax less LITO AND the (tapered) SAPTO offset, both
 *  non-refundable. Ignores the Medicare levy (which SAPTO recipients on low incomes
 *  generally don't pay). Used for both part-time employment income and outside-super
 *  earnings. */
export function seniorIncomeTax(income: number, household: "single" | "couple"): number {
  return Math.max(0, incomeTax(income) - lito(income) - sapto(income, household));
}

/** @deprecated Renamed to {@link seniorIncomeTax} (also covers investment earnings). */
export const seniorEmploymentTax = seniorIncomeTax;

// ── Consolidated per-person tax ──────────────────────────────────────────────
// One person's whole tax for a year: all ordinary income (salary, net rent,
// dividends, part-time work) taxed together on ONE marginal scale with a SINGLE
// LITO + SAPTO application, plus Medicare on employment income and CGT on any
// realised gain. The ordinary sources are CHAINED in order, so each source's tax
// is its marginal increment on top of the ones before it (they sum to the total
// income tax) — this lets the engine attribute each slice to the right pool while
// the total stays a proper, once-offset figure.

export interface CgtParams {
  regime: "indexed" | "discount";
  discountPct: number; // "discount": excluded fraction of the gain (50)
  minRatePct: number; // "indexed": minimum tax on the real gain (30)
  onAgePension: boolean; // exempt from the 30% minimum
}

export interface PersonTax {
  ordinary: number; // total ordinary assessable income
  gross: number; // bracket tax on ordinary income, before offsets
  lito: number; // Low Income Tax Offset applied
  sapto: number; // Seniors & Pensioners Tax Offset applied (0 if not a senior)
  incomeTax: number; // net ordinary income tax after LITO + SAPTO
  medicare: number; // 2% Medicare levy on employment income
  cgt: number; // tax on the realised capital gain (regime + 30% minimum)
  bySource: Record<string, number>; // chained net-tax increment per ordinary source (sums to incomeTax)
  total: number; // incomeTax + medicare + cgt
}

export function personTax(
  sources: { key: string; amount: number }[], // ordinary income, in chain order (e.g. salary, rent, dividends, work)
  employment: number, // salary + part-time work (base for Medicare)
  realizedGain: number, // outside-super realised gain (full real; the regime is applied here)
  senior: boolean, // at/over Age Pension age → SAPTO applies
  household: "single" | "couple",
  cgt: CgtParams,
): PersonTax {
  const netTax = (x: number) => (senior ? seniorIncomeTax(x, household) : residentIncomeTax(x));
  const bySource: Record<string, number> = {};
  let running = 0;
  let prev = 0; // netTax(0)
  for (const s of sources) {
    running += s.amount;
    const tax = netTax(Math.max(0, running));
    bySource[s.key] = tax - prev; // marginal increment (can be negative — e.g. negative gearing)
    prev = tax;
  }
  const O = Math.max(0, running);
  const gross = incomeTax(O);
  const litoApplied = Math.min(lito(O), gross);
  const afterLito = gross - litoApplied;
  const saptoApplied = senior ? Math.min(sapto(O, household), afterLito) : 0;
  const incomeTaxNet = afterLito - saptoApplied; // == netTax(O)
  const medicare = medicareLevy(Math.max(0, employment));
  let cgtTax = 0;
  const g = Math.max(0, realizedGain);
  if (g > 0) {
    if (cgt.regime === "discount") {
      cgtTax = Math.max(0, netTax(O + (1 - cgt.discountPct / 100) * g) - netTax(O));
    } else {
      const marginal = Math.max(0, netTax(O + g) - netTax(O));
      cgtTax = cgt.onAgePension ? marginal : Math.max(marginal, (cgt.minRatePct / 100) * g);
    }
  }
  return { ordinary: running, gross, lito: litoApplied, sapto: saptoApplied, incomeTax: incomeTaxNet, medicare, cgt: cgtTax, bySource, total: incomeTaxNet + medicare + cgtTax };
}
