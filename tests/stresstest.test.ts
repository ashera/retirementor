import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN } from "../lib/au/types";
import type { RetirementPlan } from "../lib/au/types";
import { simulate } from "../lib/au/simulate";
import { runStressTest, STRESS_ERAS } from "../lib/au/stresstest";

const comfortable: RetirementPlan = {
  ...DEFAULT_PLAN,
  people: [{ currentAge: 64, superBalance: 1_500_000, salary: 120_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  retirementAge: 65, outsideSuper: 300_000, annualOutsideSavings: 0,
  spendingMode: "flat", targetSpending: 55_000, homeowner: true,
};

const stretched: RetirementPlan = {
  ...DEFAULT_PLAN,
  people: [{ currentAge: 59, superBalance: 450_000, salary: 90_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  retirementAge: 60, outsideSuper: 30_000, annualOutsideSavings: 0,
  spendingMode: "flat", targetSpending: 52_000, homeowner: true,
};

describe("historical stress test", () => {
  it("runs the full era battery", () => {
    const r = runStressTest(comfortable, cfg);
    expect(r.total).toBe(STRESS_ERAS.length);
    expect(r.eras).toHaveLength(STRESS_ERAS.length);
    expect(new Set(r.eras.map((e) => e.id))).toEqual(new Set(STRESS_ERAS.map((e) => e.id)));
  });

  it("is deterministic", () => {
    expect(runStressTest(stretched, cfg)).toEqual(runStressTest(stretched, cfg));
  });

  it("a well-funded plan survives every era, but the crashes still dent the outcome", () => {
    const r = runStressTest(comfortable, cfg);
    expect(r.survived).toBe(r.total);
    // Stress can only make the ending worse than the smooth central projection.
    const centralFinal = simulate(comfortable, cfg).rows.at(-1)!.total;
    expect(r.worst!.finalBalance).toBeLessThan(centralFinal);
    // A real bear era produces a real drawdown.
    expect(Math.max(...r.eras.map((e) => e.maxDrawdownPct))).toBeGreaterThan(15);
  });

  it("a stretched plan fails some eras (sequence risk revealed)", () => {
    const r = runStressTest(stretched, cfg);
    expect(r.survived).toBeLessThan(r.total);
    expect(r.survived).toBeLessThan(runStressTest(comfortable, cfg).survived);
    expect(r.worst!.lasts).toBe(false);
    expect(r.worst!.depletionAge).not.toBeNull();
  });

  it("flexible spending (guardrails) never survives fewer eras than fixed", () => {
    for (const plan of [comfortable, stretched]) {
      const fixed = runStressTest({ ...plan, guardrails: undefined }, cfg);
      const flex = runStressTest({ ...plan, guardrails: {} }, cfg);
      expect(flex.survived).toBeGreaterThanOrEqual(fixed.survived);
    }
    // On the stretched plan, flexing should actually help.
    const fixed = runStressTest({ ...stretched, guardrails: undefined }, cfg);
    const flex = runStressTest({ ...stretched, guardrails: {} }, cfg);
    expect(flex.survived).toBeGreaterThan(fixed.survived);
  });

  it("records the spending cut under flexible spending, but not under fixed", () => {
    const fixed = runStressTest({ ...comfortable, guardrails: undefined }, cfg);
    const flex = runStressTest({ ...comfortable, guardrails: {} }, cfg);
    // Fixed spending is constant → no cut is ever recorded.
    expect(fixed.eras.every((e) => e.cutYears === 0)).toBe(true);
    // Flexible spending trims in the brutal eras → at least one era shows a real cut.
    const cutEra = flex.eras.find((e) => e.cutYears > 0);
    expect(cutEra).toBeTruthy();
    expect(cutEra!.minLivingSpend).toBeLessThan(comfortable.targetSpending);
    expect(cutEra!.deepestCutPct).toBeGreaterThan(0);
  });

  it("the flexibility ladder is monotonic: deeper cuts never survive fewer eras", () => {
    // Willing to cut more (lower floor %) → survive at least as many.
    const toBone = runStressTest({ ...stretched, guardrails: { floorPct: 0 } }, cfg).survived;
    const toTen = runStressTest({ ...stretched, guardrails: { floorPct: 90 } }, cfg).survived;
    const noCut = runStressTest({ ...stretched, guardrails: undefined }, cfg).survived;
    expect(toBone).toBeGreaterThanOrEqual(toTen);
    expect(toTen).toBeGreaterThanOrEqual(noCut);
  });

  it("sorts worst-first: failures before survivors, earliest depletion first", () => {
    const eras = runStressTest(stretched, cfg).eras;
    const firstSurvivor = eras.findIndex((e) => e.lasts);
    if (firstSurvivor >= 0) {
      // no failure appears after the first survivor
      expect(eras.slice(firstSurvivor).every((e) => e.lasts)).toBe(true);
    }
    const fails = eras.filter((e) => !e.lasts);
    for (let i = 1; i < fails.length; i++) {
      expect(fails[i].depletionAge!).toBeGreaterThanOrEqual(fails[i - 1].depletionAge!);
    }
  });
});
