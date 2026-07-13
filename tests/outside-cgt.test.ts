import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";
import { residentIncomeTax } from "../lib/au/scenarios/reference";

// Deferred-CGT model for the outside-super (personal/brokerage) pool. An equity
// return splits into a dividend YIELD (realised — taxed each year at marginal
// rates) and capital GROWTH (unrealised — deferred until units are sold to fund
// spending, then taxed on the realised slice with the 50% CGT discount). This is
// far more accurate than the old model, which taxed the whole return as ordinary
// income every year and so massively over-taxed a share/ETF portfolio.
//
// Validated against an INDEPENDENT year-by-year recurrence derived from that rule
// (not the engine). To make the closed form exact: inflation 0 (today's $ = nominal),
// super 0 (all money outside, no ATO minimum), a FIXED return sequence, and a
// pre-Age-Pension window (no means test, ordinary resident scale, no SAPTO).

const cfg = { ...DEFAULT_CONFIG, livingStandardsGrowthPct: 0 };
const YIELD = cfg.outsideTax.incomeYieldPct / 100;
const DISCOUNT = 1 - cfg.outsideTax.cgtDiscountPct / 100;

const R = 6; // fixed nominal return (%) each year
const OUTSIDE0 = 2_000_000;
const SPEND = 100_000;

const plan: RetirementPlan = {
  ...DEFAULT_PLAN, household: "single", superMode: "individual",
  people: [{ currentAge: 60, superBalance: 0, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  homeowner: true, outsideSuper: OUTSIDE0, annualOutsideSavings: 0,
  retirementAge: 60, spendingMode: "flat", targetSpending: SPEND,
  investmentReturn: R, inflation: 0, lifeExpectancy: 85,
};

// Independent oracle: replay the documented rule year by year.
function oracle(years: number) {
  const out: { age: number; tax: number; closing: number }[] = [];
  let value = OUTSIDE0;
  let ug = 0; // unrealised gain (value − cost base); basis reset to value at retirement
  const r = R / 100;
  for (let i = 0; i < years; i++) {
    // 1. Draw spending, outside-first — realises a proportional slice of the gain.
    const draw = Math.min(SPEND, value);
    const gainFrac = value > 0 ? Math.max(0, ug) / value : 0;
    const realized = draw * gainFrac;
    ug -= realized;
    value -= draw;
    // 2. Grow: dividend yield is realised income; the rest is unrealised growth.
    const income = value * YIELD;
    ug += value * r - income;
    value *= 1 + r;
    // 3. Tax the year's assessable outside income (pre-67 resident scale, no work).
    const tax = residentIncomeTax(income + DISCOUNT * realized);
    value -= tax;
    out.push({ age: 60 + i, tax, closing: value });
  }
  return out;
}

describe("Outside-super deferred-CGT taxation", () => {
  const rows = simulate(plan, cfg, Array(30).fill(R), Array(30).fill(R)).rows;
  const ref = oracle(7); // ages 60..66, all pre-Age-Pension

  it("matches the independent recurrence for tax and closing balance, year by year", () => {
    for (const e of ref) {
      const row = rows.find((r) => r.age === e.age)!;
      expect(row.breakdown.outsideTax).toBeCloseTo(e.tax, 1);
      expect(row.breakdown.closingOutside).toBeCloseTo(e.closing, 0);
    }
  });

  it("first year realises no gain (fresh basis) — tax is pure dividend yield", () => {
    const y0 = rows.find((r) => r.age === 60)!;
    expect(y0.breakdown.outsideTax).toBeCloseTo(residentIncomeTax((OUTSIDE0 - SPEND) * YIELD), 1);
  });

  it("taxes far less than taxing the whole return as income (the old model)", () => {
    const y0 = rows.find((r) => r.age === 60)!;
    const oldModel = residentIncomeTax((OUTSIDE0 - SPEND) * (R / 100));
    expect(y0.breakdown.outsideTax).toBeLessThan(oldModel * 0.6);
  });
});
