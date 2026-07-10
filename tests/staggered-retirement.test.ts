import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { initialWithdrawal } from "../lib/au/withdrawal";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import {
  DEFAULT_PLAN,
  personRetirementAge,
  hasStaggeredRetirement,
  type RetirementPlan,
} from "../lib/au/types";

// A couple, both currently 55, sharing a retirement age of 60.
const couple: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "couple",
  people: [
    { currentAge: 55, superBalance: 300_000, salary: 100_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
    { currentAge: 55, superBalance: 250_000, salary: 90_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
  ],
  superMode: "individual",
  homeowner: true,
  outsideSuper: 50_000,
  annualOutsideSavings: 10_000,
  retirementAge: 60,
  spendingMode: "flat",
  targetSpending: 70_000,
  investmentReturn: 7,
  returnVolatility: 11,
  inflation: 2.5,
  lifeExpectancy: 90,
};

const withPartnerRetiring = (age: number): RetirementPlan => ({
  ...couple,
  people: [couple.people[0], { ...couple.people[1], retirementAge: age }],
});

const endTotal = (plan: RetirementPlan) => {
  const rows = simulate(plan, cfg).rows;
  return rows[rows.length - 1].total;
};

describe("Staggered retirement", () => {
  it("is inert when the partner retires at the same time (backward compatibility)", () => {
    // Both currently 55 → an explicit partner age of 60 == the shared plan age.
    const explicit = withPartnerRetiring(60);
    const base = simulate(couple, cfg);
    const same = simulate(explicit, cfg);
    expect(same.rows.length).toBe(base.rows.length);
    for (let i = 0; i < base.rows.length; i++) {
      expect(same.rows[i].total).toBeCloseTo(base.rows[i].total, 6);
      expect(same.rows[i].superDrawn).toBeCloseTo(base.rows[i].superDrawn, 6);
    }
    expect(hasStaggeredRetirement(explicit)).toBe(false);
    expect(same.partnerRetirementAge).toBeNull();
  });

  it("flags a genuinely staggered plan and reports the partner's age", () => {
    const stag = withPartnerRetiring(67);
    expect(hasStaggeredRetirement(stag)).toBe(true);
    expect(simulate(stag, cfg).partnerRetirementAge).toBe(67);
    expect(personRetirementAge(stag, 1)).toBe(67);
  });

  it("leaves more wealth the longer the partner keeps working", () => {
    const at60 = endTotal(withPartnerRetiring(60));
    const at63 = endTotal(withPartnerRetiring(63));
    const at67 = endTotal(withPartnerRetiring(67));
    expect(at63).toBeGreaterThan(at60);
    expect(at67).toBeGreaterThan(at63);
  });

  it("counts the still-working partner's salary during the gap, and reduces drawdown", () => {
    const stag = withPartnerRetiring(67);
    const rows = simulate(stag, cfg).rows;
    // A gap year: primary retired (>=60) but partner still working (<67).
    const gap = rows.find((r) => r.age === 63)!;
    expect(gap.phase).not.toBe("accumulation"); // household is in retirement
    expect(gap.salaryIncome).toBeGreaterThan(0); // partner still earning
    // The salary offsets the draw, so it's well under the full spend.
    expect(gap.superDrawn).toBeLessThan(stag.targetSpending);
  });

  it("brings the household retirement (and super-at-retirement snapshot) forward when the partner retires first", () => {
    const base = simulate(couple, cfg); // both at 60
    const early = simulate(withPartnerRetiring(58), cfg); // partner first, at 58
    expect(early.superAtRetirement).toBeLessThan(base.superAtRetirement);
    expect(early.partnerRetirementAge).toBe(58);
  });

  it("measures the initial withdrawal rate once fully retired, not during the gap", () => {
    const stag = withPartnerRetiring(67);
    const res = simulate(stag, cfg);
    const w = initialWithdrawal(res)!;
    // The chosen year must not be a staggered gap year (no still-working salary),
    // so the goal → super-draw reconciliation on the card actually adds up.
    const row = res.rows.find((r) => r.age === w.age)!;
    expect(row.salaryIncome).toBeLessThanOrEqual(1);
    expect(w.age).toBeGreaterThanOrEqual(67);
    // Super now funds the real spend rather than a small salary-masked slice.
    expect(w.drawn).toBeGreaterThan(50_000);
  });

  it("keeps a single-person plan unaffected", () => {
    const single = simulate(DEFAULT_PLAN, cfg);
    expect(single.partnerRetirementAge).toBeNull();
    expect(hasStaggeredRetirement(DEFAULT_PLAN)).toBe(false);
  });
});
