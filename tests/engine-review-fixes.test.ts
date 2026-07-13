import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan, type Person } from "../lib/au/types";

// Regression tests for the adversarial engine review (Tier 1 + verified Tier 2).
// livingStandardsGrowthPct = 0 so today's $ = nominal and the numbers are clean.
const cfg = { ...DEFAULT_CONFIG, livingStandardsGrowthPct: 0 };
const P = (o: Partial<Person> = {}): Person => ({ currentAge: 60, superBalance: 500_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0, ...o });
const base = (o: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN, household: "single", superMode: "individual", people: [P()],
  homeowner: true, outsideSuper: 0, annualOutsideSavings: 0, retirementAge: 60,
  spendingMode: "flat", targetSpending: 40_000, investmentReturn: 6, inflation: 0, lifeExpectancy: 90, ...o,
});
const rowAt = (p: RetirementPlan, age: number) => simulate(p, cfg).rows.find((r) => r.age === age)!;

describe("Review fix #2 — age-gap couple Age Pension", () => {
  it("pays the member-of-a-couple rate (half) when only one partner has reached Age Pension age", () => {
    const assets = { retirementAge: 60, outsideSuper: 20_000, targetSpending: 30_000, household: "couple" as const, superMode: "individual" as const };
    const gap = base({ ...assets, people: [P({ currentAge: 67, superBalance: 80_000 }), P({ currentAge: 62, superBalance: 80_000 })] });
    const both = base({ ...assets, people: [P({ currentAge: 67, superBalance: 80_000 }), P({ currentAge: 67, superBalance: 80_000 })] });
    const gapPension = rowAt(gap, 67).agePension; // one partner 67, one 62
    const bothPension = rowAt(both, 67).agePension; // both 67
    expect(gapPension).toBeGreaterThan(0);
    expect(bothPension).toBeGreaterThan(gapPension * 1.9); // roughly double
    expect(gapPension).toBeCloseTo(bothPension / 2, 0); // exactly half (same assets)
  });
});

describe("Review fix #1 — guardrails don't ratchet on an income-covered first year", () => {
  it("anchors the rails on the first REAL draw, not a year fully covered by income", () => {
    // Well funded (~3.3% draw), but part-time work covers spending for the first
    // years — the old zero-anchor bug would then cut spending to the floor forever.
    const plan = base({
      people: [P({ currentAge: 60, superBalance: 800_000 })], outsideSuper: 400_000,
      targetSpending: 40_000, workIncome: { perYear: 55_000, untilAge: 67 }, guardrails: {},
    });
    const spend75 = rowAt(plan, 75).breakdown.livingSpend; // years after work stops
    expect(spend75).toBeGreaterThan(37_000); // held near the $40k start, not the ~$28k floor
  });
});

describe("Review fix #3 — downsizing after mortgage payoff releases full equity", () => {
  it("does not subtract a mortgage that is already discharged", () => {
    const home = { value: 900_000, growthReal: 0, downsize: { atAge: 70, newValue: 500_000, toSuper: 0 } };
    const withLoan = base({
      people: [P({ currentAge: 60, superBalance: 400_000 })], retirementAge: 65, home,
      mortgage: { type: "principal_interest", balance: 200_000, interestRate: 5, annualRepayment: 24_000, payoffAge: 65, strategy: "carry" },
    });
    const noLoan = base({ people: [P({ currentAge: 60, superBalance: 400_000 })], retirementAge: 65, home });
    const relWith = rowAt(withLoan, 70).breakdown.homeProceeds;
    const relNo = rowAt(noLoan, 70).breakdown.homeProceeds;
    expect(relWith).toBeGreaterThan(0);
    expect(relWith).toBeCloseTo(relNo, 0); // loan gone by 70 → same release as no-mortgage
  });
});

describe("Review fix #4 — outside-super tax stacks a working partner's salary", () => {
  it("taxes a still-working partner's share of outside gains at their marginal rate", () => {
    // Staggered couple: partner 0 retired at 60, partner 1 works to 67 on $180k.
    // Salary covers spending (no drawdown), so the assessable is dividend income;
    // partner 1's half must stack on $180k (37%+), not the $0 threshold.
    const plan = base({
      household: "couple", superMode: "individual",
      people: [
        P({ currentAge: 60, superBalance: 300_000 }),
        P({ currentAge: 60, superBalance: 300_000, salary: 180_000, retirementAge: 67 }),
      ],
      retirementAge: 60, outsideSuper: 1_500_000, targetSpending: 70_000,
    });
    const tax63 = rowAt(plan, 63).breakdown.outsideTax; // a staggered-gap year
    // Old model (both halves from $0) would give only a few hundred dollars; stacking
    // partner 1's ~$18k half on $180k of salary yields several thousand.
    expect(tax63).toBeGreaterThan(4_000);
  });
});

describe("Review fix #5 — Division 293 base excludes the salary-sacrifice", () => {
  it("uses taxable + concessional, not salary + concessional", () => {
    // $220k salary sacrificing to the cap: taxable+concessional ≈ $246k (< $250k → NO
    // Div 293); salary+concessional ≈ $252.5k would have wrongly triggered it.
    const plan = base({ people: [P({ currentAge: 50, superBalance: 300_000, salary: 220_000, voluntaryConcessional: 10_000 })], retirementAge: 67 });
    const contribNet = rowAt(plan, 50).breakdown.contribNet;
    const concessional = Math.min(220_000 * cfg.sgRate + 10_000, cfg.concessionalCap);
    expect(contribNet).toBeCloseTo(concessional * (1 - cfg.contributionsTax), 0); // no Div 293 deducted
  });
});
