import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { buildStrategyCatalog } from "../lib/au/strategies";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";

// A retiree at/over preservation age whose OUTSIDE super comfortably covers
// spending — so the pension-vs-accumulation choice is exactly the Reddit request.
const base: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ ...DEFAULT_PLAN.people[0], currentAge: 62, superBalance: 700_000, salary: 0, voluntaryConcessional: 0 }],
  superMode: "individual",
  homeowner: true,
  outsideSuper: 900_000,
  annualOutsideSavings: 0,
  retirementAge: 62,
  spendingMode: "flat",
  targetSpending: 55_000,
  investmentReturn: 7,
  returnVolatility: 11,
  inflation: 2.5,
  lifeExpectancy: 90,
};

const firstRetRow = (p: RetirementPlan) =>
  simulate(p, cfg).rows.find((r) => r.phase !== "accumulation")!;

describe("Keep super in accumulation", () => {
  it("default (pension phase) converts super and forces a minimum drawdown", () => {
    const row = firstRetRow(base);
    // A pension pool exists and the legislated minimum is drawn (even though outside
    // covers spending, so the surplus is reinvested outside super).
    expect(row.breakdown.pensionSuper).toBeGreaterThan(1);
    expect(row.breakdown.accumSuper).toBeLessThan(1);
    expect(row.breakdown.minDrawdown).toBeGreaterThan(1);
    expect(row.superDrawn).toBeGreaterThan(1);
  });

  it("keepSuperInAccumulation leaves it in accumulation with NO forced drawdown", () => {
    const row = firstRetRow({ ...base, keepSuperInAccumulation: true });
    // Everything stays in accumulation; no pension pool, no minimum, nothing drawn
    // (outside covers spending).
    expect(row.breakdown.accumSuper).toBeGreaterThan(1);
    expect(row.breakdown.pensionSuper).toBeLessThan(1);
    expect(row.breakdown.minDrawdown).toBeLessThan(1);
    expect(row.superDrawn).toBeLessThan(1);
  });

  it("taxes accumulation earnings at 15% throughout retirement (vs tax-free pension)", () => {
    const ret = (p: RetirementPlan) => simulate(p, cfg).rows.filter((r) => r.phase !== "accumulation");
    const pensionTax = ret(base).reduce((s, r) => s + (r.breakdown.earningsTax ?? 0), 0);
    const accumTax = ret({ ...base, keepSuperInAccumulation: true }).reduce((s, r) => s + (r.breakdown.earningsTax ?? 0), 0);
    expect(pensionTax).toBeLessThan(1); // pension-phase earnings are tax-free
    expect(accumTax).toBeGreaterThan(10_000); // accumulation pays 15% on earnings
  });

  it("is off by default — unset behaves byte-identically to the pension path", () => {
    const a = simulate(base, cfg);
    const b = simulate({ ...base, keepSuperInAccumulation: false }, cfg);
    expect(JSON.stringify(a.rows)).toBe(JSON.stringify(b.rows));
  });

  it("offers a What-If lever that keeps super in accumulation when super exists", () => {
    const card = buildStrategyCatalog(base).find((c) => c.id === "keep-accumulation");
    expect(card).toBeTruthy();
    expect(card!.apply(base, {}).keepSuperInAccumulation).toBe(true);
    // Not offered once the baseline already keeps it in accumulation.
    expect(
      buildStrategyCatalog({ ...base, keepSuperInAccumulation: true }).some((c) => c.id === "keep-accumulation"),
    ).toBe(false);
  });
});
