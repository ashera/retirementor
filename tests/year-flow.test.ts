import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { buildStrategyCatalog, resolveValues } from "../lib/au/strategies";
import { deriveStages, type PropertyDetail, type RetirementPlan } from "../lib/au/types";
import { yearFlow } from "../lib/au/yearFlow";
import { rowNetWorth } from "../lib/au/networth";

const single = (over: Partial<RetirementPlan> = {}): RetirementPlan => ({
  household: "single",
  people: [{ currentAge: 55, superBalance: 400_000, salary: 100_000, voluntaryConcessional: 5_000, voluntaryNonConcessional: 0 }],
  superMode: "individual", jointSuperBalance: 400_000, jointSuperSplit: 50,
  homeowner: true, outsideSuper: 200_000, annualOutsideSavings: 10_000,
  retirementAge: 65, spendingMode: "flat", targetSpending: 60_000, spendingStages: deriveStages(60_000),
  investmentReturn: 7, returnVolatility: 11, inflation: 2.5, lifeExpectancy: 92,
  ...over,
});

const staggered = single({
  household: "couple",
  people: [
    { currentAge: 55, superBalance: 320_000, salary: 105_000, voluntaryConcessional: 5_000, voluntaryNonConcessional: 0 },
    { currentAge: 55, superBalance: 260_000, salary: 90_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0, retirementAge: 67 },
  ],
  retirementAge: 60, targetSpending: 72_000, spendingStages: deriveStages(72_000),
});

const prop: PropertyDetail = { value: 500_000, growthReal: 2, grossYield: 4, costRatio: 25, loanBalance: 150_000, loanRate: 6, purchasePrice: 300_000, strategy: "hold", sellAtAge: 78 };

const apply = (plan: RetirementPlan, id: string, vals: Record<string, number> = {}) => {
  const card = buildStrategyCatalog(plan).find((c) => c.id === id)!;
  return card.apply(plan, resolveValues(card, vals));
};

// "Vanilla" plans have no home-equity or mortgage one-offs, so the explicit
// drivers must fully explain every year (no "other" line).
const vanilla: Record<string, RetirementPlan> = {
  single: single(),
  "high-outside": single({ people: [{ currentAge: 66, superBalance: 500_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }], retirementAge: 66, outsideSuper: 900_000, targetSpending: 80_000 }),
  staggered,
  "held-property": single({ investmentProperties: [prop] }),
};

// Plans with one-off equity/loan events — the total must still tie (an "other"
// line may appear to absorb event-timing effects).
const eventful: Record<string, RetirementPlan> = {
  "sell-property": single({ investmentProperties: [{ ...prop, strategy: "sell", sellAtAge: 70 }] }),
  downsize: apply(single({ people: [{ currentAge: 64, superBalance: 400_000, salary: 90_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }], retirementAge: 65, home: { value: 1_200_000, growthReal: 0 } }), "downsize", { age: 70, newValue: 700_000, toSuper: 200_000 }),
  "clear-mortgage": apply(single({ mortgage: { type: "principal_interest", balance: 180_000, interestRate: 6, annualRepayment: 16_000, payoffAge: 78, strategy: "carry" } }), "clear-mortgage"),
  "lump-sum": single({ lumpSum: { atAge: 72, amount: 90_000 } }),
};

describe("Year-flow waterfall reconciliation", () => {
  for (const [label, plan] of Object.entries({ ...vanilla, ...eventful })) {
    it(`ties opening + drivers = closing every year (${label})`, () => {
      for (const row of simulate(plan, cfg).rows) {
        const f = yearFlow(row);
        const sum = f.lines.reduce((s, l) => s + l.amount, 0);
        expect(Math.abs(f.opening + sum - f.closing)).toBeLessThan(1);
      }
    });
  }

  for (const [label, plan] of Object.entries(vanilla)) {
    it(`explicit drivers fully explain every year — no "other" (${label})`, () => {
      for (const row of simulate(plan, cfg).rows) {
        const other = yearFlow(row).lines.find((l) => l.key === "other");
        expect(other, `unexpected "other" of ${Math.round(other?.amount ?? 0)} at age ${row.age} (${row.phase})`).toBeUndefined();
      }
    });
  }

  // The net-worth modal headline (savings + home + property) must equal the
  // chart's rowNetWorth for every year, or it won't match the bar you clicked.
  for (const [label, plan] of Object.entries({ "held-property": vanilla["held-property"], downsize: eventful.downsize, "sell-property": eventful["sell-property"] })) {
    it(`net-worth opening = savings + home + property, matching the chart (${label})`, () => {
      for (const row of simulate(plan, cfg).rows) {
        const f = yearFlow(row);
        const home = Math.max(0, row.homeEquity ?? 0);
        const prop = Math.max(0, (row.propertyEquity ?? 0) + (row.breakdown.propertyProceeds ?? 0));
        expect(Math.abs(f.opening + home + prop - rowNetWorth(row))).toBeLessThan(1);
      }
    });
  }
});
