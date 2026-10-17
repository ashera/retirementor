import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan, type IncomeStream } from "../lib/au/types";

const cfg = { ...DEFAULT_CONFIG, livingStandardsGrowthPct: 0 };
const base = (streams: IncomeStream[], o: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN, household: "single", superMode: "individual",
  people: [{ ...DEFAULT_PLAN.people[0], currentAge: 60, superBalance: 250_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  homeowner: true, outsideSuper: 100_000, annualOutsideSavings: 0, retirementAge: 60,
  spendingMode: "flat", targetSpending: 45_000, investmentReturn: 6, inflation: 2.5, lifeExpectancy: 90,
  incomeStreams: streams, ...o,
});
const rowAt = (p: RetirementPlan, age: number) => simulate(p, cfg).rows.find((r) => r.age === age)!;
const S = (o: Partial<IncomeStream>): IncomeStream => ({ id: "s", perYear: 20_000, fromAge: 60, indexed: true, taxable: true, assessable: true, ...o });

describe("Income streams (DB pension / annuity / foreign pension)", () => {
  it("indexed → constant real income; non-indexed → erodes with CPI", () => {
    const indexed = base([S({ indexed: true, taxable: false })]);
    const nominal = base([S({ indexed: false, taxable: false })]);
    expect(rowAt(indexed, 60).incomeStream).toBeCloseTo(20_000, -1);
    expect(rowAt(indexed, 80).incomeStream).toBeCloseTo(20_000, -1); // still 20k in real terms
    const eroded = rowAt(nominal, 80).incomeStream; // 20k nominal, deflated 20yrs @2.5% ≈ 12,206
    expect(eroded).toBeGreaterThan(11_500);
    expect(eroded).toBeLessThan(12_900);
  });

  it("an assessable stream tapers the Age Pension; a non-assessable one doesn't", () => {
    const assessable = base([S({ perYear: 30_000, assessable: true, taxable: false })]);
    const exempt = base([S({ perYear: 30_000, assessable: false, taxable: false })]);
    expect(rowAt(assessable, 67).agePension).toBeLessThan(rowAt(exempt, 67).agePension - 5_000);
  });

  it("a taxable stream is taxed pre-67; SAPTO makes a modest one tax-free at 67+", () => {
    const taxable = base([S({ perYear: 30_000, taxable: true, assessable: false })]);
    expect(rowAt(taxable, 64).breakdown.incomeStreamTax ?? 0).toBeGreaterThan(500); // resident scale before Age-Pension age
    expect(rowAt(taxable, 70).breakdown.incomeStreamTax ?? 0).toBeCloseTo(0, 0); // SAPTO ≈ $35k tax-free single
    expect(rowAt(base([S({ perYear: 30_000, taxable: false, assessable: false })]), 64).breakdown.incomeStreamTax ?? 0).toBe(0);
  });

  it("a stream offsets the drawdown and makes a shaky plan last", () => {
    const withStream = base([S({ perYear: 30_000 })]);
    const without = base([]);
    expect(simulate(withStream, cfg).depletedAge).toBeNull(); // now lasts
    expect(simulate(without, cfg).depletedAge).not.toBeNull(); // depletes without it
    const drawn = (p: RetirementPlan) => rowAt(p, 70).superDrawn + rowAt(p, 70).outsideDrawn;
    expect(drawn(withStream)).toBeLessThan(drawn(without)); // less pulled from savings
  });

  it("respects the from/until age bounds (untilAge exclusive)", () => {
    const bounded = base([S({ perYear: 20_000, fromAge: 65, untilAge: 75, taxable: false, assessable: false })]);
    expect(rowAt(bounded, 64).incomeStream).toBe(0);
    expect(rowAt(bounded, 70).incomeStream).toBeCloseTo(20_000, -1);
    expect(rowAt(bounded, 75).incomeStream).toBe(0);
  });

  it("while WORKING: a stream is spent by default, but reinvested when flagged", () => {
    // Someone still working (55, retires at 65) with a stream running through the working
    // years. By default the stream funds living (no effect on the pool); flagged to
    // reinvest, its net builds the outside pool, so there's more at retirement.
    const working = (reinvest: boolean) => base([S({ perYear: 40_000, fromAge: 55, taxable: true, assessable: false, reinvestWhileWorking: reinvest })], {
      people: [{ ...DEFAULT_PLAN.people[0], currentAge: 55, superBalance: 250_000, salary: 80_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
      retirementAge: 65, outsideSuper: 50_000, annualOutsideSavings: 0,
    });
    const spent = simulate(working(false), cfg);
    const saved = simulate(working(true), cfg);
    // Same super either way (stream doesn't touch super); the reinvested case has far more
    // outside. The "spent" pool is just the opening $50k grown (no stream added); "saved"
    // adds ~10 years of reinvested net stream on top.
    const outAtRet = (r: ReturnType<typeof simulate>) => r.totalAtRetirement - r.superAtRetirement;
    expect(spent.superAtRetirement).toBeCloseTo(saved.superAtRetirement, -1);
    expect(outAtRet(spent)).toBeLessThan(100_000); // opening $50k grown only
    expect(outAtRet(saved)).toBeGreaterThan(outAtRet(spent) + 150_000); // 10 yrs of reinvested net stream
  });
});
