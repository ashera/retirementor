import type { AgedCareConfig } from "./config";

/**
 * Aged-care cost model (v1, general information). Pure arithmetic over the 2026
 * post-reform residential fee structure — no engine/DB coupling, so it's unit
 * testable in isolation and reused by both the simulate loop and its oracle.
 *
 * Residential fees (per resident, per year):
 *   • basic daily fee   — flat, NOT means-tested
 *   • hotelling         — means-tested, NO cap
 *   • NCCC              — means-tested, capped ($ lifetime AND a max number of years)
 *   • DAP               — daily interest on any UNPAID accommodation amount (RAD × MPIR)
 * Clinical care is fully government-funded (not charged here).
 *
 * The statutory means test combines income and assets into a "means-tested
 * amount"; v1 approximates it with a transparent 0–1 `meansScore` (see below),
 * documented as an approximation the full sub-model (v2) will replace.
 */

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Means-test indicators for a care year (today's dollars). */
export interface CareMeans {
  assets: number; // assessable assets (RAD-exempt), incl. the capped former home
  income: number; // assessable annual income
}

/**
 * v1 means score in [0,1]: the max of an asset ramp and an income ramp, each a
 * clamped linear interpolation between its free area and full-contribution point.
 * A self-funded retiree lands near 1 (max hotelling + NCCC); a low-asset,
 * low-income full pensioner near 0.
 */
export function meansScore(means: CareMeans, config: AgedCareConfig): number {
  const assetScore = clamp01(
    (means.assets - config.careAssetFreeArea) / Math.max(1, config.careAssetFullArea - config.careAssetFreeArea),
  );
  const incomeScore = clamp01(
    (means.income - config.careIncomeFreeArea) / Math.max(1, config.careIncomeFullArea - config.careIncomeFreeArea),
  );
  return Math.max(assetScore, incomeScore);
}

export interface ResidentialCostInput {
  means: CareMeans;
  daysInCare?: number; // default 365 (partial first/last year)
  radUnpaid?: number; // accommodation amount NOT pre-paid as a lump sum → charged as DAP
  ncccPaidToDate?: number; // $ NCCC paid in prior years (lifetime cap tracking)
  ncccYearsToDate?: number; // whole years of NCCC already charged (max-years cap tracking)
}

export interface ResidentialCost {
  basic: number;
  hotelling: number;
  nccc: number;
  dap: number;
  total: number;
  ncccExhausted: boolean; // the NCCC $ or year cap is reached this year
}

/** One resident-year of residential aged-care fees (today's dollars). */
export function residentialAnnualCost(input: ResidentialCostInput, config: AgedCareConfig): ResidentialCost {
  const days = input.daysInCare ?? 365;
  const frac = Math.max(0, days) / 365;
  const score = meansScore(input.means, config);

  const basic = config.basicDailyFee * days;
  const hotelling = config.hotellingMaxDaily * score * days; // no cap

  // NCCC: means-tested, stops at the lifetime $ cap OR after ncccMaxYears.
  const paid = Math.max(0, input.ncccPaidToDate ?? 0);
  const yearsDone = Math.max(0, input.ncccYearsToDate ?? 0);
  const roomLeft = Math.max(0, config.ncccLifetimeCap - paid);
  const withinYears = yearsDone < config.ncccMaxYears;
  const ncccRaw = withinYears ? config.ncccMaxDaily * score * days : 0;
  const nccc = Math.min(ncccRaw, roomLeft);
  const ncccExhausted = !withinYears || nccc >= roomLeft - 0.005;

  const dap = Math.max(0, input.radUnpaid ?? 0) * config.mpir * frac;

  return { basic, hotelling, nccc, dap, total: basic + hotelling + nccc + dap, ncccExhausted };
}

/** Annual DAP on an unpaid accommodation balance (RAD × MPIR). */
export function dapAnnual(radUnpaid: number, config: AgedCareConfig): number {
  return Math.max(0, radUnpaid) * config.mpir;
}

/**
 * Amount of a RAD the provider retains on exit (a new post-reform charge): a %
 * per year for a capped number of years. The rest refunds to the estate.
 */
export function radRetention(radAmount: number, yearsHeld: number, config: AgedCareConfig): number {
  const years = Math.min(Math.ceil(Math.max(0, yearsHeld)), config.radRetentionMaxYears);
  return Math.max(0, radAmount) * config.radRetentionPctPerYear * years;
}

/** RAD amount refunded to the estate on exit (net of retention). */
export function radRefund(radAmount: number, yearsHeld: number, config: AgedCareConfig): number {
  return Math.max(0, radAmount - radRetention(radAmount, yearsHeld, config));
}

/**
 * Simplified Support-at-Home (home-care) annual out-of-pocket for v1: the config
 * estimate scaled by the means score (clinical care is free; contributions rise
 * with means). The full level/quarterly-budget model is deferred to v2.
 */
export function homeCareAnnualCost(means: CareMeans, config: AgedCareConfig, daysInCare = 365): number {
  return config.homeCareAnnualEstimate * meansScore(means, config) * (Math.max(0, daysInCare) / 365);
}
