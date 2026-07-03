import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type MortgageDetail, type RetirementPlan } from "../lib/au/types";
import { suggestPayoffAge } from "../lib/au/mortgage";

const base = (over: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN,
  household: "single",
  people: [
    { currentAge: 60, superBalance: 700_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
  ],
  homeowner: true,
  outsideSuper: 50_000,
  annualOutsideSavings: 0,
  retirementAge: 60,
  spendingMode: "flat",
  targetSpending: 50_000,
  investmentReturn: 6,
  inflation: 2.5,
  lifeExpectancy: 90,
  ...over,
});

const piLoan: MortgageDetail = {
  type: "principal_interest",
  balance: 150_000,
  interestRate: 6,
  annualRepayment: 18_000,
  payoffAge: 70,
  strategy: "carry",
};

const ioLoan: MortgageDetail = {
  type: "interest_only",
  balance: 200_000,
  interestRate: 6,
  annualRepayment: 0,
  payoffAge: null,
  strategy: "carry",
};

const spendAt = (r: ReturnType<typeof simulate>, age: number) =>
  r.rows.find((x) => x.age === age)!.spending;

describe("Mortgage in retirement", () => {
  it("adds a P&I repayment that erodes with inflation and stops at payoff", () => {
    const r = simulate(base({ mortgage: piLoan }), cfg);
    expect(spendAt(r, 60)).toBe(68_000); // 50k + 18k, no deflation in year 0
    expect(spendAt(r, 69)).toBeGreaterThan(50_000); // still paying...
    expect(spendAt(r, 69)).toBeLessThan(spendAt(r, 60)); // ...but eroded in real terms
    expect(spendAt(r, 70)).toBe(50_000); // paid off — back to the steady-state budget
  });

  it("charges interest for life on an interest-only loan (principal never clears)", () => {
    const r = simulate(base({ mortgage: ioLoan }), cfg);
    expect(spendAt(r, 60)).toBe(62_000); // 50k + 12k interest (200k × 6%)
    expect(spendAt(r, 89)).toBeGreaterThan(50_000); // never ends
    expect(spendAt(r, 89)).toBeLessThan(spendAt(r, 60)); // but erodes in real terms
  });

  it("clearing with super removes the repayment and lifts the Age Pension", () => {
    const atPension = { people: base().people.map((p) => ({ ...p, currentAge: 67 })), retirementAge: 67 };
    const carry = simulate(base({ ...atPension, mortgage: { ...piLoan, strategy: "carry" } }), cfg);
    const clear = simulate(base({ ...atPension, mortgage: { ...piLoan, strategy: "clear_at_retirement" } }), cfg);

    const penCarry = carry.rows.find((x) => x.age === 67)!.agePension;
    const penClear = clear.rows.find((x) => x.age === 67)!.agePension;

    expect(spendAt(carry, 67)).toBe(68_000); // carrying → repayment on top
    expect(spendAt(clear, 67)).toBe(50_000); // cleared → no repayment
    expect(penClear).toBeGreaterThan(penCarry); // lower assessable assets → more pension
  });

  it("only clears when super can cover the balance, otherwise carries", () => {
    const poor = base({
      people: [{ currentAge: 60, superBalance: 100_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
      mortgage: { ...piLoan, strategy: "clear_at_retirement" },
    });
    const r = simulate(poor, cfg);
    // Can't afford to clear ($100k super < $150k loan) → falls back to carrying.
    expect(spendAt(r, 60)).toBe(68_000);
  });

  it("suggests a payoff age from balance, rate and repayment", () => {
    expect(suggestPayoffAge(150_000, 6, 18_000, 60)).toBe(72); // ~11.6 yrs to amortise
    expect(suggestPayoffAge(200_000, 6, 11_000, 60)).toBeNull(); // repayment ≤ interest
  });
});
