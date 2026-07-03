import { describe, it, expect } from "vitest";
import {
  DEFAULT_PLAN,
  spendingForAge,
  spendingRange,
  deriveStages,
  type RetirementPlan,
} from "../lib/au/types";

const staged: RetirementPlan = {
  ...DEFAULT_PLAN,
  spendingMode: "stages",
  targetSpending: 70_000,
  spendingStages: { goGo: 70_000, slowGo: 55_000, noGo: 42_000, slowGoAge: 75, noGoAge: 85 },
};

describe("Spending", () => {
  it("returns the flat amount at every age in flat mode", () => {
    const flat: RetirementPlan = { ...DEFAULT_PLAN, spendingMode: "flat", targetSpending: 60_000 };
    expect(spendingForAge(flat, 60)).toBe(60_000);
    expect(spendingForAge(flat, 90)).toBe(60_000);
  });

  it("steps spending down at the stage boundaries", () => {
    expect(spendingForAge(staged, 74)).toBe(70_000); // go-go
    expect(spendingForAge(staged, 75)).toBe(55_000); // slow-go starts
    expect(spendingForAge(staged, 84)).toBe(55_000);
    expect(spendingForAge(staged, 85)).toBe(42_000); // no-go starts
    expect(spendingForAge(staged, 95)).toBe(42_000);
  });

  it("reports the spend range", () => {
    expect(spendingRange({ ...DEFAULT_PLAN, spendingMode: "flat", targetSpending: 60_000 })).toEqual({
      min: 60_000,
      max: 60_000,
    });
    expect(spendingRange(staged)).toEqual({ min: 42_000, max: 70_000 });
  });

  it("derives sensible default stages from a base amount", () => {
    expect(deriveStages(100_000)).toEqual({
      goGo: 100_000,
      slowGo: 85_000,
      noGo: 70_000,
      slowGoAge: 75,
      noGoAge: 85,
    });
  });
});
