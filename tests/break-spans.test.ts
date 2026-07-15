import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";
import { breakSpans, breakSpanLabel } from "../lib/au/breakSpans";

const worker = (careerBreaks: RetirementPlan["careerBreaks"]): RetirementPlan => ({
  ...DEFAULT_PLAN, household: "single",
  people: [{ currentAge: 45, superBalance: 200_000, salary: 100_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  homeowner: true, outsideSuper: 150_000, annualOutsideSavings: 10_000,
  retirementAge: 65, spendingMode: "flat", targetSpending: 60_000,
  investmentReturn: 7, inflation: 2.5, lifeExpectancy: 90, careerBreaks,
});

describe("breakSpans", () => {
  it("returns the full contiguous span of a multi-year break", () => {
    const rows = simulate(worker([{ atAge: 50, years: 2, spendFromSavings: 40_000, who: 0 }]), cfg).rows;
    expect(breakSpans(rows)).toEqual([{ from: 50, to: 51 }]);
    expect(breakSpanLabel({ from: 50, to: 51 })).toBe("Gap years 50–51");
  });

  it("labels a one-year break in the singular", () => {
    const rows = simulate(worker([{ atAge: 52, years: 1, spendFromSavings: 30_000, who: 0 }]), cfg).rows;
    const spans = breakSpans(rows);
    expect(spans).toEqual([{ from: 52, to: 52 }]);
    expect(breakSpanLabel(spans[0])).toBe("Gap year 52");
  });

  it("returns nothing when there's no break", () => {
    expect(breakSpans(simulate(worker(undefined), cfg).rows)).toEqual([]);
  });
});
