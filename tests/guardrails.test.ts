import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { runMonteCarlo } from "../lib/au/montecarlo";
import { guardrailsOutlook, guardrailsTimeline } from "../lib/au/guardrails";
import { buildStrategyCatalog } from "../lib/au/strategies";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";

const base: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ ...DEFAULT_PLAN.people[0], currentAge: 60, superBalance: 500_000, salary: 0 }],
  superMode: "individual",
  homeowner: true,
  outsideSuper: 500_000,
  annualOutsideSavings: 0,
  retirementAge: 60,
  spendingMode: "flat",
  targetSpending: 55_000,
  investmentReturn: 7,
  returnVolatility: 11,
  inflation: 2.5,
  lifeExpectancy: 90,
};

const H = 31;
const livingPath = (p: RetirementPlan, seq?: number[]) =>
  simulate(p, cfg, seq).rows.filter((r) => r.phase !== "accumulation").map((r) => r.breakdown.livingSpend);

describe("Guyton-Klinger guardrails", () => {
  it("cuts spending after a market fall (upper rail)", () => {
    const crash = Array.from({ length: H }, (_, t) => (t < 3 ? -20 : 7));
    const path = livingPath({ ...base, guardrails: {} }, crash);
    expect(path[0]).toBe(55_000); // starts at the plan's spend
    expect(Math.min(...path)).toBeLessThan(50_000); // it trimmed
  });

  it("raises spending after strong returns (lower rail)", () => {
    const boom = Array.from({ length: H }, () => 15);
    const path = livingPath({ ...base, guardrails: {} }, boom);
    expect(Math.max(...path)).toBeGreaterThan(60_000); // it gave itself a raise
  });

  it("never cuts below the floor (max of essentials, 70% of initial)", () => {
    const deep = Array.from({ length: H }, () => -8);
    const path = livingPath({ ...base, guardrails: {} }, deep);
    // Floor is 70% of the $55k start (essentials are lower), so ~$38,500.
    expect(Math.min(...path)).toBeGreaterThanOrEqual(0.7 * 55_000 - 1);
    expect(Math.min(...path)).toBeLessThan(55_000); // it did cut toward the floor
  });

  it("lifts Monte Carlo success at an aggressive spend (the whole point)", () => {
    const aggressive: RetirementPlan = { ...base, targetSpending: 62_000 };
    const fixed = runMonteCarlo(aggressive, cfg).successRate;
    const flexible = runMonteCarlo({ ...aggressive, guardrails: {} }, cfg).successRate;
    expect(flexible).toBeGreaterThan(fixed + 0.1);
  });

  it("is off by default — unset behaves byte-identically to a fixed withdrawal", () => {
    const a = JSON.stringify(simulate(base, cfg).rows);
    const b = JSON.stringify(simulate({ ...base, guardrails: undefined }, cfg).rows);
    expect(a).toBe(b);
  });

  it("outlook: reports a bounded worst-case cut and the central spend path", () => {
    const o = guardrailsOutlook({ ...base, targetSpending: 62_000, guardrails: {} }, cfg, { iterations: 80 });
    expect(o.startSpend).toBe(62_000);
    expect(o.centralPath.length).toBeGreaterThan(10);
    expect(o.centralPath[0].spend).toBe(62_000);
    // Cuts can't breach the floor (70% of the start here), so worst-case ≤ 30%.
    expect(o.worstCutPct).toBeGreaterThan(0); // an aggressive spend does trigger cuts
    expect(o.worstCutPct).toBeLessThanOrEqual(0.301);
    expect(o.worstCutSpend).toBeGreaterThanOrEqual(0.7 * 62_000 - 1);
    expect(o.yearsBelowBad).toBeGreaterThan(0);
  });

  it("outlook: a comfortably-funded plan mostly raises, not cuts", () => {
    const o = guardrailsOutlook({ ...base, targetSpending: 30_000, guardrails: {} }, cfg, { iterations: 80 });
    expect(o.everRaises).toBe(true); // plenty of headroom → the central path lifts spending
    expect(o.worstCutPct).toBeLessThan(0.2); // rarely, if ever, forced to cut deeply
  });

  it("timeline: retire-into-downturn cuts to the floor, then a pension-driven recovery plateaus below the start", () => {
    const tl = guardrailsTimeline({ ...base, targetSpending: 62_000, guardrails: {} }, cfg);
    expect(tl.start).toBe(62_000);
    expect(tl.points.some((p) => p.action === "cut")).toBe(true); // cuts cascade
    expect(Math.min(...tl.points.map((p) => p.spend))).toBeLessThanOrEqual(tl.floor + 1); // reaches the floor
    expect(tl.points.some((p) => p.action === "raise")).toBe(true); // then recovers a step
    expect(tl.pensionAge).not.toBeNull(); // the Age Pension is what drives it
    expect(tl.plateauSpend).toBeLessThan(tl.start); // but settles below where it started
    expect(tl.lowerRail).toBeLessThan(tl.wr0); // rails straddle the initial rate
    expect(tl.upperRail).toBeGreaterThan(tl.wr0);
  });

  it("offers a What-If lever that enables guardrails, once", () => {
    const card = buildStrategyCatalog(base).find((c) => c.id === "guardrails");
    expect(card).toBeTruthy();
    expect(card!.apply(base, {}).guardrails).toBeTruthy();
    // Not offered again once the baseline already uses guardrails.
    expect(buildStrategyCatalog({ ...base, guardrails: {} }).some((c) => c.id === "guardrails")).toBe(false);
  });
});
