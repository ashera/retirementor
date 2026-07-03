import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import {
  DEFAULT_PLAN,
  DEFAULT_PARTNER,
  startingSuperBalances,
  type RetirementPlan,
} from "../lib/au/types";

const single = (over: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN,
  people: [{ ...DEFAULT_PLAN.people[0], currentAge: 40, superBalance: 100_000, salary: 100_000 }],
  outsideSuper: 0,
  annualOutsideSavings: 0,
  retirementAge: 60,
  ...over,
});

describe("Superannuation", () => {
  it("grows super from now to retirement", () => {
    const r = simulate(single(), cfg);
    expect(r.superAtRetirement).toBeGreaterThan(100_000);
  });

  it("caps concessional contributions (SG + sacrifice) at the cap", () => {
    // Both salaries push SG well past the concessional cap → identical result.
    const a = simulate(single({ people: [{ ...DEFAULT_PLAN.people[0], currentAge: 40, superBalance: 100_000, salary: 400_000 }] }), cfg);
    const b = simulate(single({ people: [{ ...DEFAULT_PLAN.people[0], currentAge: 40, superBalance: 100_000, salary: 600_000 }] }), cfg);
    expect(Math.round(a.superAtRetirement)).toBe(Math.round(b.superAtRetirement));
  });

  it("splits a joint SMSF balance evenly by default", () => {
    const plan: RetirementPlan = {
      ...DEFAULT_PLAN,
      household: "couple",
      people: [DEFAULT_PLAN.people[0], DEFAULT_PARTNER],
      superMode: "joint",
      jointSuperBalance: 300_000,
      jointSuperSplit: 50,
    };
    expect(startingSuperBalances(plan)).toEqual([150_000, 150_000]);
  });

  it("apportions a joint balance by the split", () => {
    const plan: RetirementPlan = {
      ...DEFAULT_PLAN,
      household: "couple",
      people: [DEFAULT_PLAN.people[0], DEFAULT_PARTNER],
      superMode: "joint",
      jointSuperBalance: 400_000,
      jointSuperSplit: 70,
    };
    expect(startingSuperBalances(plan).map((x) => Math.round(x))).toEqual([280_000, 120_000]);
  });

  it("uses individual balances when not joint", () => {
    const plan: RetirementPlan = {
      ...DEFAULT_PLAN,
      household: "couple",
      people: [
        { ...DEFAULT_PLAN.people[0], superBalance: 180_000 },
        { ...DEFAULT_PARTNER, superBalance: 120_000 },
      ],
      superMode: "individual",
    };
    expect(startingSuperBalances(plan)).toEqual([180_000, 120_000]);
  });

  it("gives the same projection for equal total super, joint or individual (same ages)", () => {
    const people = [
      { ...DEFAULT_PLAN.people[0], currentAge: 45, superBalance: 180_000, salary: 90_000 },
      { ...DEFAULT_PARTNER, currentAge: 45, superBalance: 120_000, salary: 90_000 },
    ];
    const indiv: RetirementPlan = { ...DEFAULT_PLAN, household: "couple", people, superMode: "individual", retirementAge: 60 };
    const joint: RetirementPlan = { ...indiv, superMode: "joint", jointSuperBalance: 300_000, jointSuperSplit: 50 };
    expect(Math.round(simulate(indiv, cfg).superAtRetirement)).toBe(
      Math.round(simulate(joint, cfg).superAtRetirement),
    );
  });
});
