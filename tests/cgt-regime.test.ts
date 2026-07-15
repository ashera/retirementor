import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG, type EngineConfig } from "../lib/au/config";
import { DEFAULT_PLAN, type PropertyDetail, type RetirementPlan } from "../lib/au/types";
import { capitalGainsTax } from "../lib/au/property";
import { incomeTax } from "../lib/au/tax";

const prop: PropertyDetail = {
  value: 350_000, growthReal: 2, grossYield: 4, costRatio: 25, loanBalance: 0,
  loanRate: 6, purchasePrice: 300_000, strategy: "hold", sellAtAge: 80,
};

describe("CGT regime — property (unit)", () => {
  const rules = (over: Partial<Parameters<typeof capitalGainsTax>[2] & object> = {}) => ({
    regime: "discount" as const, discountPct: 50, minRatePct: 30, onAgePension: false, ...over,
  });

  it("discount regime taxes 50% of the gain at marginal rates", () => {
    // gain 50k → 25k taxable.
    expect(capitalGainsTax(prop, 350_000, rules({ regime: "discount" }))).toBeCloseTo(incomeTax(25_000), 5);
  });

  it("indexed regime taxes the WHOLE real gain, with a 30% minimum (non-pensioner)", () => {
    // gain 50k: marginal incomeTax(50k) ≈ $5.5k < 30% × 50k = $15k → the floor binds.
    expect(capitalGainsTax(prop, 350_000, rules({ regime: "indexed" }))).toBeCloseTo(15_000, 5);
  });

  it("Age Pension recipients are exempt from the 30% minimum (marginal only)", () => {
    expect(capitalGainsTax(prop, 350_000, rules({ regime: "indexed", onAgePension: true }))).toBeCloseTo(incomeTax(50_000), 5);
  });

  it("indexed taxes more than discount for the same gain", () => {
    expect(capitalGainsTax(prop, 350_000, rules({ regime: "indexed" })))
      .toBeGreaterThan(capitalGainsTax(prop, 350_000, rules({ regime: "discount" })));
  });
});

describe("CGT regime — outside super (engine)", () => {
  const fire = (): RetirementPlan => ({
    ...DEFAULT_PLAN, household: "single",
    people: [{ currentAge: 50, superBalance: 300_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
    homeowner: true, outsideSuper: 1_500_000, annualOutsideSavings: 0,
    retirementAge: 50, spendingMode: "flat", targetSpending: 70_000,
    investmentReturn: 7, inflation: 2.5, lifeExpectancy: 90,
  });
  const discountCfg: EngineConfig = { ...DEFAULT_CONFIG, outsideTax: { ...DEFAULT_CONFIG.outsideTax, cgtRegime: "discount" } };

  it("defaults to the indexed (post-2027) regime", () => {
    expect(DEFAULT_CONFIG.outsideTax.cgtRegime).toBe("indexed");
  });

  it("the indexed regime taxes realised gains more than the 50% discount", () => {
    const tax = (c: EngineConfig, age: number) => simulate(fire(), c).rows.find((x) => x.age === age)!.breakdown.outsideTax;
    // Year 0 has no realised gain (fresh basis) → equal; later years realise gains → indexed higher.
    expect(tax(DEFAULT_CONFIG, 58)).toBeGreaterThan(tax(discountCfg, 58));
  });
});
