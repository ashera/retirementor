import { describe, it, expect } from "vitest";
import { runMonteCarlo } from "../lib/au/montecarlo";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";

const plan: RetirementPlan = {
  ...DEFAULT_PLAN,
  people: [{ ...DEFAULT_PLAN.people[0], currentAge: 45, superBalance: 200_000, salary: 110_000, voluntaryConcessional: 5_000 }],
  outsideSuper: 150_000,
  annualOutsideSavings: 15_000,
  retirementAge: 60,
  spendingMode: "flat",
  targetSpending: 70_000,
  investmentReturn: 7,
  returnVolatility: 11,
  inflation: 2.5,
  lifeExpectancy: 95,
};

describe("Monte Carlo", () => {
  it("returns a success rate between 0 and 1", () => {
    const mc = runMonteCarlo(plan, cfg, { iterations: 400 });
    expect(mc.successRate).toBeGreaterThanOrEqual(0);
    expect(mc.successRate).toBeLessThanOrEqual(1);
  });

  it("is deterministic for a fixed seed", () => {
    const a = runMonteCarlo(plan, cfg, { iterations: 400, seed: 42 });
    const b = runMonteCarlo(plan, cfg, { iterations: 400, seed: 42 });
    expect(a.successRate).toBe(b.successRate);
  });

  it("keeps fan percentiles ordered p10 ≤ p50 ≤ p90", () => {
    const mc = runMonteCarlo(plan, cfg, { iterations: 400 });
    for (const f of mc.fan) {
      expect(f.p10).toBeLessThanOrEqual(f.p50);
      expect(f.p50).toBeLessThanOrEqual(f.p90);
    }
  });

  it("gives a lower success rate for higher spending", () => {
    const lo = runMonteCarlo({ ...plan, targetSpending: 60_000 }, cfg, { iterations: 400 });
    const hi = runMonteCarlo({ ...plan, targetSpending: 100_000 }, cfg, { iterations: 400 });
    expect(hi.successRate).toBeLessThan(lo.successRate);
  });
});
