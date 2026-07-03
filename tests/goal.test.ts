import { describe, it, expect } from "vitest";
import { DEFAULT_PLAN, type MortgageDetail, type RetirementPlan } from "../lib/au/types";
import { retirementGoal } from "../lib/au/goal";

const plan = (over: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN,
  spendingMode: "flat",
  targetSpending: 54_640,
  ...over,
});

const pi: MortgageDetail = {
  type: "principal_interest",
  balance: 180_000,
  interestRate: 6,
  annualRepayment: 24_000,
  payoffAge: 75,
  strategy: "carry",
};

describe("Retirement income goal (with a home loan)", () => {
  it("is just living costs when there's no loan", () => {
    const g = retirementGoal(plan());
    expect(g.total).toBe(54_640);
    expect(g.loanCost).toBe(0);
    expect(g.loanKind).toBe("none");
  });

  it("adds P&I repayments to the headline and remembers the payoff age", () => {
    const g = retirementGoal(plan({ mortgage: pi }));
    expect(g.living).toBe(54_640);
    expect(g.loanCost).toBe(24_000);
    expect(g.total).toBe(78_640); // living + repayment
    expect(g.loanKind).toBe("pi");
    expect(g.payoffAge).toBe(75);
  });

  it("adds interest-only interest for life", () => {
    const g = retirementGoal(plan({ mortgage: { ...pi, type: "interest_only", payoffAge: null } }));
    expect(g.loanCost).toBe(10_800); // 180k × 6%
    expect(g.total).toBe(65_440);
    expect(g.loanKind).toBe("io");
  });

  it("keeps clear-with-super out of the ongoing goal (it's a one-off)", () => {
    const g = retirementGoal(plan({ mortgage: { ...pi, strategy: "clear_at_retirement" } }));
    expect(g.loanCost).toBe(0);
    expect(g.total).toBe(54_640); // ongoing goal is living costs only
    expect(g.loanKind).toBe("cleared");
    expect(g.clearBalance).toBe(180_000);
  });

  it("uses the go-go figure as living costs when staged", () => {
    const g = retirementGoal(
      plan({
        spendingMode: "stages",
        spendingStages: { goGo: 60_000, slowGo: 51_000, noGo: 42_000, slowGoAge: 75, noGoAge: 85 },
        mortgage: pi,
      }),
    );
    expect(g.living).toBe(60_000);
    expect(g.total).toBe(84_000);
  });
});
