import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type MortgageDetail, type RetirementPlan } from "../lib/au/types";
import { suggestPayoffAge, mortgageAnnualCost, outstandingBalance } from "../lib/au/mortgage";

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
  payoffAge: 72, // $18k/yr amortises $150k @6% by ~72 (suggestPayoffAge), not the old 70
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
    expect(spendAt(r, 71)).toBeGreaterThan(50_000); // last (partial) repayment year — loan clears ~72
    expect(spendAt(r, 72)).toBe(50_000); // paid off — back to the steady-state budget
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

describe("Offset account (pure loan maths)", () => {
  it("interest-only: offset lowers the annual interest at the loan rate", () => {
    expect(mortgageAnnualCost(ioLoan)).toBe(12_000); // 200k × 6%
    expect(mortgageAnnualCost({ ...ioLoan, offset: 50_000 })).toBe(9_000); // (200k − 50k) × 6%
    expect(mortgageAnnualCost({ ...ioLoan, offset: 250_000 })).toBe(0); // offset ≥ balance → no interest
  });

  it("P&I: the repayment is unchanged but the loan amortises faster", () => {
    expect(mortgageAnnualCost({ ...piLoan, offset: 60_000 })).toBe(18_000); // still the fixed repayment
    for (const n of [1, 3, 5, 8]) {
      const noOffset = outstandingBalance(piLoan, n);
      const withOffset = outstandingBalance({ ...piLoan, offset: 60_000 }, n);
      expect(withOffset).toBeLessThan(noOffset); // more of each repayment hits principal
    }
  });

  it("P&I: a full offset clears the loan in balance ÷ repayment years", () => {
    // offset ≥ balance → interest always 0 → balance falls by the repayment each year.
    const m = { ...piLoan, balance: 90_000, annualRepayment: 18_000, offset: 90_000 };
    expect(outstandingBalance(m, 4)).toBeCloseTo(18_000, 0); // 90k − 4×18k
    expect(outstandingBalance(m, 5)).toBe(0); // cleared
  });

  it("no offset leaves the amortisation byte-identical (closed form)", () => {
    for (const n of [0, 2, 6, 11, 20]) {
      expect(outstandingBalance({ ...piLoan, offset: 0 }, n)).toBe(outstandingBalance(piLoan, n));
      expect(outstandingBalance({ ...piLoan, offset: undefined }, n)).toBe(outstandingBalance(piLoan, n));
    }
  });
});

describe("Offset account (in the projection)", () => {
  it("interest-only: the offset cuts the annual loan cost (tax-free saving)", () => {
    const r = simulate(base({ outsideSuper: 0, mortgage: { ...ioLoan, offset: 50_000 } }), cfg);
    expect(spendAt(r, 60)).toBe(59_000); // 50k spend + (200k − 50k) × 6% = 50k + 9k (was 62k)
  });

  it("counts the offset cash as liquid net worth while the loan runs", () => {
    const r = simulate(base({ outsideSuper: 0, mortgage: { ...ioLoan, offset: 50_000 } }), cfg);
    const row60 = r.rows.find((x) => x.age === 60)!;
    expect(row60.breakdown.offsetHeld).toBe(50_000); // today's dollars at t=0
    expect(row60.total).toBeGreaterThan(740_000); // 700k super + ~50k offset (outside = 0)
  });

  it("assesses the offset for the Age Pension (a deemed financial asset)", () => {
    const atPension = { people: base().people.map((p) => ({ ...p, currentAge: 67 })), retirementAge: 67 };
    const noOff = simulate(base({ ...atPension, outsideSuper: 0, mortgage: ioLoan }), cfg);
    const withOff = simulate(base({ ...atPension, outsideSuper: 0, mortgage: { ...ioLoan, offset: 120_000 } }), cfg);
    const pen = (r: ReturnType<typeof simulate>) => r.rows.find((x) => x.age === 67)!.agePension;
    expect(pen(withOff)).toBeLessThan(pen(noOff)); // the extra $120k offset asset trims the pension
  });

  it("clear-at-retirement uses the offset first, so super covers only the shortfall", () => {
    const atPension = { people: base().people.map((p) => ({ ...p, currentAge: 67 })), retirementAge: 67 };
    const clearedLump = (offset?: number) => {
      const r = simulate(base({ ...atPension, mortgage: { ...piLoan, strategy: "clear_at_retirement", offset } }), cfg);
      return r.rows.find((x) => x.age === 67)!.breakdown.mortgageCleared;
    };
    expect(clearedLump(60_000)).toBeLessThan(clearedLump(undefined)); // offset covers part → less super drawn
  });

  it("frees the offset into the outside pool once a P&I loan pays off", () => {
    const r = simulate(base({ outsideSuper: 0, targetSpending: 20_000, mortgage: { ...piLoan, offset: 40_000, strategy: "carry" } }), cfg);
    const active = r.rows.find((x) => x.age === 62)!;
    expect(active.breakdown.offsetHeld).toBeGreaterThan(30_000); // held while the loan runs
    const paid = r.rows.find((x) => x.age >= 68 && x.breakdown.mortgageCost === 0)!;
    expect(paid.breakdown.offsetHeld ?? 0).toBe(0); // freed once the loan clears
    expect(paid.outside).toBeGreaterThan(20_000); // the freed cash landed in the outside pool
  });
});
