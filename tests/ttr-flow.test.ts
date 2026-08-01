import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";
import { ttrFlowFromRow, TTR_FLOW_EXAMPLE } from "../lib/au/ttrFlow";

const plan = (over: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN, household: "single",
  people: [{ currentAge: 60, superBalance: 500_000, salary: 130_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  homeowner: true, outsideSuper: 0, annualOutsideSavings: 0, retirementAge: 65,
  spendingMode: "flat", targetSpending: 70_000, investmentReturn: 6, inflation: 2.5, lifeExpectancy: 90, ...over,
});

describe("ttrFlowFromRow", () => {
  it("returns null in a year with no active TTR", () => {
    const rows = simulate(plan(), cfg).rows;
    expect(ttrFlowFromRow(rows.find((r) => r.age === 61)!)).toBeNull();
  });

  it("reconstructs a reconciling flow of funds from a TTR row", () => {
    const p = plan({ ttr: { extraSacrifice: 15_000, who: [0] } });
    const row = simulate(p, cfg).rows.find((r) => r.age === 61)!;
    const f = ttrFlowFromRow(row, cfg.contributionsTax)!;
    expect(f).not.toBeNull();

    // Internal identities.
    expect(f.netToSuper).toBeCloseTo(f.superKept + f.pension, 0); // (1−15%)·slice
    expect(f.contribTax).toBeCloseTo(f.slice * cfg.contributionsTax, 0);
    expect(f.slice).toBeCloseTo(f.netToSuper + f.contribTax, 0);
    expect(f.taxSaved).toBeCloseTo(f.slice - f.pension, 0); // pension = slice's after-marginal-tax value
    expect(f.takeHome).toBeCloseTo(f.salaryTakeHome + f.pension, 0); // pension holds take-home
    expect(f.taxablePay).toBeCloseTo(f.salary - f.slice, 0);

    // The Sankey balances: every dollar of salary lands in take-home, super, or tax.
    expect(f.takeHome + f.superKept + f.incomeTax + f.contribTax).toBeCloseTo(f.salary, 0);

    // Matches the engine's own recorded fields for that row.
    expect(f.pension).toBeCloseTo(row.breakdown.ttrPension ?? 0, 0);
    expect(f.superKept).toBeCloseTo(row.breakdown.ttrBenefit ?? 0, 0);
    expect(f.takeHome).toBeCloseTo(row.takeHome, 0);
    // Sacrificing $15k at a 30%+2% marginal rate → ~32% implied.
    expect(f.slice).toBeCloseTo(15_000, 0);
    expect(f.marginalPct).toBe(32);
  });

  it("the knowledge-base example is internally consistent", () => {
    const f = TTR_FLOW_EXAMPLE;
    expect(f.netToSuper).toBeCloseTo(f.superKept + f.pension, 0);
    expect(f.takeHome + f.superKept + f.incomeTax + f.contribTax).toBeCloseTo(f.salary, 0);
    expect(f.takeHome).toBeCloseTo(f.salaryTakeHome + f.pension, 0);
  });
});
