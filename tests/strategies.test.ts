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

  it("downsize frees up equity at the chosen age (split super vs savings)", () => {
    const b = base({ people: [{ currentAge: 67, superBalance: 200_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }], retirementAge: 67, outsideSuper: 50_000 });
    const card = cardById(b, "downsize");
    expect(card.exclusive).toBe("home");
    // Release $400k at 70: $150k into super (downsizer), $250k into savings.
    const plan = card.apply(b, resolveValues(card, { age: 70, release: 400_000, toSuper: 150_000 }));
    expect(plan.home?.downsize).toEqual({ atAge: 70, release: 400_000, toSuper: 150_000 });

    const before = simulate(plan, cfg).rows.find((r) => r.age === 69)!;
    const after = simulate(plan, cfg).rows.find((r) => r.age === 70)!;
    // Outside jumps by ~$250k and super by ~$150k at the downsize year (before drawdown/growth).
    expect(after.outside - before.outside).toBeGreaterThan(150_000);
    expect(after.totalSuper).toBeGreaterThan(before.totalSuper);
    // More assets → lasts longer than not downsizing.
    const noDownsize = simulate(b, cfg);
    const withDownsize = simulate(plan, cfg);
    const score = (r: ReturnType<typeof simulate>) => (r.lastsToLifeExpectancy ? 999 : r.depletedAge ?? 0);
    expect(score(withDownsize)).toBeGreaterThanOrEqual(score(noDownsize));
  });

  it("downsize is hidden for renters", () => {
    expect(buildStrategyCatalog(base({ homeowner: false })).some((c) => c.id === "downsize")).toBe(false);
  });

  it("sell-and-rent releases equity, adds rent, and switches to non-homeowner thresholds", () => {
    const b = base({ people: [{ currentAge: 67, superBalance: 150_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }], retirementAge: 67, outsideSuper: 20_000, targetSpending: 45_000 });
    const card = cardById(b, "sell-and-rent");
    expect(card.exclusive).toBe("home");
    const plan = card.apply(b, resolveValues(card, { age: 70, release: 800_000, rent: 30_000 }));
    expect(plan.home?.sellAndRent).toEqual({ atAge: 70, release: 800_000, rentPerYear: 30_000 });

    const rows = simulate(plan, cfg).rows;
    const at69 = rows.find((r) => r.age === 69)!;
    const at70 = rows.find((r) => r.age === 70)!;
    // Equity lands in savings at 70.
    expect(at70.outside - at69.outside).toBeGreaterThan(600_000);
    // Rent lifts the spending need from age 70 on.
    expect(at70.spending).toBeGreaterThan(at69.spending + 20_000);
  });

  it("selling the home stops the mortgage cost from the sale year", () => {
    const b = base({
      people: [{ currentAge: 67, superBalance: 400_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
      retirementAge: 67,
      mortgage: { type: "interest_only", balance: 200_000, interestRate: 6, annualRepayment: 0, payoffAge: null, strategy: "carry" },
    });
    const card = cardById(b, "sell-and-rent");
    const plan = card.apply(b, resolveValues(card, { age: 70, release: 600_000, rent: 0 }));
    const rows = simulate(plan, cfg).rows;
    // Before the sale the interest-only loan is an ongoing cost; after, it's gone.
    expect(rows.find((r) => r.age === 69)!.breakdown.mortgageCost).toBeGreaterThan(0);
    expect(rows.find((r) => r.age === 71)!.breakdown.mortgageCost).toBe(0);
  });

  it("composes multiple strategies onto the baseline", () => {
    const b = base({ mortgage: { type: "principal_interest", balance: 150_000, interestRate: 6, annualRepayment: 18_000, payoffAge: 72, strategy: "carry" } });
    const cat = buildStrategyCatalog(b);
    const composed = applyStrategies(b, cat, new Set(["retire-later", "clear-mortgage"]), { "retire-later": { age: 68 } });
    expect(composed.retirementAge).toBe(68);
    expect(composed.mortgage?.strategy).toBe("clear_at_retirement");
  });
});
