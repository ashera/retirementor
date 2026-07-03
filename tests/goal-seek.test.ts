import { describe, it, expect } from "vitest";
import { whatWillItTake } from "../lib/au/goalseek";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";

const base: RetirementPlan = {
  ...DEFAULT_PLAN,
  people: [{ ...DEFAULT_PLAN.people[0], currentAge: 45, superBalance: 200_000, salary: 110_000, voluntaryConcessional: 5_000 }],
  outsideSuper: 150_000,
  annualOutsideSavings: 15_000,
  retirementAge: 60,
  spendingMode: "flat",
  investmentReturn: 7,
  inflation: 2.5,
  lifeExpectancy: 95,
};

describe("Goal-seek", () => {
  it("offers concrete fixes for a plan that falls short", () => {
    const gs = whatWillItTake({ ...base, targetSpending: 95_000 }, cfg);
    expect(gs.lasts).toBe(false);
    expect(gs.maxSpend!).toBeLessThan(95_000);
    expect(gs.extraSavings!).toBeGreaterThan(0);
    expect(gs.retireAge!).toBeGreaterThan(60);
  });

  it("needs no extra saving for a plan that already lasts", () => {
    const gs = whatWillItTake({ ...base, targetSpending: 45_000 }, cfg);
    expect(gs.lasts).toBe(true);
    expect(gs.extraSavings).toBe(0);
  });

  it("finds a max sustainable spend that lasts but just above it does not", () => {
    const gs = whatWillItTake({ ...base, targetSpending: 95_000 }, cfg);
    const at = simulate({ ...base, targetSpending: gs.maxSpend! }, cfg);
    const above = simulate({ ...base, targetSpending: gs.maxSpend! + 5_000 }, cfg);
    expect(at.lastsToLifeExpectancy).toBe(true);
    expect(above.lastsToLifeExpectancy).toBe(false);
  });
});
