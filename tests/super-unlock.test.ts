import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";

const base = (over: Partial<RetirementPlan>): RetirementPlan => ({
  ...DEFAULT_PLAN, homeowner: true, outsideSuper: 300_000, annualOutsideSavings: 0,
  spendingMode: "flat", targetSpending: 60_000, investmentReturn: 6, inflation: 2.5, lifeExpectancy: 90, ...over,
});

describe("superUnlockAge (preserved super transferring mid-retirement)", () => {
  it("flags the oldest-person age when a younger partner's super unlocks at 60", () => {
    // Person 0 is 58 and retires at 60; partner is 52 (54 at retirement). Partner
    // turns 60 — and her super transfers to pension — when person 0 is 66.
    const r = simulate(base({
      household: "couple", superMode: "individual",
      people: [
        { currentAge: 58, superBalance: 900_000, salary: 120_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
        { currentAge: 52, superBalance: 600_000, salary: 90_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
      ],
      retirementAge: 60,
    }), cfg);
    expect(r.superUnlockAge).toBe(66);
    // Sanity: the accumulation band collapses into pension that year.
    const at = (age: number) => r.rows.find((x) => x.age === age)!.breakdown;
    expect(at(65).accumSuper).toBeGreaterThan(1);
    expect(at(66).accumSuper).toBeLessThan(1);
  });

  it("is null when everyone retires at or after preservation age (transfer = retirement)", () => {
    const r = simulate(base({
      household: "single",
      people: [{ currentAge: 60, superBalance: 600_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
      retirementAge: 60,
    }), cfg);
    expect(r.superUnlockAge).toBeNull();
  });

  it("flags a single early retiree's own super unlocking at preservation age", () => {
    const r = simulate(base({
      household: "single", outsideSuper: 800_000,
      people: [{ currentAge: 52, superBalance: 500_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
      retirementAge: 55, // bridge: retired but under 60, super preserved until 60
    }), cfg);
    expect(r.superUnlockAge).toBe(60);
  });
});
