import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan, type IncomeStream } from "../lib/au/types";
import { nonResidentIncomeTax, residentIncomeTax } from "../lib/au/tax";

const cfg = { ...DEFAULT_CONFIG, livingStandardsGrowthPct: 0 };
const base = (o: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN, household: "single", superMode: "individual",
  people: [{ ...DEFAULT_PLAN.people[0], currentAge: 60, superBalance: 250_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  homeowner: true, outsideSuper: 100_000, annualOutsideSavings: 0, retirementAge: 60,
  spendingMode: "flat", targetSpending: 45_000, investmentReturn: 7, inflation: 2.5, lifeExpectancy: 90, ...o,
});
const S = (o: Partial<IncomeStream>): IncomeStream => ({ id: "s", perYear: 16_500, fromAge: 60, indexed: true, taxable: true, assessable: true, ...o });
const rowAt = (p: RetirementPlan, age: number) => simulate(p, cfg).rows.find((r) => r.age === age)!;

describe("non-resident tax scale", () => {
  it("no tax-free threshold — taxed from the first dollar at 30%", () => {
    expect(nonResidentIncomeTax(0)).toBe(0);
    expect(nonResidentIncomeTax(10_000)).toBeCloseTo(3_000, 0); // 30% from $1 (a resident pays $0 here)
    expect(residentIncomeTax(10_000)).toBe(0);
    expect(nonResidentIncomeTax(135_000)).toBeCloseTo(40_500, 0);
    expect(nonResidentIncomeTax(190_000)).toBeCloseTo(60_850, 0);
  });
});

describe("non-resident retirement plan", () => {
  it("an AU-sourced taxable stream is taxed at 30% flat — no SAPTO relief at 67+", () => {
    const nr = base({ taxResidency: "non-resident", incomeStreams: [S({ perYear: 16_500, foreignSourced: false })] });
    const res = base({ taxResidency: "resident", incomeStreams: [S({ perYear: 16_500, foreignSourced: false })] });
    expect(rowAt(nr, 70).breakdown.incomeStreamTax ?? 0).toBeCloseTo(4_950, -1); // 30% × 16,500, even at 70
    expect(rowAt(res, 70).breakdown.incomeStreamTax ?? 0).toBeCloseTo(0, 0); // SAPTO makes it tax-free for a resident
  });

  it("a foreign-sourced stream is outside AU tax AND the income test for a non-resident", () => {
    const foreign = base({ taxResidency: "non-resident", incomeStreams: [S({ perYear: 30_000, foreignSourced: true })] });
    expect(rowAt(foreign, 64).breakdown.incomeStreamTax ?? 0).toBe(0); // not taxed by Australia
    expect(rowAt(foreign, 64).incomeStream).toBeCloseTo(30_000, -1); // full amount offsets drawdown
    // a resident IS taxed on the same foreign income (worldwide income)
    const resident = base({ taxResidency: "resident", incomeStreams: [S({ perYear: 30_000, foreignSourced: true })] });
    expect(rowAt(resident, 64).breakdown.incomeStreamTax ?? 0).toBeGreaterThan(500);
  });

  it("the Age Pension is not claimable from abroad by default, restored with the override", () => {
    const nr = base({ taxResidency: "non-resident" });
    const withOverride = base({ taxResidency: "non-resident", claimAgePensionAbroad: true });
    const resident = base({ taxResidency: "resident" });
    expect(rowAt(nr, 70).agePension).toBe(0);
    expect(rowAt(withOverride, 70).agePension).toBeGreaterThan(1_000);
    expect(rowAt(resident, 70).agePension).toBeGreaterThan(1_000);
  });

  it("defaults to resident — non-resident flag off is byte-identical to a plain plan", () => {
    const plain = base({ incomeStreams: [S({ perYear: 16_500 })] });
    const explicit = base({ taxResidency: "resident", incomeStreams: [S({ perYear: 16_500 })] });
    expect(simulate(explicit, cfg).depletedAge).toBe(simulate(plain, cfg).depletedAge);
    expect(rowAt(explicit, 75).incomeStream).toBeCloseTo(rowAt(plain, 75).incomeStream, 0);
  });
});
