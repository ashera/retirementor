import { describe, it, expect } from "vitest";
import { HISTORICAL_REAL_EQUITY, HIST_START_YEAR, bootstrapRealPath } from "../lib/au/historicalReturns";
import { runMonteCarlo } from "../lib/au/montecarlo";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";

const yr = (y: number) => HISTORICAL_REAL_EQUITY[y - HIST_START_YEAR];

describe("Historical returns data", () => {
  it("covers 1928 onward with sane real-return stats", () => {
    expect(HISTORICAL_REAL_EQUITY.length).toBeGreaterThanOrEqual(95);
    const mean = HISTORICAL_REAL_EQUITY.reduce((a, b) => a + b, 0) / HISTORICAL_REAL_EQUITY.length;
    const sd = Math.sqrt(HISTORICAL_REAL_EQUITY.reduce((a, b) => a + (b - mean) ** 2, 0) / HISTORICAL_REAL_EQUITY.length);
    expect(mean).toBeGreaterThan(0.05); // ~8.6% arithmetic real
    expect(mean).toBeLessThan(0.12);
    expect(sd).toBeGreaterThan(0.15); // ~19% real vol — far above our old 11% Gaussian default
  });

  it("derives the right real returns for known crash/boom years", () => {
    expect(yr(1931)).toBeLessThan(-0.35); // Depression: -43.8% nominal, -9% CPI → ~-38% real
    expect(yr(1974)).toBeLessThan(-0.3); // stagflation: -25.9% nominal + 11% CPI → ~-33% real
    expect(yr(2008)).toBeLessThan(-0.35); // GFC: -36.6% nominal, 3.8% CPI → ~-39% real
    expect(yr(1954)).toBeGreaterThan(0.45); // +52.6% nominal, 0.7% CPI → ~+51% real
  });
});

describe("Block-bootstrap sampler", () => {
  const rand = () => 0.5; // fixed → deterministic block starts
  it("returns a path of the requested length", () => {
    expect(bootstrapRealPath(rand, 44, 10)).toHaveLength(45);
    expect(bootstrapRealPath(rand, 0, 10)).toHaveLength(1);
  });
  it("draws only real historical values (resampling, not synthesis)", () => {
    const set = new Set(HISTORICAL_REAL_EQUITY.map((v) => v.toFixed(6)));
    for (const v of bootstrapRealPath(rand, 60, 8)) expect(set.has(v.toFixed(6))).toBe(true);
  });
});

describe("runMonteCarlo bootstrap mode", () => {
  const plan: RetirementPlan = {
    ...DEFAULT_PLAN, household: "single",
    people: [{ ...DEFAULT_PLAN.people[0], currentAge: 45, superBalance: 0, salary: 0 }],
    superMode: "individual", homeowner: true, outsideSuper: 1_500_000, annualOutsideSavings: 0,
    retirementAge: 45, spendingMode: "flat", targetSpending: 40_000,
    investmentReturn: 7, returnVolatility: 11, inflation: 2.5, lifeExpectancy: 90,
  };
  it("produces a valid, deterministic success rate", () => {
    const a = runMonteCarlo(plan, cfg, { iterations: 300, model: "bootstrap", blockYears: 10 });
    const b = runMonteCarlo(plan, cfg, { iterations: 300, model: "bootstrap", blockYears: 10 });
    expect(a.successRate).toBeGreaterThanOrEqual(0);
    expect(a.successRate).toBeLessThanOrEqual(1);
    expect(a.successRate).toBe(b.successRate); // deterministic per seed
  });
  it("gives a materially different answer than the Gaussian default", () => {
    // Real history carries BOTH a higher mean (~6.7% real geometric vs our 4.4%)
    // and higher volatility (~19% vs 11%) than the Gaussian default, so the two
    // models genuinely diverge (which is worse depends on the spend/horizon regime:
    // vol dominates in the deep tail, the higher mean in the mid range).
    const stretched = { ...plan, targetSpending: 75_000 }; // ~5% of $1.5M — off the ceiling
    const gauss = runMonteCarlo(stretched, cfg, { iterations: 400, model: "gaussian" }).successRate;
    const boot = runMonteCarlo(stretched, cfg, { iterations: 400, model: "bootstrap", blockYears: 10 }).successRate;
    expect(Math.abs(boot - gauss)).toBeGreaterThan(0.05);
  });
});
