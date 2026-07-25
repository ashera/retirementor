import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG } from "../lib/au/config";
import { DEFAULT_PLAN, type LifeEvent, type Person, type RetirementPlan } from "../lib/au/types";

// livingStandardsGrowthPct = 0 so today's $ = nominal and the numbers are clean.
const cfg = { ...DEFAULT_CONFIG, livingStandardsGrowthPct: 0 };
const P = (o: Partial<Person> = {}): Person => ({ currentAge: 60, superBalance: 500_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0, ...o });
const base = (o: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN, household: "single", superMode: "individual", people: [P()],
  homeowner: true, outsideSuper: 0, annualOutsideSavings: 0, retirementAge: 60,
  spendingMode: "flat", targetSpending: 40_000, investmentReturn: 6, inflation: 0, lifeExpectancy: 90, ...o,
});
const rows = (p: RetirementPlan) => simulate(p, cfg).rows;
const rowAt = (p: RetirementPlan, age: number) => rows(p).find((r) => r.age === age)!;
const ev = (o: Partial<LifeEvent> & Pick<LifeEvent, "kind" | "amount" | "atAge">): LifeEvent => ({ id: `${o.kind}-${o.atAge}`, ...o });

describe("Life events — v1 one-off cashflows", () => {
  it("no lifeEvents (or an empty list) leaves the projection unchanged", () => {
    const plain = base({ outsideSuper: 200_000 });
    const empty = base({ outsideSuper: 200_000, lifeEvents: [] });
    // Also an event with a non-positive amount is ignored by getLifeEvents.
    const noop = base({ outsideSuper: 200_000, lifeEvents: [ev({ kind: "income", amount: 0, atAge: 70 })] });
    for (const other of [empty, noop]) {
      const a = rows(plain), b = rows(other);
      expect(b.length).toBe(a.length);
      a.forEach((r, i) => expect(b[i].total).toBeCloseTo(r.total, 6));
    }
  });

  it("a retirement windfall lands in savings untaxed and lifts the balance by ~its amount", () => {
    const plan = base({ outsideSuper: 100_000, lifeEvents: [ev({ kind: "income", amount: 100_000, atAge: 70 })] });
    const noEvent = base({ outsideSuper: 100_000 });
    expect(rowAt(plan, 70).breakdown.eventIncome).toBe(100_000);
    // The balance a year later is higher than the no-event baseline by ~the windfall
    // (net of the extra year's spend, which both plans incur).
    expect(rowAt(plan, 71).total - rowAt(noEvent, 71).total).toBeGreaterThan(90_000);
  });

  it("a one-off retirement expense is an extra draw that steps the balance down", () => {
    const plan = base({ outsideSuper: 300_000, lifeEvents: [ev({ kind: "expense", amount: 60_000, atAge: 72 })] });
    const noEvent = base({ outsideSuper: 300_000 });
    expect(rowAt(plan, 72).breakdown.eventExpense).toBe(60_000);
    // From the expense year on, the plan carries ~60k less (grown) than the baseline.
    expect(rowAt(noEvent, 73).total - rowAt(plan, 73).total).toBeGreaterThan(55_000);
  });

  it("fires exactly once, in the first year the oldest reaches its age", () => {
    const plan = base({ outsideSuper: 200_000, lifeEvents: [ev({ kind: "income", amount: 40_000, atAge: 75 })] });
    const hit = rows(plan).filter((r) => (r.breakdown.eventIncome ?? 0) > 0);
    expect(hit).toHaveLength(1);
    expect(hit[0].age).toBe(75);
    expect(rows(plan).reduce((s, r) => s + (r.breakdown.eventIncome ?? 0), 0)).toBe(40_000);
  });

  it("a windfall in the working years builds savings", () => {
    const working = base({ people: [P({ currentAge: 50, salary: 90_000, superBalance: 200_000 })], retirementAge: 65, outsideSuper: 50_000, annualOutsideSavings: 5_000 });
    const plan = base({ ...working, lifeEvents: [ev({ kind: "income", amount: 80_000, atAge: 55 })] });
    const noEvent = { ...working };
    expect(rowAt(plan, 55).breakdown.eventIncome).toBe(80_000);
    expect(rowAt(plan, 56).total).toBeGreaterThan(rowAt(noEvent, 56).total + 75_000);
  });

  it("a working-years expense is floored at available savings (never drives them negative)", () => {
    // No outside savings to draw on — an expense while working can't spend super.
    const plan = base({ people: [P({ currentAge: 50, salary: 90_000, superBalance: 200_000 })], retirementAge: 65, outsideSuper: 0, annualOutsideSavings: 0, lifeEvents: [ev({ kind: "expense", amount: 50_000, atAge: 55 })] });
    const r = rowAt(plan, 55);
    expect(r.breakdown.eventExpense ?? 0).toBe(0); // nothing available to draw
    expect(r.breakdown.closingOutside).toBeGreaterThanOrEqual(0);
  });
});

describe("Life events — interaction with guardrails", () => {
  it("a one-off expense does not permanently cut flexible spending the following years", () => {
    const g = { outsideSuper: 400_000, guardrails: {}, targetSpending: 45_000, lifeExpectancy: 92 };
    const noEvent = base(g);
    const withSpike = base({ ...g, lifeEvents: [ev({ kind: "expense", amount: 80_000, atAge: 70 })] });
    // The expense year draws more, but the SMILE/flex living spend two years later
    // should be essentially unchanged — the spike is kept out of the rail measure, so
    // it must not read as a permanently higher withdrawal rate and trigger cuts.
    const after = 73;
    expect(rowAt(withSpike, after).breakdown.livingSpend).toBeCloseTo(rowAt(noEvent, after).breakdown.livingSpend, 0);
  });
});
