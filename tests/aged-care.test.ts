import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "../lib/au/config";
import {
  hotellingDaily,
  accommodationMeans,
  residentialAnnualCost,
  dapAnnual,
  radRetention,
  radRefund,
  homeCareAnnualCost,
} from "../lib/au/agedCare";

const AC = DEFAULT_CONFIG.agedCare;
const DAYS = 364; // statutory divisor

describe("aged care — hotelling contribution (HSC) means test", () => {
  it("is 0 below the asset threshold with no income", () => {
    expect(hotellingDaily({ assets: 200_000, income: 0 }, AC)).toBe(0);
  });

  it("sums the asset and income tapers, ÷ 364, uncapped below the daily max", () => {
    // assets $280k, income $100k → both tapers bite but the total stays under the cap
    const assetPart = AC.meansAssetTaper * (280_000 - AC.hscAssetThreshold);
    const incomePart = AC.meansIncomeTaper * (100_000 - AC.hscIncomeThreshold);
    const expected = (assetPart + incomePart) / DAYS;
    expect(expected).toBeLessThan(AC.hotellingMaxDaily); // guard: this case is meant to be uncapped
    expect(hotellingDaily({ assets: 280_000, income: 100_000 }, AC)).toBeCloseTo(expected, 6);
  });

  it("caps at the daily maximum for a wealthy resident", () => {
    expect(hotellingDaily({ assets: 1_000_000, income: 0 }, AC)).toBeCloseTo(AC.hotellingMaxDaily, 6);
  });
});

describe("aged care — accommodation means test (low-means status)", () => {
  it("is low-means when the means-tested amount is below the supplement", () => {
    const a = accommodationMeans({ assets: 100_000, income: 0 }, AC);
    const expectedMta = (AC.accomAssetTaper * (100_000 - AC.accomAssetFreeArea)) / DAYS;
    expect(a.mtaDaily).toBeCloseTo(expectedMta, 6);
    expect(a.lowMeans).toBe(true);
    expect(a.dac).toBeCloseTo(expectedMta, 6);
  });

  it("is not low-means once the means-tested amount reaches the supplement", () => {
    const a = accommodationMeans({ assets: 1_000_000, income: 0 }, AC);
    expect(a.lowMeans).toBe(false);
    expect(a.dac).toBeCloseTo(AC.maxAccommodationSupplement, 6);
  });
});

describe("aged care — residential annual cost", () => {
  it("charges the basic daily fee flat, regardless of means", () => {
    const poor = residentialAnnualCost({ means: { assets: 0, income: 0 } }, AC);
    const rich = residentialAnnualCost({ means: { assets: 1_000_000, income: 0 } }, AC);
    expect(poor.basic).toBeCloseTo(AC.basicDailyFee * 365, 4);
    expect(rich.basic).toBeCloseTo(AC.basicDailyFee * 365, 4);
  });

  it("charges the means-tested hotelling contribution, capped at the daily max", () => {
    const rich = residentialAnnualCost({ means: { assets: 1_000_000, income: 0 } }, AC);
    expect(rich.hotelling).toBeCloseTo(AC.hotellingMaxDaily * 365, 4);
    const poor = residentialAnnualCost({ means: { assets: 0, income: 0 } }, AC);
    expect(poor.hotelling).toBe(0);
  });

  it("only charges NCCC once the full hotelling contribution is being paid", () => {
    // assets below the HSC cap point → HSC not maxed → no NCCC
    const partial = residentialAnnualCost({ means: { assets: 300_000, income: 0 } }, AC);
    expect(partial.workings.hsc.capped).toBe(false);
    expect(partial.nccc).toBe(0);
  });

  it("charges NCCC for a full contributor, capped at the daily max", () => {
    const r = residentialAnnualCost({ means: { assets: 1_500_000, income: 0 } }, AC);
    expect(r.workings.hsc.capped).toBe(true);
    expect(r.workings.nccc.applied).toBe(true);
    expect(r.nccc).toBeCloseTo(AC.ncccMaxDaily * 365, 4);
    expect(r.ncccExhausted).toBe(false);
  });

  it("caps NCCC at the remaining lifetime dollar room", () => {
    const paid = AC.ncccLifetimeCap - 5_000;
    const r = residentialAnnualCost(
      { means: { assets: 1_500_000, income: 0 }, ncccPaidToDate: paid },
      AC,
    );
    expect(r.nccc).toBeCloseTo(5_000, 4);
    expect(r.ncccExhausted).toBe(true);
  });

  it("stops NCCC once the max number of years is reached", () => {
    const r = residentialAnnualCost(
      { means: { assets: 1_500_000, income: 0 }, ncccYearsToDate: AC.ncccMaxYears },
      AC,
    );
    expect(r.nccc).toBe(0);
    expect(r.ncccExhausted).toBe(true);
    // basic + hotelling still apply
    expect(r.basic).toBeGreaterThan(0);
    expect(r.hotelling).toBeGreaterThan(0);
  });

  it("charges the market DAP = unpaid RAD × MPIR for a non-low-means resident", () => {
    const r = residentialAnnualCost(
      { means: { assets: 1_500_000, income: 0 }, radUnpaid: AC.radNationalAvg },
      AC,
    );
    expect(r.lowMeans).toBe(false);
    expect(r.dap).toBeCloseTo(AC.radNationalAvg * AC.mpir, 4);
  });

  it("caps a low-means resident's accommodation at the DAC when applyLowMeans is set", () => {
    const r = residentialAnnualCost(
      { means: { assets: 100_000, income: 0 }, radUnpaid: AC.radNationalAvg, applyLowMeans: true },
      AC,
    );
    expect(r.lowMeans).toBe(true);
    const dac = accommodationMeans({ assets: 100_000, income: 0 }, AC).dac;
    expect(r.dap).toBeCloseTo(dac * 365, 4);
    expect(r.dap).toBeLessThan(AC.radNationalAvg * AC.mpir);
  });

  it("reports low-means but keeps the market DAP by default (engine accounting)", () => {
    const r = residentialAnnualCost(
      { means: { assets: 100_000, income: 0 }, radUnpaid: AC.radNationalAvg },
      AC,
    );
    expect(r.lowMeans).toBe(true);
    expect(r.dap).toBeCloseTo(AC.radNationalAvg * AC.mpir, 4);
  });

  it("pro-rates a partial year", () => {
    const full = residentialAnnualCost({ means: { assets: 1_500_000, income: 0 } }, AC);
    const half = residentialAnnualCost({ means: { assets: 1_500_000, income: 0 }, daysInCare: 182.5 }, AC);
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
  it("home-care out-of-pocket scales with the hotelling means test", () => {
    expect(homeCareAnnualCost({ assets: 1_000_000, income: 0 }, AC)).toBeCloseTo(AC.homeCareAnnualEstimate, 4);
    expect(homeCareAnnualCost({ assets: 0, income: 0 }, AC)).toBe(0);
  });
});
