import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";

const plan = (over: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ currentAge: 55, superBalance: 300_000, salary: 90_000, voluntaryConcessional: 5_000, voluntaryNonConcessional: 0 }],
  homeowner: true,
  outsideSuper: 120_000,
  annualOutsideSavings: 6_000,
  retirementAge: 60,
  spendingMode: "flat",
  targetSpending: 45_000,
  investmentReturn: 6,
  inflation: 2.5,
  lifeExpectancy: 85,
  ...over,
});

const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

describe("Year breakdown ledger", () => {
  it("every year's closing balance chains to the next year's opening", () => {
    const p = plan();
    const r = simulate(p, cfg);
    // The stock is re-expressed wage-real → CPI-real at the retirement boundary
    // (RG 276 two-stage), so closing×wedge chains to the next opening there.
    const n = Math.max(0, Math.round(p.retirementAge - p.people[0].currentAge));
    const wedge = Math.pow((1 + (p.inflation + cfg.livingStandardsGrowthPct) / 100) / (1 + p.inflation / 100), n);
    for (let i = 0; i < r.rows.length - 1; i++) {
      const a = r.rows[i].breakdown;
      const b = r.rows[i + 1].breakdown;
      const f = r.rows[i].phase === "accumulation" && r.rows[i + 1].phase !== "accumulation" ? wedge : 1;
      expect(near(a.closingSuper * f, b.openingSuper)).toBe(true);
      expect(near(a.closingOutside * f, b.openingOutside)).toBe(true);
    }
  });

  it("reconciles accumulation years: opening + contributions + growth = closing", () => {
    const r = simulate(plan(), cfg);
    const accum = r.rows.filter((x) => x.phase === "accumulation");
    expect(accum.length).toBeGreaterThan(0);
    for (const { breakdown: b } of accum) {
      expect(near(b.openingSuper + b.contribNet + b.ttrBenefit - b.fees + b.superGrowth, b.closingSuper)).toBe(true);
      expect(near(b.openingOutside + b.savings + b.outsideGrowth, b.closingOutside)).toBe(true);
    }
  });

  it("reconciles retirement super: opening − loan cleared − drawn + growth = closing", () => {
    const r = simulate(plan({ targetSpending: 45_000 }), cfg);
    const ret = r.rows.filter((x) => x.phase !== "accumulation");
    for (const row of ret) {
      const b = row.breakdown;
      expect(near(b.openingSuper - b.mortgageCleared - row.superDrawn - b.fees + b.superGrowth, b.closingSuper)).toBe(true);
    }
  });

  it("reconciles funded retirement spending: pension + rent + net drawdown = spend", () => {
    const r = simulate(plan(), cfg);
    for (const row of r.rows.filter((x) => x.phase !== "accumulation" && x.funded)) {
      const b = row.breakdown;
      const openingTotal = b.openingSuper + b.openingOutside;
      const closingTotal = b.closingSuper + b.closingOutside;
      const growth = b.superGrowth + b.outsideGrowth;
      // Net money pulled from savings to fund spending (negative = surplus saved).
      const netDrawdown = openingTotal + growth + b.propertyProceeds - b.mortgageCleared - b.fees - b.outsideTax - closingTotal;
      expect(near(b.agePension + b.rentIncome + netDrawdown, row.spending, 2)).toBe(true);
    }
  });

  it("captures the property sale (proceeds + CGT) in the year it sells", () => {
    const r = simulate(
      plan({
        people: [{ currentAge: 65, superBalance: 700_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
        retirementAge: 65,
        investmentProperty: {
          value: 500_000, growthReal: 2, grossYield: 4, costRatio: 25,
          loanBalance: 150_000, loanRate: 6, purchasePrice: 300_000,
          strategy: "sell", sellAtAge: 70,
        },
      }),
      cfg,
    );
    const saleRow = r.rows.find((x) => x.breakdown.propertyProceeds > 0)!;
    expect(saleRow.age).toBe(70);
    expect(saleRow.breakdown.propertyCgt).toBeGreaterThan(0);
    // Proceeds show up as a jump in the outside-super pool.
    expect(saleRow.breakdown.closingOutside).toBeGreaterThan(saleRow.breakdown.openingOutside + 200_000);
  });
});
