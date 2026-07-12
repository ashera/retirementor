import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { initialWithdrawal } from "../lib/au/withdrawal";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, deriveStages, type RetirementPlan } from "../lib/au/types";

// A big-buffer retiree: a large outside-super pool funds part of the early spend,
// so the super-only rate looks deceptively low and then steps up when the buffer
// empties. The whole-portfolio rate is the honest, smooth measure we now surface.
const bigBuffer: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ ...DEFAULT_PLAN.people[0], currentAge: 60, superBalance: 1_383_288, salary: 0, voluntaryConcessional: 0 }],
  superMode: "individual",
  homeowner: true,
  outsideSuper: 400_000,
  annualOutsideSavings: 0,
  retirementAge: 60,
  spendingMode: "flat",
  targetSpending: 100_000,
  spendingStages: deriveStages(100_000),
  investmentReturn: 7,
  returnVolatility: 11,
  inflation: 2.5,
  lifeExpectancy: 90,
};

describe("Withdrawal rate — whole-portfolio headline", () => {
  it("measures the net spend against super + outside savings (the 4%-rule analog)", () => {
    const r = simulate(bigBuffer, cfg);
    const w = initialWithdrawal(r)!;
    // Net call on the portfolio ÷ (super + outside), not super drawn ÷ super.
    expect(w.portfolio).toBeCloseTo(w.balance + (r.rows.find((x) => x.age === w.age)!.outside), 0);
    expect(w.portfolioRate).toBeCloseTo(w.netSpend / w.portfolio, 6);
    // With a large buffer suppressing the super draw, the super-only rate UNDERSTATES:
    // the honest portfolio rate is meaningfully higher.
    expect(w.portfolioRate).toBeGreaterThan(w.rate + 0.01);
  });

  it("flags the buffer runout with the higher portfolio rate by then", () => {
    const r = simulate(bigBuffer, cfg);
    const w = initialWithdrawal(r)!;
    expect(w.bufferRunout).not.toBeNull();
    // The runout is a real, later age, and the rate there is a clear climb above the headline.
    expect(w.bufferRunout!.age).toBeGreaterThan(w.age);
    expect(w.bufferRunout!.rate).toBeGreaterThan(w.portfolioRate + 0.005);
    // At the runout year outside super is gone, so the portfolio rate equals the
    // super-only rate there — the two views have merged.
    const runoutRow = r.rows.find((x) => x.age === w.bufferRunout!.age)!;
    expect(runoutRow.outside).toBeLessThan(1_000);
  });

  it("no buffer runout when there's no material outside pool (rates coincide)", () => {
    const noBuffer: RetirementPlan = {
      ...bigBuffer,
      outsideSuper: 0,
      annualOutsideSavings: 0,
    };
    const r = simulate(noBuffer, cfg);
    const w = initialWithdrawal(r)!;
    expect(w.bufferRunout).toBeNull();
    // With nothing outside super, the portfolio IS super — the two rates coincide.
    expect(w.portfolioRate).toBeCloseTo(w.rate, 6);
  });
});
