import { describe, it, expect } from "vitest";
import { HISTORICAL_REAL_EQUITY, HISTORICAL_SHOCKS, HIST_START_YEAR, bootstrapShockPath } from "../lib/au/historicalReturns";
import { runMonteCarlo } from "../lib/au/montecarlo";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";

const yr = (y: number) => HISTORICAL_REAL_EQUITY[y - HIST_START_YEAR];

describe("Historical returns data", () => {
  it("covers 1928 onward with sane real-return stats", () => {
    expect(HISTORICAL_REAL_EQUITY.length).toBeGreaterThanOrEqual(95);
    const mean = HISTORICAL_REAL_EQUITY.reduce((a, b) => a + b, 0) / HISTORICAL_REAL_EQUITY.length;
    expect(mean).toBeGreaterThan(0.05); // ~8.6% arithmetic real
    expect(mean).toBeLessThan(0.12);
  });

  it("derives the right real returns for known crash/boom years", () => {
    expect(yr(1931)).toBeLessThan(-0.35); // Depression: -43.8% nominal, -9% CPI → ~-38% real
    expect(yr(1974)).toBeLessThan(-0.3); // stagflation: -25.9% nominal + 11% CPI → ~-33% real
    expect(yr(2008)).toBeLessThan(-0.35); // GFC: -36.6% nominal, 3.8% CPI → ~-39% real
    expect(yr(1954)).toBeGreaterThan(0.45); // +52.6% nominal, 0.7% CPI → ~+51% real
  });
});

describe("Standardised historical shocks", () => {
  it("are zero-mean, unit-variance (level stripped, shape kept)", () => {
    const n = HISTORICAL_SHOCKS.length;
    const mean = HISTORICAL_SHOCKS.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(HISTORICAL_SHOCKS.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    expect(Math.abs(mean)).toBeLessThan(1e-9);
    expect(Math.abs(sd - 1)).toBeLessThan(1e-9);
  });
  it("preserve the order of history (worst/best years line up)", () => {
    expect(HISTORICAL_SHOCKS[2008 - HIST_START_YEAR]).toBeLessThan(-1.5); // GFC is a big negative shock
    expect(HISTORICAL_SHOCKS[1954 - HIST_START_YEAR]).toBeGreaterThan(1.5); // 1954 boom is a big positive one
  });
});

describe("Block-bootstrap shock sampler", () => {
  const rand = () => 0.5; // fixed → deterministic block starts
  it("returns a path of the requested length", () => {
    expect(bootstrapShockPath(rand, 44, 10)).toHaveLength(45);
    expect(bootstrapShockPath(rand, 0, 10)).toHaveLength(1);
  });
  it("draws only real historical shocks (resampling, not synthesis)", () => {
    const set = new Set(HISTORICAL_SHOCKS.map((v) => v.toFixed(6)));
    for (const v of bootstrapShockPath(rand, 60, 8)) expect(set.has(v.toFixed(6))).toBe(true);
  });
});

describe("runMonteCarlo bootstrap mode", () => {
  const plan: RetirementPlan = {
    ...DEFAULT_PLAN, household: "single",
    people: [{ ...DEFAULT_PLAN.people[0], currentAge: 45, superBalance: 0, salary: 0 }],
    superMode: "individual", homeowner: true, outsideSuper: 1_500_000, annualOutsideSavings: 0,
    retirementAge: 45, spendingMode: "flat", targetSpending: 75_000, // ~5% of $1.5M, off the ceiling
    investmentReturn: 7, returnVolatility: 11, inflation: 2.5, lifeExpectancy: 90,
  };
  it("produces a valid, deterministic success rate", () => {
    const a = runMonteCarlo(plan, cfg, { iterations: 300, model: "bootstrap", blockYears: 10 });
    const b = runMonteCarlo(plan, cfg, { iterations: 300, model: "bootstrap", blockYears: 10 });
    expect(a.successRate).toBeGreaterThanOrEqual(0);
    expect(a.successRate).toBeLessThanOrEqual(1);
    expect(a.successRate).toBe(b.successRate); // deterministic per seed
  });
  it("shares the plan's mean & volatility with the Gaussian model — only sequencing differs", () => {
    // Because the bootstrap re-expresses zero-mean/unit-variance historical shocks at
    // the plan's own mean & vol, it must land CLOSE to the Gaussian (not the wildly
    // different answer the old raw-historical bootstrap gave), but not identical —
    // real mean-reversion changes the tail.
    const gauss = runMonteCarlo(plan, cfg, { iterations: 800, model: "gaussian" }).successRate;
    const boot = runMonteCarlo(plan, cfg, { iterations: 800, model: "bootstrap", blockYears: 10 }).successRate;
    expect(Math.abs(boot - gauss)).toBeLessThan(0.15); // same mean/vol → close
    expect(boot).not.toBe(gauss); // but sequencing (mean-reversion) still moves it
  });
  it("is the default model", () => {
    expect(cfg.returnModel).toBe("bootstrap");
    const def = runMonteCarlo(plan, cfg, { iterations: 300 }).successRate; // no explicit model
    const boot = runMonteCarlo(plan, cfg, { iterations: 300, model: "bootstrap" }).successRate;
    expect(def).toBe(boot);
  });
});
