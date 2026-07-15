import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";
import { residentIncomeTax, medicareLevy } from "../lib/au/tax";

const plan: RetirementPlan = {
  ...DEFAULT_PLAN, household: "single",
  people: [{ currentAge: 45, superBalance: 300_000, salary: 110_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  homeowner: true, outsideSuper: 100_000, annualOutsideSavings: 10_000,
  retirementAge: 65, spendingMode: "flat", targetSpending: 60_000, investmentReturn: 7, inflation: 2.5, lifeExpectancy: 90,
};

describe("Tax analysis fields", () => {
  const r = simulate(plan, cfg);
  const at = (age: number) => r.rows.find((x) => x.age === age)!.breakdown;

  it("records salary income tax + Medicare in the working years (previously hidden in take-home)", () => {
    const b = at(48);
    // Income tax includes the salary personal tax; on a $110k salary that's the LITO-adjusted resident tax.
    expect(b.incomeTax!).toBeGreaterThanOrEqual(residentIncomeTax(110_000) - 1);
    expect(b.medicare!).toBeCloseTo(medicareLevy(110_000), 0);
  });

  it("income tax collapses at retirement (super pension + Age Pension are tax-free)", () => {
    expect(at(70).incomeTax ?? 0).toBeLessThan(at(60).incomeTax! * 0.1);
    expect(at(70).medicare ?? 0).toBe(0);
  });

  it("capital gains appear only once units are sold in retirement", () => {
    expect(at(48).capitalGains ?? 0).toBe(0); // nothing realised while working
    const anyCgt = r.rows.some((x) => (x.breakdown.capitalGains ?? 0) > 1 && x.phase !== "accumulation");
    expect(anyCgt).toBe(true);
  });
});
