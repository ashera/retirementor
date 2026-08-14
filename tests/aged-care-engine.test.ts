import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type AgedCarePlan, type RetirementPlan } from "../lib/au/types";
import { residentialAnnualCost } from "../lib/au/agedCare";

const AC = cfg.agedCare;

// A solvent single homeowner already at pension age, self-funded. inflation 0 so
// the model's today's-dollar figures line up cleanly with the config constants.
const base: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ currentAge: 67, superBalance: 700_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  homeowner: true,
  home: { value: 900_000, growthReal: 0 },
  outsideSuper: 300_000,
  annualOutsideSavings: 0,
  retirementAge: 67,
  spendingMode: "flat",
  targetSpending: 50_000,
  investmentReturn: 6,
  inflation: 0,
  lifeExpectancy: 92,
};

const withCare = (over: Partial<AgedCarePlan>): RetirementPlan => ({
  ...base,
  agedCare: {
    enabled: true,
    framing: "assume",
    careType: "residential",
    entryAge: 85,
    durationYears: 3,
    accommodation: "dap",
    homeAction: "keep-vacant",
    ...over,
  },
});

const rowAt = (p: RetirementPlan, age: number) => simulate(p, cfg).rows.find((r) => r.age === age)!;

describe("aged care — engine integration", () => {
  it("is inert when disabled (byte-identical rows)", () => {
    const off = simulate(base, cfg).rows;
    const disabled = simulate({ ...base, agedCare: { ...withCare({}).agedCare!, enabled: false } }, cfg).rows;
    expect(disabled.map((r) => r.total)).toEqual(off.map((r) => r.total));
  });

  it("adds a care-cost overlay in the care years only", () => {
    const sim = simulate(withCare({}), cfg).rows;
    expect(sim.find((r) => r.age === 84)!.breakdown.agedCareTotal ?? 0).toBe(0); // before entry
    expect(sim.find((r) => r.age === 85)!.breakdown.agedCareTotal ?? 0).toBeGreaterThan(0); // entry
    expect(sim.find((r) => r.age === 87)!.breakdown.agedCareTotal ?? 0).toBeGreaterThan(0); // last care year
    expect(sim.find((r) => r.age === 88)!.breakdown.agedCareTotal ?? 0).toBe(0); // after
  });

  it("charges the basic daily fee flat and DAP = RAD × MPIR in a DAP plan", () => {
    const b = rowAt(withCare({ accommodation: "dap" }), 85).breakdown;
    expect(b.agedCareBasic).toBeCloseTo(AC.basicDailyFee * 365, 2);
    expect(b.agedCareDAP).toBeCloseTo(AC.radNationalAvg * AC.mpir, 2);
    expect(b.radHeld ?? 0).toBe(0); // no lump sum in a DAP plan
  });

  it("lowers the retirement balance vs the no-care baseline", () => {
    const withB = rowAt(withCare({}), 88).total; // year after care
    const noB = rowAt(base, 88).total;
    expect(withB).toBeLessThan(noB);
  });

  it("stops the NCCC after the max number of years but keeps basic + hotelling", () => {
    const sim = simulate(withCare({ durationYears: 6 }), cfg).rows;
    const capYear = sim.find((r) => r.age === 85 + AC.ncccMaxYears)!.breakdown; // (maxYears)th year past entry
    expect(capYear.agedCareNCCC ?? 0).toBe(0);
    expect(capYear.agedCareBasic ?? 0).toBeGreaterThan(0);
    expect(capYear.agedCareHotelling ?? 0).toBeGreaterThan(0);
  });

  it("hand-derives the entry-year fees for a max-means retiree (independent oracle)", () => {
    // This retiree is well above the full-contribution point (~$290k assets) at 85,
    // so the means score is 1 → max hotelling + full NCCC. Derived WITHOUT the module.
    const b = rowAt(withCare({ accommodation: "dap" }), 85).breakdown;
    expect(b.agedCareBasic).toBeCloseTo(AC.basicDailyFee * 365, 2);
    expect(b.agedCareHotelling).toBeCloseTo(AC.hotellingMaxDaily * 365, 2);
    expect(b.agedCareNCCC).toBeCloseTo(AC.ncccMaxDaily * 365, 2);
    expect(b.agedCareDAP).toBeCloseTo(AC.radNationalAvg * AC.mpir, 2);
    expect(b.agedCareTotal).toBeCloseTo(
      (AC.basicDailyFee + AC.hotellingMaxDaily + AC.ncccMaxDaily) * 365 + AC.radNationalAvg * AC.mpir,
      2,
    );
  });

  it("independently reproduces the entry-year residential cost from the module (oracle)", () => {
    const b = rowAt(withCare({ accommodation: "dap" }), 85).breakdown;
    // Reconstruct the engine's v1 means indicator: opening assessable assets +
    // capped former home (kept), income folded in at v2.
    const means = {
      assets: b.openingOutside + b.openingSuper + Math.min(b.homeValue, AC.homeValueCapMeansTest),
      income: 0,
    };
    const oracle = residentialAnnualCost(
      { means, radUnpaid: AC.radNationalAvg, ncccPaidToDate: 0, ncccYearsToDate: 0 },
      AC,
    );
    expect(b.agedCareTotal).toBeCloseTo(oracle.total, 2);
    expect(b.agedCareBasic).toBeCloseTo(oracle.basic, 2);
    expect(b.agedCareHotelling).toBeCloseTo(oracle.hotelling, 2);
    expect(b.agedCareNCCC).toBeCloseTo(oracle.nccc, 2);
    expect(b.agedCareDAP).toBeCloseTo(oracle.dap, 2);
  });
});

