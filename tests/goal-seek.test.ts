import { describe, it, expect } from "vitest";
import { whatWillItTake, trimSpending, boostSpending } from "../lib/au/goalseek";
import { simulate } from "../lib/au/simulate";
import { lifestageBreakdown } from "../lib/au/lifestages";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";

const base: RetirementPlan = {
  ...DEFAULT_PLAN,
  people: [{ ...DEFAULT_PLAN.people[0], currentAge: 45, superBalance: 200_000, salary: 110_000, voluntaryConcessional: 5_000 }],
  outsideSuper: 150_000,
  annualOutsideSavings: 15_000,
  retirementAge: 60,
  spendingMode: "flat",
  investmentReturn: 7,
  inflation: 2.5,
  lifeExpectancy: 95,
};

describe("Goal-seek", () => {
  it("offers concrete fixes for a plan that falls short", () => {
    const gs = whatWillItTake({ ...base, targetSpending: 95_000 }, cfg);
    expect(gs.lasts).toBe(false);
    expect(gs.maxSpend!).toBeLessThan(95_000);
    expect(gs.extraSavings!).toBeGreaterThan(0);
    expect(gs.retireAge!).toBeGreaterThan(60);
  });

  it("needs no extra saving for a plan that already lasts", () => {
    const gs = whatWillItTake({ ...base, targetSpending: 45_000 }, cfg);
    expect(gs.lasts).toBe(true);
    expect(gs.extraSavings).toBe(0);
  });

  it("finds a max sustainable spend that lasts but just above it does not", () => {
    const gs = whatWillItTake({ ...base, targetSpending: 95_000 }, cfg);
    const at = simulate({ ...base, targetSpending: gs.maxSpend! }, cfg);
    const above = simulate({ ...base, targetSpending: gs.maxSpend! + 5_000 }, cfg);
    expect(at.lastsToLifeExpectancy).toBe(true);
    expect(above.lastsToLifeExpectancy).toBe(false);
  });
});

describe("Spending boost (mirror of trim)", () => {
  // A comfortably-funded plan → real headroom to spend more.
  const plan: RetirementPlan = { ...base, targetSpending: 45_000 };

  it("raises spending, holds essentials, and still lasts to life expectancy", () => {
    const before = lifestageBreakdown(plan, cfg);
    const boost = boostSpending(plan, cfg);

    expect(boost.applicable).toBe(true); // the plan already lasts
    expect(boost.hasHeadroom).toBe(true);
    expect(boost.essentials).toBeCloseTo(before.essentials, 0); // floor untouched
    expect(boost.extraPerYear).toBeGreaterThan(0);
    expect(boost.newHeadlineLiving).toBeGreaterThan(before.rows[0].living);

    // The applied boost genuinely still lasts on the central projection.
    const after = simulate({ ...plan, ...boost.patch }, cfg);
    expect(after.lastsToLifeExpectancy).toBe(true);
    expect(boost.lastsAfter).toBe(true);
  });

  it("is not offered when the plan already can't last (trim's territory)", () => {
    const boost = boostSpending({ ...base, targetSpending: 95_000 }, cfg);
    expect(boost.applicable).toBe(false);
    expect(boost.hasHeadroom).toBe(false);
  });

  it("boosting to the max leaves essentially no further headroom", () => {
    const boost = boostSpending(plan, cfg);
    const boosted = { ...plan, ...boost.patch };
    // After spending the headroom, a re-boost finds little to nothing left.
    const again = boostSpending(boosted, cfg);
    expect(again.extraPerYear).toBeLessThan(boost.extraPerYear);
  });
});

