import { describe, it, expect } from "vitest";
import { simulate } from "../../lib/au/simulate";
import { agePension } from "../../lib/au/agePension";
import { DEFAULT_CONFIG as cfg } from "../../lib/au/config";
import { DEFAULT_PLAN, type MortgageDetail, type RetirementPlan } from "../../lib/au/types";

// Layer D — invariants: properties the engine must satisfy for ANY inputs,
// independent of the exact magnitudes. Cheap regression insurance that catches
// structural bugs the numeric scenarios might miss.

const base = (over: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ currentAge: 60, superBalance: 500_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  homeowner: true,
  outsideSuper: 100_000,
  annualOutsideSavings: 0,
  retirementAge: 65,
  spendingMode: "flat",
  targetSpending: 50_000,
  investmentReturn: 6,
  inflation: 2.5,
  lifeExpectancy: 95,
  ...over,
});

const depletion = (r: ReturnType<typeof simulate>) => r.depletedAge ?? Infinity;

describe("Invariants", () => {
  it("spending more never makes the money last longer", () => {
    let prev = Infinity;
    for (const spend of [35_000, 45_000, 55_000, 70_000, 90_000]) {
      const dep = depletion(simulate(base({ targetSpending: spend }), cfg));
      expect(dep).toBeLessThanOrEqual(prev);
      prev = dep;
    }
  });

  it("a couple's Age Pension is never less than a single's for the same assets & income", () => {
    for (const assets of [300_000, 500_000, 700_000, 900_000, 1_200_000]) {
      const single = agePension(
        { household: "single", homeowner: true, assessableAssets: assets, financialAssets: assets },
        cfg,
      ).annual;
      const couple = agePension(
        { household: "couple", homeowner: true, assessableAssets: assets, financialAssets: assets },
        cfg,
      ).annual;
      expect(couple).toBeGreaterThanOrEqual(single);
    }
  });

  it("more assessable assets never increase the Age Pension", () => {
    let prev = Infinity;
    for (const assets of [200_000, 400_000, 600_000, 800_000]) {
      const p = agePension(
        { household: "single", homeowner: true, assessableAssets: assets, financialAssets: assets },
        cfg,
      ).annual;
      expect(p).toBeLessThanOrEqual(prev);
      prev = p;
    }
  });

  it("clearing the mortgage with super never lowers the first pension-year payment", () => {
    const loan: MortgageDetail = {
      type: "principal_interest", balance: 150_000, interestRate: 6, annualRepayment: 18_000,
      payoffAge: 75, strategy: "carry",
    };
    const at67 = { people: [{ currentAge: 67, superBalance: 700_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }], retirementAge: 67 };
    const carry = simulate(base({ ...at67, mortgage: { ...loan, strategy: "carry" } }), cfg);
    const clear = simulate(base({ ...at67, mortgage: { ...loan, strategy: "clear_at_retirement" } }), cfg);
    const pen = (r: ReturnType<typeof simulate>) => r.rows.find((x) => x.age === 67)!.agePension;
    expect(pen(clear)).toBeGreaterThanOrEqual(pen(carry));
  });

  it("joint SMSF and individual super give the same result for equal totals & ages", () => {
    const people = [
      { currentAge: 62, superBalance: 300_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
      { currentAge: 62, superBalance: 200_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
    ];
    const individual = simulate(base({ household: "couple", people, superMode: "individual", retirementAge: 62 }), cfg);
    const joint = simulate(
      base({ household: "couple", people, superMode: "joint", jointSuperBalance: 500_000, jointSuperSplit: 60, retirementAge: 62 }),
      cfg,
    );
    expect(Math.round(individual.superAtRetirement)).toBe(Math.round(joint.superAtRetirement));
    expect(individual.depletedAge).toBe(joint.depletedAge);
  });
});
