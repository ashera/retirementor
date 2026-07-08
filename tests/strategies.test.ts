import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, getInvestmentProperties, type PropertyDetail, type RetirementPlan } from "../lib/au/types";
import { buildStrategyCatalog, applyStrategies, resolveValues } from "../lib/au/strategies";

const base = (over: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ currentAge: 50, superBalance: 300_000, salary: 100_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  homeowner: true,
  outsideSuper: 50_000,
  annualOutsideSavings: 0,
  retirementAge: 65,
  spendingMode: "flat",
  targetSpending: 60_000,
  investmentReturn: 6,
  inflation: 2.5,
  lifeExpectancy: 90,
  ...over,
});

const prop = (over: Partial<PropertyDetail> = {}): PropertyDetail => ({
  value: 500_000, growthReal: 2, grossYield: 4, costRatio: 25, loanBalance: 200_000,
  loanRate: 6, purchasePrice: 300_000, strategy: "hold", sellAtAge: 80, ...over,
});

const cardById = (plan: RetirementPlan, id: string) => buildStrategyCatalog(plan).find((c) => c.id === id)!;
const applyOne = (plan: RetirementPlan, id: string, vals: Record<string, number> = {}) => {
  const card = cardById(plan, id);
  return card.apply(plan, resolveValues(card, vals));
};

describe("What-If strategies", () => {
  it("catalogs the levers that apply to the scenario", () => {
    const ids = buildStrategyCatalog(base({ mortgage: { type: "principal_interest", balance: 150_000, interestRate: 6, annualRepayment: 18_000, payoffAge: 72, strategy: "carry" }, investmentProperties: [prop()] })).map((c) => c.id);
    expect(ids).toContain("clear-mortgage");
    expect(ids).toContain("sell-prop-0");
    expect(ids).toContain("retire-later");
    expect(ids).toContain("spend-less");
    expect(ids).toContain("salary-sacrifice");
  });

  it("hides clear-mortgage when there is no mortgage (or it already clears)", () => {
    expect(buildStrategyCatalog(base()).some((c) => c.id === "clear-mortgage")).toBe(false);
    const clearing = base({ mortgage: { type: "interest_only", balance: 150_000, interestRate: 6, annualRepayment: 0, payoffAge: null, strategy: "clear_at_retirement" } });
    expect(buildStrategyCatalog(clearing).some((c) => c.id === "clear-mortgage")).toBe(false);
  });

  it("retire-later pushes the retirement age and grows super at retirement", () => {
    const b = base();
    const later = applyOne(b, "retire-later", { age: 70 });
    expect(later.retirementAge).toBe(70);
    expect(simulate(later, cfg).superAtRetirement).toBeGreaterThan(simulate(b, cfg).superAtRetirement);
  });

  it("spend-less lowers spending and makes the money last longer", () => {
    const b = base({ targetSpending: 90_000 });
    const bRes = simulate(b, cfg);
    const less = applyOne(b, "spend-less", { spend: 60_000 });
    expect(less.targetSpending).toBe(60_000);
    const lRes = simulate(less, cfg);
    const score = (r: ReturnType<typeof simulate>) => (r.lastsToLifeExpectancy ? 999 : r.depletedAge ?? 0);
    expect(score(lRes)).toBeGreaterThanOrEqual(score(bRes));
  });

  it("salary-sacrifice adds concessional contributions for the primary earner", () => {
    const b = base();
    const ss = applyOne(b, "salary-sacrifice", { extra: 15_000 });
    expect(ss.people[0].voluntaryConcessional).toBe(15_000);
    expect(simulate(ss, cfg).superAtRetirement).toBeGreaterThan(simulate(b, cfg).superAtRetirement);
  });

  it("sell-prop switches the named property to sell at the chosen age", () => {
    const b = base({ investmentProperties: [prop({ name: "Beach house" })] });
    const card = cardById(b, "sell-prop-0");
    expect(card.label).toContain("Beach house");
    const sold = card.apply(b, resolveValues(card, { age: 75 }));
    const p0 = getInvestmentProperties(sold)[0];
    expect(p0.strategy).toBe("sell");
    expect(p0.sellAtAge).toBe(75);
  });

  it("composes multiple strategies onto the baseline", () => {
    const b = base({ mortgage: { type: "principal_interest", balance: 150_000, interestRate: 6, annualRepayment: 18_000, payoffAge: 72, strategy: "carry" } });
    const cat = buildStrategyCatalog(b);
    const composed = applyStrategies(b, cat, new Set(["retire-later", "clear-mortgage"]), { "retire-later": { age: 68 } });
    expect(composed.retirementAge).toBe(68);
    expect(composed.mortgage?.strategy).toBe("clear_at_retirement");
  });
});
