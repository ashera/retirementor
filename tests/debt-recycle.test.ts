import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";

// A mid-career homeowner with a live home loan to recycle against.
const base: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ currentAge: 45, superBalance: 200_000, salary: 150_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  superMode: "individual",
  homeowner: true,
  outsideSuper: 50_000,
  annualOutsideSavings: 10_000,
  retirementAge: 60,
  spendingMode: "flat",
  targetSpending: 60_000,
  investmentReturn: 7,
  inflation: 0, // nominal == real: the loan rate applies cleanly for the oracle
  lifeExpectancy: 90,
  mortgage: { type: "interest_only", balance: 400_000, interestRate: 6, annualRepayment: 24_000, payoffAge: null, strategy: "carry" },
};
const recycle = (over: Partial<{ perYear: number; loanRatePct: number; untilAge: number }> = {}, ret = 7): RetirementPlan => ({
  ...base,
  investmentReturn: ret,
  debtRecycle: { perYear: 20_000, loanRatePct: 6, untilAge: 60, ...over },
});
const row = (p: RetirementPlan, age: number) => simulate(p, cfg).rows.find((r) => r.age === age)!;
const loan = (p: RetirementPlan, age: number) => row(p, age).breakdown.investmentLoan ?? 0;

describe("Debt recycling — engine", () => {
  it("is inert when off: no field set === perYear 0 (byte-identical)", () => {
    const off = simulate(base, cfg).rows;
    const zero = simulate(recycle({ perYear: 0 }), cfg).rows;
    off.forEach((r, i) => {
      expect(r.total).toBeCloseTo(zero[i].total, 6);
      expect(r.outside).toBeCloseTo(zero[i].outside, 6);
    });
  });

  it("the investment loan builds over the working years then is repaid at retirement", () => {
    const p = recycle();
    expect(loan(p, 59)).toBeGreaterThan(loan(p, 50));
    expect(loan(p, 50)).toBeGreaterThan(loan(p, 46));
    // 20k/yr recycled from 45→59 (15 working years) ≈ 300k of loan by 59.
    expect(loan(p, 59)).toBeCloseTo(300_000, -4); // within ~10k
    // Unwound at/through retirement — repaid from the (now un-geared) pool.
    expect(loan(p, 60)).toBeLessThan(1);
    expect(loan(p, 75)).toBeLessThan(1);
  });

  it("the loan is never negative", () => {
    simulate(recycle(), cfg).rows.forEach((r) => expect(r.breakdown.investmentLoan ?? 0).toBeGreaterThanOrEqual(-1e-6));
  });

  it("only touches outside wealth — super is untouched", () => {
    expect(row(recycle(), 60).totalSuper).toBeCloseTo(row(base, 60).totalSuper, 6);
  });

  it("the interest is deductible: 0 < tax saved ≤ interest × top marginal rate", () => {
    const b = row(recycle(), 55).breakdown;
    expect(b.drTaxSaving ?? 0).toBeGreaterThan(0);
    expect(b.drTaxSaving ?? 0).toBeLessThanOrEqual((b.drInterest ?? 0) * 0.47 + 1);
  });

  // The leverage tradeoff — the whole point, and what the MC/stress views surface:
  // net equity grows at (return − AFTER-TAX loan cost), so it helps above that
  // crossover and hurts below it.
  it("leverage HELPS when returns beat the after-tax loan cost", () => {
    expect(row(recycle({}, 7), 60).outside).toBeGreaterThan(row({ ...base, investmentReturn: 7 }, 60).outside);
  });

  it("leverage HURTS when returns fall below the after-tax loan cost (the downside)", () => {
    // Rates are REAL: a 6% loan deflated by ~1.2% wage growth ≈ 4.7% real, ~2.9%
    // after the deduction. A 2% return sits below that crossover → recycling loses ground.
    expect(row(recycle({}, 2), 60).outside).toBeLessThan(row({ ...base, investmentReturn: 2 }, 60).outside);
  });

  it("charges the loan at a REAL rate (deflated), so it still helps under inflation", () => {
    // Regression: the loan rate is nominal but balances are today's-dollar real. If we
    // charged the nominal rate on the real balance we'd over-charge by ~inflation and
    // wipe out the spread. With 2.5% inflation and a 7% return, real return (~4.2%)
    // still beats the real after-tax loan cost, so recycling must come out ahead.
    const infl = { ...base, inflation: 2.5, investmentReturn: 7 };
    const on = simulate({ ...infl, debtRecycle: { perYear: 20_000, loanRatePct: 6, untilAge: 60 } }, cfg).rows.find((r) => r.age === 60)!;
    const off = simulate(infl, cfg).rows.find((r) => r.age === 60)!;
    expect(on.outside).toBeGreaterThan(off.outside);
  });

  it("bigger recycling amounts amplify the spread (more leverage, more effect)", () => {
    const small = row(recycle({ perYear: 10_000 }, 7), 60).outside;
    const large = row(recycle({ perYear: 30_000 }, 7), 60).outside;
    const none = row({ ...base, investmentReturn: 7 }, 60).outside;
    expect(large - none).toBeGreaterThan(small - none);
  });

  it("does nothing without a home loan to recycle against", () => {
    const noLoan: RetirementPlan = { ...base, mortgage: undefined };
    const off = simulate(noLoan, cfg).rows;
    const on = simulate({ ...noLoan, debtRecycle: { perYear: 20_000, loanRatePct: 6, untilAge: 60 } }, cfg).rows;
    off.forEach((r, i) => expect(r.outside).toBeCloseTo(on[i].outside, 6));
  });
});
