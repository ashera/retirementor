import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { runMonteCarlo } from "../lib/au/montecarlo";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";

// A working single with a sizeable outside-super pool, so the outside return has
// real leverage on the outcome. Inflation 0 keeps nominal == real for clarity.
const plan = (over: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ currentAge: 50, superBalance: 300_000, salary: 90_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  homeowner: true,
  outsideSuper: 250_000,
  annualOutsideSavings: 5_000,
  retirementAge: 60,
  spendingMode: "flat",
  targetSpending: 50_000,
  investmentReturn: 7,
  returnVolatility: 10,
  inflation: 0,
  lifeExpectancy: 90,
  ...over,
});

const finalOutside = (p: RetirementPlan) => {
  const r = simulate(p, cfg);
  return r.rows[r.rows.length - 1].outside;
};

describe("Separate super vs outside-super returns", () => {
  it("is a no-op when outsideReturn is unset (defaults to the super return)", () => {
    const base = simulate(plan(), cfg);
    const explicit = simulate(plan({ outsideReturn: 7, outsideVolatility: 10 }), cfg);
    for (let i = 0; i < base.rows.length; i++) {
      expect(explicit.rows[i].outside).toBeCloseTo(base.rows[i].outside, 6);
      expect(explicit.rows[i].totalSuper).toBeCloseTo(base.rows[i].totalSuper, 6);
    }
  });

  it("a lower outside return grows the outside pool more slowly than the super pool's return would", () => {
    const same = finalOutside(plan()); // outside grows at 7% (default)
    const lower = finalOutside(plan({ outsideReturn: 3 })); // outside grows at 3%
    expect(lower).toBeLessThan(same);
  });

  it("changing only the outside return leaves the super trajectory untouched", () => {
    const base = simulate(plan(), cfg);
    const conservative = simulate(plan({ outsideReturn: 3 }), cfg);
    // Super balances are identical year by year (same super return, and the
    // drawdown order draws outside first so super isn't disturbed differently
    // until the outside pool is exhausted — check the accumulation + early years).
    const accumYears = base.rows.filter((r) => r.phase === "accumulation").length;
    for (let i = 0; i < accumYears + 3; i++) {
      expect(conservative.rows[i].totalSuper).toBeCloseTo(base.rows[i].totalSuper, 6);
    }
  });

  it("taxes the outside pool's OWN earnings in retirement, not the super return", () => {
    // Large outside pool (so the dividend yield clears LITO), retired, pre-67 window.
    // A higher return grows the pool and its unrealised gains faster → more dividend
    // income AND more discounted gain realised on drawdown → more outside-super tax.
    const p = (r: number) => plan({ outsideSuper: 1_500_000, outsideReturn: r, retirementAge: 60, targetSpending: 60_000 });
    const taxAt = (r: number) => {
      const rows = simulate(p(r), cfg).rows.filter((x) => x.phase !== "accumulation" && x.age >= 61 && x.age < 67);
      return rows.reduce((s, x) => s + x.breakdown.outsideTax, 0);
    };
    expect(taxAt(3)).toBeGreaterThan(0); // genuinely taxed at this scale
    expect(taxAt(8)).toBeGreaterThan(taxAt(3));
  });

  it("Monte Carlo: a near-zero outside volatility keeps the outside pool stable (cash-like)", () => {
    // Outside-dominant pool, measured EARLY in retirement (before it's drawn down),
    // so the outside pool's own volatility drives the fan spread.
    const big = (over: Partial<RetirementPlan>) =>
      plan({ people: [{ currentAge: 58, superBalance: 120_000, salary: 90_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }], outsideSuper: 700_000, retirementAge: 60, targetSpending: 45_000, ...over });
    const spreadAt = (mc: ReturnType<typeof runMonteCarlo>, age: number) => {
      const pt = mc.fan.find((f) => f.age === age)!;
      return pt.p90 - pt.p10;
    };
    const cashish = runMonteCarlo(big({ outsideReturn: 3, outsideVolatility: 0.2, returnVolatility: 10 }), cfg, { iterations: 250, seed: 42 });
    const volatile = runMonteCarlo(big({ outsideReturn: 3, outsideVolatility: 12, returnVolatility: 10 }), cfg, { iterations: 250, seed: 42 });
    // The cash-like outside pool should produce a materially narrower fan than a
    // highly volatile one (its own volatility, not the super figure, drives it).
    expect(spreadAt(cashish, 63)).toBeLessThan(spreadAt(volatile, 63) * 0.8);
  });

  it("Monte Carlo runs unchanged when the pools are identical (single-sequence path)", () => {
    const a = runMonteCarlo(plan(), cfg, { iterations: 150, seed: 7 });
    const b = runMonteCarlo(plan({ outsideReturn: 7, outsideVolatility: 10 }), cfg, { iterations: 150, seed: 7 });
    // Splitting the pools with identical params must reproduce the shared-sequence
    // result exactly (the shock z is the same; mean/sd are the same).
    expect(b.successRate).toBeCloseTo(a.successRate, 6);
    expect(b.medianTerminalBalance).toBeCloseTo(a.medianTerminalBalance, 4);
  });
});
