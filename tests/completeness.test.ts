import { describe, it, expect } from "vitest";
import { planCompleteness } from "../lib/au/completeness";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";

const single = (over: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ currentAge: 40, superBalance: 150_000, salary: 90_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  outsideSuper: 0,
  annualOutsideSavings: 0,
  investmentProperty: undefined,
  retirementAge: 67,
  spendingMode: "flat",
  targetSpending: 50_000,
  answered: undefined,
  ...over,
});

describe("planCompleteness", () => {
  it("core done, no enrichments answered → Working model, optionals incomplete", () => {
    const c = planCompleteness(single());
    expect(c.byKey.household.complete).toBe(true);
    expect(c.byKey.you.complete).toBe(true);
    expect(c.byKey.goal.complete).toBe(true);
    expect(c.byKey.contributions.complete).toBe(false);
    expect(c.byKey.outside.complete).toBe(false);
    expect(c.byKey.property.complete).toBe(false);
    expect(c.tier).toBe("Working model");
    expect(c.pct).toBe(Math.round((3 / 6) * 100)); // 3 core of 6 sections
    expect(c.gapKey).toBe("contributions");
  });

  it("optional counts as complete via data OR an explicit answer", () => {
    expect(planCompleteness(single({ outsideSuper: 50_000 })).byKey.outside.complete).toBe(true);
    expect(planCompleteness(single({ answered: { outside: true } })).byKey.outside.complete).toBe(true);
    expect(planCompleteness(single({ answered: { contributions: true } })).byKey.contributions.complete).toBe(true);
  });

  it("all sections answered → 100% Complete picture", () => {
    const c = planCompleteness(single({ answered: { contributions: true, outside: true, property: true } }));
    expect(c.pct).toBe(100);
    expect(c.tier).toBe("Complete picture");
    expect(c.gapKey).toBeNull();
  });

  it("missing core detail → Sketch and a core gap", () => {
    const c = planCompleteness(single({ people: [{ currentAge: 40, superBalance: 0, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }] }));
    expect(c.byKey.you.complete).toBe(false);
    expect(c.tier).toBe("Sketch");
    expect(c.gapKey).toBe("you");
  });

  it("couples add a partner section", () => {
    const c = planCompleteness(single({
      household: "couple",
      people: [
        { currentAge: 40, superBalance: 150_000, salary: 90_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
        { currentAge: 38, superBalance: 100_000, salary: 70_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
      ],
    }));
    expect(c.total).toBe(7);
    expect(c.byKey.partner.complete).toBe(true);
  });
});
