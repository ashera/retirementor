import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";

const plan = (over: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN,
  people: [{ ...DEFAULT_PLAN.people[0], currentAge: 55, superBalance: 300_000, salary: 90_000, voluntaryConcessional: 0 }],
  outsideSuper: 120_000,
  annualOutsideSavings: 3_000,
  retirementAge: 60,
  spendingMode: "flat",
  targetSpending: 100_000,
  investmentReturn: 6,
  inflation: 2.5,
  lifeExpectancy: 95,
  ...over,
});

describe("Money lasts & depletion", () => {
  it("a comfortable plan lasts to life expectancy", () => {
    const r = simulate(
      plan({
        targetSpending: 45_000,
        people: [{ currentAge: 55, superBalance: 550_000, salary: 90_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
      }),
      cfg,
    );
    expect(r.lastsToLifeExpectancy).toBe(true);
    expect(r.depletedAge).toBeNull();
  });

  it("marks depletion at the age the balance actually hits $0 (not the first shortfall year)", () => {
    const r = simulate(plan(), cfg);
    expect(r.depletedAge).not.toBeNull();
    const zero = r.rows.find((x) => x.age === r.depletedAge)!;
    const prev = r.rows.find((x) => x.age === (r.depletedAge as number) - 1)!;
    expect(zero.total).toBeLessThan(1); // balance is $0 at the marker
    expect(prev.total).toBeGreaterThan(0); // still had money the year before
  });

  it("does not flag depletion when the Age Pension covers a low spend", () => {
    // Spend below the single Age Pension → savings may run down but income never falls short.
    const r = simulate(
      plan({
        people: [{ ...DEFAULT_PLAN.people[0], currentAge: 55, superBalance: 100_000, salary: 90_000 }],
        outsideSuper: 20_000,
        targetSpending: 25_000,
      }),
      cfg,
    );
    expect(r.lastsToLifeExpectancy).toBe(true);
  });

  it("peaks super at the retirement age", () => {
    const r = simulate(plan({ targetSpending: 45_000 }), cfg);
    const peak = r.rows.reduce((m, x) => (x.total > m.total ? x : m), r.rows[0]);
    expect(peak.age).toBe(60);
  });
});
