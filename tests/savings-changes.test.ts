import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, savingsForAge, getSavingsChanges, type MortgageDetail, type RetirementPlan } from "../lib/au/types";

// Feature #4: step the outside-super savings rate up/down at chosen ages (kids leave
// home, mortgage paid off…) + a mortgage-redirect preset. Inflation 0 makes the
// savings figures exact (savings is a flat real amount, not deflated).

const base = (over: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ currentAge: 50, superBalance: 200_000, salary: 120_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  superMode: "individual",
  homeowner: true,
  outsideSuper: 50_000,
  annualOutsideSavings: 20_000,
  retirementAge: 65,
  spendingMode: "flat",
  targetSpending: 50_000,
  investmentReturn: 6,
  returnVolatility: 11,
  inflation: 0,
  lifeExpectancy: 90,
  ...over,
});

// Wage inflation = plan.inflation + livingStandardsGrowthPct. Zero both so the freed
// mortgage repayment is undeflated and the redirect figure is exact.
const cfg0 = { ...cfg, livingStandardsGrowthPct: 0 };

const savingsAt = (p: RetirementPlan, age: number, c = cfg0) =>
  simulate(p, c).rows.find((r) => r.age === age)!.breakdown.savings;

describe("savingsForAge (pure)", () => {
  it("returns the base rate with no steps", () => {
    expect(savingsForAge(base(), 55)).toBe(20_000);
  });
  it("applies the latest step reached (steps compose, ascending)", () => {
    const p = base({ savingsChanges: [
      { id: "b", atAge: 60, amount: 40_000 },
      { id: "a", atAge: 55, amount: 30_000 }, // deliberately out of order
    ] });
    expect(savingsForAge(p, 54)).toBe(20_000); // before any step
    expect(savingsForAge(p, 55)).toBe(30_000); // first step
    expect(savingsForAge(p, 59)).toBe(30_000);
    expect(savingsForAge(p, 60)).toBe(40_000); // second step
    expect(savingsForAge(p, 80)).toBe(40_000);
  });
  it("supports a DECREASE (incl. to zero); a negative amount is ignored", () => {
    expect(savingsForAge(base({ savingsChanges: [{ id: "x", atAge: 55, amount: 5_000 }] }), 56)).toBe(5_000);
    expect(savingsForAge(base({ savingsChanges: [{ id: "z", atAge: 55, amount: 0 }] }), 56)).toBe(0); // stop saving
    expect(savingsForAge(base({ savingsChanges: [{ id: "y", atAge: 55, amount: -1_000 }] }), 56)).toBe(20_000); // invalid → base
  });
  it("getSavingsChanges sorts and drops invalid entries", () => {
    const p = base({ savingsChanges: [
      { id: "b", atAge: 60, amount: 40_000 },
      { id: "a", atAge: 55, amount: 30_000 },
      { id: "bad", atAge: NaN, amount: 10_000 },
    ] });
    expect(getSavingsChanges(p).map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("Stepped savings in the engine (point #4B)", () => {
  it("steps the savings line at the chosen age", () => {
    const p = base({ savingsChanges: [{ id: "k", atAge: 55, amount: 40_000 }] });
    expect(savingsAt(p, 54)).toBe(20_000); // base before
    expect(savingsAt(p, 55)).toBe(40_000); // stepped up from 55
    expect(savingsAt(p, 64)).toBe(40_000); // last working year
  });

  it("a higher savings rate builds a bigger outside pool by retirement", () => {
    const flat = simulate(base(), cfg0).rows.find((r) => r.age === 64)!.breakdown.closingOutside;
    const stepped = simulate(base({ savingsChanges: [{ id: "k", atAge: 55, amount: 40_000 }] }), cfg0).rows.find((r) => r.age === 64)!.breakdown.closingOutside;
    expect(stepped).toBeGreaterThan(flat);
  });

  it("is off by default — no savingsChanges is byte-identical to before", () => {
    const a = simulate(base(), cfg0);
    const b = simulate(base({ savingsChanges: [], redirectMortgageToSavings: false }), cfg0);
    expect(JSON.stringify(a.rows)).toBe(JSON.stringify(b.rows));
  });
});

// A P&I loan that clears during the working years. Interest rate 0 → clears cleanly:
// balance 60k, repayment 32k → owing 28k after yr1, 0 after yr2 (age 52).
const clearingLoan: MortgageDetail = {
  type: "principal_interest",
  balance: 60_000,
  interestRate: 0,
  annualRepayment: 32_000,
  payoffAge: 52,
  strategy: "carry",
};

describe("Mortgage auto-redirect into savings (point #4C)", () => {
  it("redirects the freed repayment into savings once the loan clears", () => {
    const off = base({ mortgage: clearingLoan, redirectMortgageToSavings: false });
    const on = base({ mortgage: clearingLoan, redirectMortgageToSavings: true });
    // Before payoff: both just the base rate.
    expect(savingsAt(off, 51)).toBe(20_000);
    expect(savingsAt(on, 51)).toBe(20_000);
    // After payoff (loan cleared at 52): redirect adds the $32k annual repayment.
    expect(savingsAt(off, 55)).toBe(20_000);
    expect(savingsAt(on, 55)).toBe(52_000); // 20k base + 32k freed repayment
  });

  it("builds a bigger pool by retirement with the redirect on", () => {
    const off = simulate(base({ mortgage: clearingLoan, redirectMortgageToSavings: false }), cfg0).rows.find((r) => r.age === 64)!.breakdown.closingOutside;
    const on = simulate(base({ mortgage: clearingLoan, redirectMortgageToSavings: true }), cfg0).rows.find((r) => r.age === 64)!.breakdown.closingOutside;
    expect(on).toBeGreaterThan(off);
  });

  it("does nothing when there is no mortgage, or the flag is off", () => {
    const noLoan = base({ redirectMortgageToSavings: true }); // flag on but no mortgage
    expect(savingsAt(noLoan, 55)).toBe(20_000);
  });

  it("deflates the freed repayment in a plan with wage inflation (still > base)", () => {
    // With real wage inflation the freed repayment is deflated, so it's between the
    // base and base+full-repayment — but still strictly above the base rate.
    const on = base({ mortgage: clearingLoan, redirectMortgageToSavings: true, inflation: 2.5 });
    const s = simulate(on, cfg).rows.find((r) => r.age === 60)!.breakdown.savings;
    expect(s).toBeGreaterThan(20_000);
    expect(s).toBeLessThan(52_000);
  });
});
