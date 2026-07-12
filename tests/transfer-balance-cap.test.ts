import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, deriveStages, type RetirementPlan } from "../lib/au/types";

// Super in pension phase is tax-free, but you can only move up to the Transfer
// Balance Cap into it — the excess stays in accumulation, its earnings taxed at
// 15%, and it carries no forced minimum drawdown. An "infinite cap" config
// reproduces the old (all-tax-free, minimum-on-the-lot) behaviour, giving a clean
// control to diff against.
const cfgNoCap = { ...cfg, transferBalanceCap: Number.POSITIVE_INFINITY };

const mk = (superBal: number, spend: number, outside: number, over: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ currentAge: 60, superBalance: superBal, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  homeowner: true,
  outsideSuper: outside,
  annualOutsideSavings: 0,
  retirementAge: 60,
  spendingMode: "flat",
  targetSpending: spend,
  spendingStages: deriveStages(spend),
  investmentReturn: 8,
  returnVolatility: 11,
  inflation: 0, // nominal == real, keeps the comparison clean
  lifeExpectancy: 90,
  ...over,
});

const finalTotal = (p: RetirementPlan, config = cfg) => {
  const r = simulate(p, config);
  return r.rows[r.rows.length - 1].total;
};

describe("Transfer Balance Cap — super above the cap is taxed at 15%", () => {
  it("under the cap, the cap makes no difference (backward compatible)", () => {
    // $500k drawn on $60k/yr stays well under the cap for the whole horizon.
    const p = mk(500_000, 60_000, 0);
    const capped = simulate(p, cfg);
    const uncapped = simulate(p, cfgNoCap);
    expect(capped.rows.length).toBe(uncapped.rows.length);
    for (let i = 0; i < capped.rows.length; i++) {
      expect(capped.rows[i].totalSuper).toBeCloseTo(uncapped.rows[i].totalSuper, 4);
      expect(capped.rows[i].outside).toBeCloseTo(uncapped.rows[i].outside, 4);
    }
  });

  it("above the cap, the 15% tax on the excess lowers total wealth (isolated: no outside)", () => {
    // No outside pool + a spend above the minimum ⇒ super draws the same amount
    // either way, so the ONLY difference is the tax on the accumulation excess.
    const p = mk(3_000_000, 150_000, 0);
    expect(finalTotal(p, cfg)).toBeLessThan(finalTotal(p, cfgNoCap));
  });

  it("the drag scales with the size of the excess", () => {
    const gap = (superBal: number) => finalTotal(mk(superBal, 150_000, 0), cfgNoCap) - finalTotal(mk(superBal, 150_000, 0), cfg);
    // Both over the cap; the bigger over-cap balance has more taxed excess.
    expect(gap(3_000_000)).toBeGreaterThan(gap(2_400_000));
    expect(gap(2_400_000)).toBeGreaterThan(0);
  });

  it("the forced minimum drawdown is smaller above the cap (only the pension portion)", () => {
    const p = mk(3_000_000, 60_000, 0, { retirementAge: 75, people: [{ currentAge: 75, superBalance: 3_000_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }] });
    const firstMin = (config = cfg) => {
      const r = simulate(p, config);
      return r.rows.find((x) => x.phase !== "accumulation")!.breakdown.minDrawdown;
    };
    expect(firstMin(cfg)).toBeLessThan(firstMin(cfgNoCap));
  });
});
