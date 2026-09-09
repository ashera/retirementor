import { describe, it, expect } from "vitest";
import { DEFAULT_PLAN, type RetirementPlan } from "@/lib/au/types";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { bestSellYear } from "@/lib/au/sellTiming";

const BASE: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ ...DEFAULT_PLAN.people[0], currentAge: 60, salary: 0, superBalance: 600_000 }],
  superMode: "individual",
  homeowner: true,
  outsideSuper: 50_000,
  annualOutsideSavings: 0,
  retirementAge: 60,
  spendingMode: "flat",
  targetSpending: 60_000,
  lifeExpectancy: 90,
  investmentProperties: [
    { value: 800_000, growthReal: 2, grossYield: 4, costRatio: 28, loanBalance: 200_000, loanRate: 6, purchasePrice: 400_000, strategy: "hold", sellAtAge: 70 },
  ],
};

describe("bestSellYear", () => {
  it("scans the card's age range and returns the spend-maximising age", () => {
    const r = bestSellYear(BASE, { active: [], values: {} }, DEFAULT_CONFIG, "sell-prop-0");
    expect(r).not.toBeNull();
    expect(r!.range).toEqual({ min: 60, max: 90 });
    expect(r!.curve.length).toBe(31); // 60..90 inclusive
    // bestSpend is the maximum sustainable spend over the curve, and bestAge points at it.
    const maxSpend = Math.max(...r!.curve.map((p) => p.spend));
    expect(r!.bestSpend).toBe(maxSpend);
    expect(r!.curve.find((p) => p.age === r!.bestAge)?.spend).toBe(r!.bestSpend);
    // Not active yet → no "current" comparison.
    expect(r!.currentAge).toBeNull();
    expect(r!.currentSpend).toBeNull();
    expect(r!.gainVsCurrent).toBe(0);
    // sellBeatsHold is consistent with the hold baseline.
    expect(r!.sellBeatsHold).toBe(r!.bestSpend >= r!.holdSpend);
  });

  it("compares against the currently-set sell age when the lever is active", () => {
    const r = bestSellYear(BASE, { active: ["sell-prop-0"], values: { "sell-prop-0": { age: 70 } } }, DEFAULT_CONFIG, "sell-prop-0");
    expect(r).not.toBeNull();
    expect(r!.currentAge).toBe(70);
    expect(r!.currentSpend).toBe(r!.curve.find((p) => p.age === 70)?.spend ?? null);
    // The best year sustains at least as much spend as the currently-chosen year.
    expect(r!.bestSpend).toBeGreaterThanOrEqual(r!.currentSpend!);
    expect(r!.gainVsCurrent).toBeCloseTo(r!.bestSpend - r!.currentSpend!, 2);
  });

  it("returns null for a non-sell-property card id", () => {
    expect(bestSellYear(BASE, { active: [], values: {} }, DEFAULT_CONFIG, "downsize")).toBeNull();
  });
});