describe("aged care — RAD accommodation & means test", () => {
  it("pays a refundable deposit at entry and preserves it (RAD plan)", () => {
    const sim = simulate(withCare({ accommodation: "rad", radAmount: 400_000, radFundedFrom: "outside" }), cfg).rows;
    const entry = sim.find((r) => r.age === 85)!.breakdown;
    expect(entry.radDrawn ?? 0).toBeGreaterThan(0);
    expect(entry.radHeld ?? 0).toBeCloseTo(400_000, 0);
    expect(entry.agedCareDAP ?? 0).toBe(0); // fully lump-summed → no DAP
    // The deposit is preserved for the rest of the sim.
    expect(sim.find((r) => r.age === 90)!.breakdown.radHeld ?? 0).toBeCloseTo(400_000, 0);
  });

  it("the RAD (exempt from the assets test) lifts the Age Pension vs an equivalent DAP plan", () => {
    const radPension = rowAt(withCare({ accommodation: "rad", radAmount: 400_000, radFundedFrom: "outside" }), 85).agePension;
    const dapPension = rowAt(withCare({ accommodation: "dap" }), 85).agePension;
    expect(radPension).toBeGreaterThan(dapPension);
  });

  it("selling the former home zeroes it and helps fund the RAD", () => {
    const sim = simulate(withCare({ accommodation: "rad", radAmount: 400_000, homeAction: "sell" }), cfg).rows;
    const entry = sim.find((r) => r.age === 85)!.breakdown;
    expect(entry.homeValue).toBe(0); // home sold at entry
    expect(entry.radHeld ?? 0).toBeCloseTo(400_000, 0);
    // With the home funding the RAD, less is drawn from the liquid pools than when
    // there's no home sale, so the spendable balance is higher.
    const keptBalance = rowAt(withCare({ accommodation: "rad", radAmount: 400_000, homeAction: "keep-vacant" }), 86).total;
    expect(sim.find((r) => r.age === 86)!.total).toBeGreaterThan(keptBalance);
  });
});

describe("aged care — probabilistic framing", () => {
  it("weights an expected DAP-financed cost by the entry probability, with no balance-sheet events", () => {
    const prob = rowAt(withCare({ framing: "probabilistic" }), 85).breakdown;
    const means = {
      assets: prob.openingOutside + prob.openingSuper + Math.min(prob.homeValue, AC.homeValueCapMeansTest),
      income: 0,
    };
    const full = residentialAnnualCost(
      { means, radUnpaid: AC.radNationalAvg, ncccPaidToDate: 0, ncccYearsToDate: 0 },
      AC,
    );
    expect(prob.agedCareTotal).toBeCloseTo(full.total * AC.entryProbability, 1);
    expect(prob.radHeld ?? 0).toBe(0); // no lump sum
    expect(prob.radDrawn ?? 0).toBe(0);
  });
});
