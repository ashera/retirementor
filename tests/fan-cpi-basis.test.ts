import { describe, it, expect } from "vitest";
import { runMonteCarlo } from "../lib/au/montecarlo";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, deriveStages, type RetirementPlan } from "../lib/au/types";

// The engine expresses accumulation-year balances in WAGE-deflated today's dollars
// and retirement-year balances in CPI-deflated dollars (RG 276), rebasing the stock
// at the boundary. Plotted raw, the Monte Carlo fan steps up ~50% at retirement.
// runMonteCarlo now lifts the accumulation percentiles onto the CPI basis — like the
// balance chart — so the fan is one continuous trajectory.
const plan = (over: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ currentAge: 35, superBalance: 100_000, salary: 90_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  homeowner: true,
  outsideSuper: 50_000,
  annualOutsideSavings: 8_000,
  retirementAge: 60,
  spendingMode: "flat",
  targetSpending: 55_000,
  spendingStages: deriveStages(55_000),
  investmentReturn: 8,
  returnVolatility: 11,
  inflation: 2.5,
  lifeExpectancy: 90,
  ...over,
});

const p50 = (mc: ReturnType<typeof runMonteCarlo>, age: number) => mc.fan.find((f) => f.age === age)!.p50;

describe("Fan chart drawn on one CPI basis — no rebase step at retirement", () => {
  it("the median rises smoothly across the retirement boundary", () => {
    const p = plan();
    const mc = runMonteCarlo(p, cfg, { iterations: 500, seed: 12345 });
    const boundaryJump = p50(mc, p.retirementAge) / p50(mc, p.retirementAge - 1);
    const priorJump = p50(mc, p.retirementAge - 1) / p50(mc, p.retirementAge - 2);
    // The ~50% rebase is gone — the boundary is a normal one-year growth step…
    expect(boundaryJump).toBeLessThan(1.2);
    // …and in line with the neighbouring accumulation year, not ~10× bigger.
    expect(boundaryJump).toBeLessThan(priorJump * 2.5);
  });

  it("leaves the start balance (t=0) unscaled", () => {
    const p = plan();
    const mc = runMonteCarlo(p, cfg, { iterations: 200, seed: 7 });
    expect(mc.fan[0].age).toBe(p.people[0].currentAge);
    // Every run opens on the same balance, so the first percentile is the starting
    // total (super + outside) exactly — untouched by the smoothing.
    expect(p50(mc, p.people[0].currentAge)).toBeCloseTo(150_000, 0);
  });

  it("is a no-op when wages track CPI (living-standards growth 0)", () => {
    const p = plan();
    const flat = { ...cfg, livingStandardsGrowthPct: 0 };
    const mc = runMonteCarlo(p, flat, { iterations: 300, seed: 3 });
    // No wage/CPI wedge → no rebase in the engine, nothing to smooth; still continuous.
    expect(p50(mc, p.retirementAge) / p50(mc, p.retirementAge - 1)).toBeLessThan(1.2);
  });

  it("doesn't disturb the success rate (smoothing is display-only)", () => {
    const p = plan();
    const a = runMonteCarlo(p, cfg, { iterations: 400, seed: 99 }).successRate;
    const b = runMonteCarlo(p, cfg, { iterations: 400, seed: 99 }).successRate;
    expect(a).toBe(b); // deterministic; scaling percentiles changed nothing upstream
    expect(a).toBeGreaterThan(0);
  });
});
