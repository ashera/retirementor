import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "../lib/au/config";
import {
  meansScore,
  residentialAnnualCost,
  dapAnnual,
  radRetention,
  radRefund,
  homeCareAnnualCost,
} from "../lib/au/agedCare";

const AC = DEFAULT_CONFIG.agedCare;

describe("aged care — means score", () => {
  it("is 0 for a low-asset, low-income full pensioner", () => {
    expect(meansScore({ assets: 40_000, income: 20_000 }, AC)).toBe(0);
  });
  it("is 1 for a self-funded retiree well above the full-contribution point", () => {
    expect(meansScore({ assets: 500_000, income: 10_000 }, AC)).toBe(1);
  });
  it("ramps linearly on assets between the free and full areas", () => {
    // midpoint of [61_500, 290_453]
    const mid = (AC.careAssetFreeArea + AC.careAssetFullArea) / 2;
    expect(meansScore({ assets: mid, income: 0 }, AC)).toBeCloseTo(0.5, 5);
  });
  it("takes the max of the asset and income ramps", () => {
    // low assets but high income → income ramp dominates
    const s = meansScore({ assets: 0, income: AC.careIncomeFullArea }, AC);
    expect(s).toBe(1);
  });
});

describe("aged care — residential annual cost", () => {
  it("charges the basic daily fee flat, regardless of means", () => {
    const poor = residentialAnnualCost({ means: { assets: 0, income: 0 } }, AC);
    const rich = residentialAnnualCost({ means: { assets: 1_000_000, income: 0 } }, AC);
    expect(poor.basic).toBeCloseTo(AC.basicDailyFee * 365, 4);
    expect(rich.basic).toBeCloseTo(AC.basicDailyFee * 365, 4);
  });

  it("scales hotelling by the means score with no cap", () => {
    const rich = residentialAnnualCost({ means: { assets: 1_000_000, income: 0 } }, AC);
    expect(rich.hotelling).toBeCloseTo(AC.hotellingMaxDaily * 365, 4);
    const poor = residentialAnnualCost({ means: { assets: 0, income: 0 } }, AC);
    expect(poor.hotelling).toBe(0);
  });

  it("charges full NCCC in an early year for a full contributor", () => {
    const r = residentialAnnualCost({ means: { assets: 1_000_000, income: 0 } }, AC);
    expect(r.nccc).toBeCloseTo(AC.ncccMaxDaily * 365, 4);
    expect(r.ncccExhausted).toBe(false);
  });

  it("caps NCCC at the remaining lifetime dollar room", () => {
    const paid = AC.ncccLifetimeCap - 5_000;
    const r = residentialAnnualCost(
      { means: { assets: 1_000_000, income: 0 }, ncccPaidToDate: paid },
      AC,
    );
    expect(r.nccc).toBeCloseTo(5_000, 4);
    expect(r.ncccExhausted).toBe(true);
  });

  it("stops NCCC once the max number of years is reached", () => {
    const r = residentialAnnualCost(
      { means: { assets: 1_000_000, income: 0 }, ncccYearsToDate: AC.ncccMaxYears },
      AC,
    );
    expect(r.nccc).toBe(0);
    expect(r.ncccExhausted).toBe(true);
    // basic + hotelling still apply
    expect(r.basic).toBeGreaterThan(0);
    expect(r.hotelling).toBeGreaterThan(0);
  });

  it("charges DAP = unpaid RAD × MPIR on the accommodation not pre-paid", () => {
    const r = residentialAnnualCost(
      { means: { assets: 1_000_000, income: 0 }, radUnpaid: AC.radNationalAvg },
      AC,
    );
    expect(r.dap).toBeCloseTo(AC.radNationalAvg * AC.mpir, 4);
  });

  it("pro-rates a partial year", () => {
    const full = residentialAnnualCost({ means: { assets: 1_000_000, income: 0 } }, AC);
    const half = residentialAnnualCost({ means: { assets: 1_000_000, income: 0 }, daysInCare: 182.5 }, AC);
    expect(half.basic).toBeCloseTo(full.basic / 2, 3);
    expect(half.hotelling).toBeCloseTo(full.hotelling / 2, 3);
  });

  it("total is the sum of the components", () => {
    const r = residentialAnnualCost(
      { means: { assets: 200_000, income: 40_000 }, radUnpaid: 300_000 },
      AC,
    );
    expect(r.total).toBeCloseTo(r.basic + r.hotelling + r.nccc + r.dap, 6);
  });
});

describe("aged care — accommodation (RAD/DAP)", () => {
  it("dapAnnual = balance × MPIR", () => {
    expect(dapAnnual(500_000, AC)).toBeCloseTo(500_000 * AC.mpir, 4);
    expect(dapAnnual(-1, AC)).toBe(0);
  });

  it("retains a % of the RAD per year up to the max years", () => {
    expect(radRetention(570_000, 3, AC)).toBeCloseTo(570_000 * 0.02 * 3, 4);
    // beyond the max years it caps (5 × 2% = 10%)
    expect(radRetention(570_000, 8, AC)).toBeCloseTo(570_000 * 0.02 * AC.radRetentionMaxYears, 4);
  });

  it("refund = RAD less retention", () => {
    expect(radRefund(570_000, 3, AC)).toBeCloseTo(570_000 - 570_000 * 0.02 * 3, 4);
  });
});

describe("aged care — home care & framing", () => {
  it("home-care out-of-pocket scales with the means score", () => {
    expect(homeCareAnnualCost({ assets: 1_000_000, income: 0 }, AC)).toBeCloseTo(AC.homeCareAnnualEstimate, 4);
    expect(homeCareAnnualCost({ assets: 0, income: 0 }, AC)).toBe(0);
  });
});
