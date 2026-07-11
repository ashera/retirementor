import { describe, it, expect } from "vitest";
import { earliestRetirement } from "../lib/au/goalseek";
import { runMonteCarlo, MC_CONFIDENCE_TARGET as TARGET, MC_CONFIDENCE_MC as MC } from "../lib/au/montecarlo";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, deriveStages, type RetirementPlan } from "../lib/au/types";

// A comfortably-funded mid-50s single with room to retire well before their
// planned age. Overrides let us build the unaffordable case too.
const plan = (over: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ currentAge: 50, superBalance: 550_000, salary: 130_000, voluntaryConcessional: 15_000, voluntaryNonConcessional: 0 }],
  homeowner: true,
  outsideSuper: 400_000,
  annualOutsideSavings: 20_000,
  retirementAge: 65,
  spendingMode: "flat",
  targetSpending: 52_000,
  spendingStages: deriveStages(52_000),
  investmentReturn: 7,
  returnVolatility: 11,
  inflation: 2.5,
  lifeExpectancy: 90,
  ...over,
});

// Seeded Monte Carlo is deterministic, so the boundary is exact (no flakiness).
const succ = (p: RetirementPlan, age: number) =>
  runMonteCarlo({ ...p, retirementAge: age }, cfg, MC).successRate;

describe("earliestRetirement — the FIRE lens", () => {
  it("finds the earliest age that clears the bar, and it's a true boundary", () => {
    const p = plan();
    const e = earliestRetirement(p, cfg);
    expect(e.age).not.toBeNull();
    expect(e.age!).toBeGreaterThanOrEqual(40);
    expect(e.age!).toBeLessThanOrEqual(p.retirementAge);
    // The reported age clears the bar…
    expect(succ(p, e.age!)).toBeGreaterThanOrEqual(TARGET);
    // …and one year earlier does not (a genuine boundary), unless we're at the floor.
    if (e.age! > 40) expect(succ(p, e.age! - 1)).toBeLessThan(TARGET);
  });

  it("reports currentClears when the earliest age is at/below the planned age", () => {
    const e = earliestRetirement(plan(), cfg);
    expect(e.currentClears).toBe(e.age != null && e.age <= e.currentRetireAge);
    expect(e.currentClears).toBe(true); // this plan is comfortably safe
  });

  it("retiring later stays safe (monotonic enough for the search)", () => {
    const p = plan();
    const e = earliestRetirement(p, cfg);
    expect(succ(p, Math.min(75, e.age! + 3))).toBeGreaterThanOrEqual(TARGET);
  });

  it("returns null when even working to 75 can't reach the bar", () => {
    const e = earliestRetirement(
      plan({ targetSpending: 200_000, spendingStages: deriveStages(200_000), outsideSuper: 20_000, annualOutsideSavings: 0, people: [{ currentAge: 50, superBalance: 100_000, salary: 80_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }] }),
      cfg,
    );
    expect(e.age).toBeNull();
    expect(e.currentClears).toBe(false);
  });

  it("does not mutate the caller's plan (spend held fixed)", () => {
    const p = plan();
    const spend = p.targetSpending;
    const retire = p.retirementAge;
    earliestRetirement(p, cfg);
    expect(p.targetSpending).toBe(spend);
    expect(p.retirementAge).toBe(retire);
  });

  it("honours a custom confidence target (higher bar ⇒ retire no earlier)", () => {
    const p = plan();
    const at85 = earliestRetirement(p, cfg, 0.85).age;
    const at95 = earliestRetirement(p, cfg, 0.95).age;
    if (at85 != null && at95 != null) expect(at95).toBeGreaterThanOrEqual(at85);
  });
});