describe("Spending trim (prudent, mirror of boost)", () => {
  // Well-funded so a HIGH spend is under the 85% bar yet trimmable back to it
  // (unlike the stretched `base`, where even essentials-only can't get there).
  const rich: RetirementPlan = {
    ...DEFAULT_PLAN,
    people: [{ ...DEFAULT_PLAN.people[0], currentAge: 55, superBalance: 700_000, salary: 120_000, voluntaryConcessional: 0 }],
    outsideSuper: 400_000, annualOutsideSavings: 20_000, retirementAge: 65,
    spendingMode: "flat", investmentReturn: 7, inflation: 2.5, lifeExpectancy: 90,
  };

  it("trims an over-spending plan back toward the confidence bar, holding essentials", () => {
    const plan: RetirementPlan = { ...rich, targetSpending: 90_000 };
    const before = lifestageBreakdown(plan, cfg);
    const trim = trimSpending(plan, cfg);

    expect(trim.applicable).toBe(true); // current spend is under the 85% bar
    expect(trim.feasible).toBe(true);
    expect(trim.successBefore).toBeLessThan(0.85);
    expect(trim.successAfter).toBeGreaterThan(trim.successBefore); // trimming lifts the odds
    expect(trim.successAfter).toBeGreaterThanOrEqual(0.8); // ~ the 85% target
    expect(trim.essentials).toBeCloseTo(before.essentials, 0); // floor untouched
    expect(trim.discretionaryKeptPct).toBeGreaterThan(0);
    expect(trim.discretionaryKeptPct).toBeLessThan(100); // something was trimmed

    // The trimmed plan lasts on the central projection (a fortiori of 85% MC).
    const after = simulate({ ...plan, ...trim.patch }, cfg);
    expect(after.lastsToLifeExpectancy).toBe(true);
  });

  it("best-effort: trims to 'lasts on average' when the 85% bar is out of reach", () => {
    // Under-funded: even essentials-only can't clear 85%, but there IS discretionary
    // to cut — so it must still offer a useful trim, not dead-end.
    const plan: RetirementPlan = {
      ...DEFAULT_PLAN, household: "single",
      people: [{ ...DEFAULT_PLAN.people[0], currentAge: 60, superBalance: 300_000 }],
      superMode: "individual", homeowner: true, outsideSuper: 60_000, annualOutsideSavings: 0,
      retirementAge: 64, spendingMode: "flat", targetSpending: 55_000,
      investmentReturn: 6, inflation: 2.5, lifeExpectancy: 92,
    };
    const trim = trimSpending(plan, cfg);
    expect(trim.applicable).toBe(true);
    expect(trim.feasible).toBe(true); // still offers a trim...
    expect(trim.reachesTarget).toBe(false); // ...even though it can't hit 85%
    expect(trim.successAfter).toBeGreaterThan(trim.successBefore); // it improves the odds
    expect(trim.discretionaryKeptPct).toBeGreaterThan(0); // keeps some (lasts, not essentials-only)
    expect(simulate({ ...plan, ...trim.patch }, cfg).lastsToLifeExpectancy).toBe(true);
  });

  it("cuts discretionary fully when 85% is out of reach AND the plan already lasts on average", () => {
    // Lasts on the CENTRAL projection at full spend but only ~37% in Monte Carlo,
    // and even essentials-only can't clear 85%. The old fallback ("largest d that
    // lasts on central") returned d=1 → trimmed NOTHING ("keep 100%, cut $0"). It
    // must instead cut discretionary fully so the trim still improves the odds.
    const plan: RetirementPlan = {
      ...DEFAULT_PLAN, household: "single",
      people: [{ ...DEFAULT_PLAN.people[0], currentAge: 60, superBalance: 600_000, salary: 0, voluntaryConcessional: 0 }],
      superMode: "individual", homeowner: true, outsideSuper: 72_000, annualOutsideSavings: 0,
      retirementAge: 60, spendingMode: "flat", targetSpending: 52_000,
      investmentReturn: 7, returnVolatility: 20, inflation: 2.5, lifeExpectancy: 90,
    };
    expect(simulate(plan, cfg).lastsToLifeExpectancy).toBe(true); // lasts on central at full spend
    const trim = trimSpending(plan, cfg);
    expect(trim.applicable).toBe(true);
    expect(trim.successBefore).toBeLessThan(0.85);
    expect(trim.feasible).toBe(true);
    expect(trim.reachesTarget).toBe(false);
    expect(trim.discretionaryKeptPct).toBe(0); // cut all discretionary — the most trimming can do
    expect(trim.successAfter).toBeGreaterThan(trim.successBefore + 0.1); // and it meaningfully lifts the odds
  });

  it("is not offered when the plan is already prudent (boost's territory)", () => {
    const trim = trimSpending({ ...rich, targetSpending: 45_000 }, cfg);
    expect(trim.applicable).toBe(false);
  });

  it("trim and boost are complementary — exactly one applies at any spend", () => {
    for (const spend of [45_000, 90_000, 110_000]) {
      const p: RetirementPlan = { ...rich, targetSpending: spend };
      expect(trimSpending(p, cfg).applicable).toBe(!boostSpending(p, cfg).applicable);
    }
  });
});
