import type { AgedCareConfig } from "./config";

/**
 * Aged-care cost model over the 1 November 2025 Aged Care Act fee structure. Pure
 * arithmetic — no engine/DB coupling, so it's unit-testable and reused by the simulate
 * loop, its oracle and the /learn calculator.
 *
 * Residential fees (per resident, per year):
 *   • basic daily fee   — flat, NOT means-tested
 *   • hotelling (HSC)   — means-tested, capped at a daily max (no lifetime cap)
 *   • care (NCCC)       — means-tested, capped daily + a $ lifetime AND a max years
 *   • accommodation     — market room price as a RAD/DAP, UNLESS you're "low means"
 *                         (government pays the supplement; you pay a capped DAC instead)
 * Clinical care is fully government-funded (not charged here).
 *
 * The statutory means test: each contribution is the SUM of an asset taper (a % p.a. of
 * assets over a threshold) and an income taper (a % of income over a threshold), divided
 * by 364 to a daily amount and capped. This replaces the earlier max()-of-ramps proxy.
 */

const MEANS_DAYS = 364; // statutory divisor turning an annual means-tested amount into a daily rate
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Means-test indicators for a care year (today's dollars). */
export interface CareMeans {
  assets: number; // assessable assets (RAD-exempt), incl. the capped former home
  income: number; // assessable annual income
}

/** The workings behind one means-tested contribution, for showing the calculation. */
export interface ContributionWorkings {
  assetThreshold: number;
  incomeThreshold: number;
  assetPart: number; // annual $: taper × assets over the threshold
  incomePart: number; // annual $: taper × income over the threshold
  dailyUncapped: number; // (assetPart + incomePart) / 364
  maxDaily: number;
  daily: number; // min(maxDaily, dailyUncapped)
  capped: boolean; // the daily max binds
}

/** A means-tested contribution (HSC or NCCC) = asset taper + income taper, per day. */
function contribution(
  means: CareMeans,
  config: AgedCareConfig,
  assetThreshold: number,
  incomeThreshold: number,
  maxDaily: number,
): ContributionWorkings {
  const assetPart = config.meansAssetTaper * Math.max(0, means.assets - assetThreshold);
  const incomePart = config.meansIncomeTaper * Math.max(0, means.income - incomeThreshold);
  const dailyUncapped = (assetPart + incomePart) / MEANS_DAYS;
  const daily = Math.min(maxDaily, dailyUncapped);
  return { assetThreshold, incomeThreshold, assetPart, incomePart, dailyUncapped, maxDaily, daily, capped: dailyUncapped >= maxDaily };
}

/** Daily Hotelling Supplement Contribution. */
export function hotellingDaily(means: CareMeans, config: AgedCareConfig): number {
  return contribution(means, config, config.hscAssetThreshold, config.hscIncomeThreshold, config.hotellingMaxDaily).daily;
}

export interface AccommodationMeans {
  assetPart: number; // annual $
  incomePart: number; // annual $
  mtaDaily: number; // the daily means-tested amount
  maxSupplement: number;
  lowMeans: boolean; // MTA below the max supplement → government subsidises the room
  dac: number; // daily accommodation contribution = min(MTA, max supplement)
}

/** Accommodation means test: low-means status + the capped Daily Accommodation Contribution. */
export function accommodationMeans(means: CareMeans, config: AgedCareConfig): AccommodationMeans {
  const assetPart = config.accomAssetTaper * Math.max(0, means.assets - config.accomAssetFreeArea);
  const incomePart = config.accomIncomeTaper * Math.max(0, means.income - config.accomIncomeFreeArea);
  const mtaDaily = (assetPart + incomePart) / MEANS_DAYS;
  const lowMeans = mtaDaily < config.maxAccommodationSupplement;
  return { assetPart, incomePart, mtaDaily, maxSupplement: config.maxAccommodationSupplement, lowMeans, dac: Math.min(mtaDaily, config.maxAccommodationSupplement) };
}

export interface ResidentialCostInput {
  means: CareMeans;
  daysInCare?: number; // default 365 (partial first/last year)
  radUnpaid?: number; // market accommodation amount NOT pre-paid as a lump → charged as DAP
  ncccPaidToDate?: number; // $ NCCC paid in prior years (lifetime cap tracking)
  ncccYearsToDate?: number; // whole years of NCCC already charged (max-years cap tracking)
  applyLowMeans?: boolean; // cap accommodation at the DAC when low-means (calculator). Default OFF so the
  // engine keeps its RAD/DAP shortfall accounting (which assumes market pricing). lowMeans is always
  // REPORTED in the return for display; this flag only controls whether it CHANGES the charged dap.
}

export interface ResidentialCost {
  basic: number;
  hotelling: number;
  nccc: number;
  dap: number; // market DAP, or the capped DAC when low-means
  total: number;
  ncccExhausted: boolean; // the NCCC $ or year cap is reached this year
  lowMeans: boolean; // accommodation is government-subsidised this year
  workings: { hsc: ContributionWorkings; nccc: ContributionWorkings & { applied: boolean }; accom: AccommodationMeans };
}

/** One resident-year of residential aged-care fees (today's dollars). */
export function residentialAnnualCost(input: ResidentialCostInput, config: AgedCareConfig): ResidentialCost {
  const days = input.daysInCare ?? 365;
  const frac = Math.max(0, days) / 365;

  const hsc = contribution(input.means, config, config.hscAssetThreshold, config.hscIncomeThreshold, config.hotellingMaxDaily);
  const basic = config.basicDailyFee * days;
  const hotelling = hsc.daily * days;

  // NCCC is only assessed once the full Hotelling contribution is being paid (its higher
  // thresholds enforce that; the guard makes it explicit). Then it's capped: daily, a $
  // lifetime cap, and a max number of years.
  const ncccW = contribution(input.means, config, config.ncccAssetThreshold, config.ncccIncomeThreshold, config.ncccMaxDaily);
  const paid = Math.max(0, input.ncccPaidToDate ?? 0);
  const yearsDone = Math.max(0, input.ncccYearsToDate ?? 0);
  const roomLeft = Math.max(0, config.ncccLifetimeCap - paid);
  const withinYears = yearsDone < config.ncccMaxYears;
  const applied = hsc.capped && withinYears;
  const ncccRaw = applied ? ncccW.daily * days : 0;
  const nccc = Math.min(ncccRaw, roomLeft);
  const ncccExhausted = !withinYears || nccc >= roomLeft - 0.005;

  // Accommodation: a low-means resident's room is government-subsidised — they pay a Daily
  // Accommodation Contribution (min of their means-tested amount and the supplement, and
  // never above the market daily price), not the advertised RAD/DAP.
  const accom = accommodationMeans(input.means, config);
  const marketDap = Math.max(0, input.radUnpaid ?? 0) * config.mpir * frac;
  const dap = input.applyLowMeans && accom.lowMeans ? Math.min(accom.dac * days, marketDap) : marketDap;

  return {
    basic,
    hotelling,
    nccc,
    dap,
    total: basic + hotelling + nccc + dap,
    ncccExhausted,
    lowMeans: accom.lowMeans,
    workings: { hsc, nccc: { ...ncccW, applied }, accom },
  };
}

/** Annual DAP on an unpaid accommodation balance (RAD × MPIR). */
export function dapAnnual(radUnpaid: number, config: AgedCareConfig): number {
  return Math.max(0, radUnpaid) * config.mpir;
}

/**
 * Amount of a RAD the provider retains on exit (a post-reform charge): a % per year for
 * a capped number of years. The rest refunds to the estate.
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
 * Simplified Support-at-Home (home-care) annual out-of-pocket: the config estimate scaled
 * by how means-tested the person is (0 for a full pensioner, up to 1 once they'd pay the
 * full Hotelling contribution). Clinical care is free. The full level/quarterly-budget
 * model is deferred.
 */
export function homeCareAnnualCost(means: CareMeans, config: AgedCareConfig, daysInCare = 365): number {
  const factor = clamp01(hotellingDaily(means, config) / Math.max(0.0001, config.hotellingMaxDaily));
  return config.homeCareAnnualEstimate * factor * (Math.max(0, daysInCare) / 365);
}
