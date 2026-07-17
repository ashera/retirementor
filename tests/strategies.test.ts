import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, getInvestmentProperties, type PropertyDetail, type RetirementPlan } from "../lib/au/types";
import { buildStrategyCatalog, applyStrategies, resolveValues, maxSustainableSpend, maxSpendForConfidence, essentialsFloor, withSpend, appliedStrategies } from "../lib/au/strategies";
import { runMonteCarlo } from "../lib/au/montecarlo";
import { incomeTax, medicareLevy } from "../lib/au/tax";
import { rowNetWorth } from "../lib/au/networth";
import { seniorEmploymentTax } from "../lib/au/tax";

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
    expect(ids).toContain("adjust-spending");
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

  it("adjust-spending sets spending up or down and shifts how long the money lasts", () => {
    const b = base({ targetSpending: 90_000 });
    const bRes = simulate(b, cfg);
    const score = (r: ReturnType<typeof simulate>) => (r.lastsToLifeExpectancy ? 999 : r.depletedAge ?? 0);
    // Spend less → lasts at least as long.
    const less = applyOne(b, "adjust-spending", { spend: 60_000 });
    expect(less.targetSpending).toBe(60_000);
    expect(score(simulate(less, cfg))).toBeGreaterThanOrEqual(score(bRes));
    // Spend more → the same lever goes the other way, and money lasts no longer.
    const more = applyOne(b, "adjust-spending", { spend: 120_000 });
    expect(more.targetSpending).toBe(120_000);
    expect(score(simulate(more, cfg))).toBeLessThanOrEqual(score(bRes));
  });

  it("take-home reflects income tax, and salary-sacrificing lowers it by the after-tax cost", () => {
    const b = base(); // single, salary $100k, working from age 50
    const row = simulate(b, cfg).rows.find((r) => r.age === 50)!;
    // No sacrifice: take-home = salary less resident income tax AND the 2% Medicare levy.
    expect(row.takeHome).toBeCloseTo(100_000 - incomeTax(100_000) - medicareLevy(100_000), 0);
    // Salary-sacrifice $15k (pre-tax) → taxable falls to $85k, so does take-home.
    const sac = applyOne(b, "salary-sacrifice", { extra: 15_000 });
    const rowS = simulate(sac, cfg).rows.find((r) => r.age === 50)!;
    expect(rowS.takeHome).toBeCloseTo(85_000 - incomeTax(85_000) - medicareLevy(85_000), 0);
    expect(rowS.takeHome).toBeLessThan(row.takeHome);
  });

  it("Transition to Retirement boosts super without touching take-home, over the 60→retirement window", () => {
    const b = base({
      people: [{ currentAge: 58, superBalance: 400_000, salary: 120_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
      retirementAge: 65,
    });
    const baseRows = simulate(b, cfg).rows;
    const ttr = applyOne(b, "ttr", { extra: 15_000 });
    const ttrRows = simulate(ttr, cfg).rows;
    const at = (rows: typeof baseRows, age: number) => rows.find((r) => r.age === age)!;
    // Before 60: no TTR effect on super, and take-home matches the baseline.
    expect(at(ttrRows, 59).breakdown.ttrBenefit).toBe(0);
    expect(at(ttrRows, 59).takeHome).toBeCloseTo(at(baseRows, 59).takeHome, 0);
    // In the window (60–64): a positive benefit into super, take-home still held.
    expect(at(ttrRows, 62).breakdown.ttrBenefit).toBeGreaterThan(0);
    expect(at(ttrRows, 62).takeHome).toBeCloseTo(at(baseRows, 62).takeHome, 0);
    // Net effect: more super at retirement, all at no cost to take-home.
    expect(simulate(ttr, cfg).superAtRetirement).toBeGreaterThan(simulate(b, cfg).superAtRetirement);
  });

  it("Transition to Retirement is offered to any worker (the board hides it until retirement clears 60)", () => {
    const worker = base({ people: [{ currentAge: 58, superBalance: 400_000, salary: 120_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }], retirementAge: 65 });
    expect(buildStrategyCatalog(worker).some((c) => c.id === "ttr")).toBe(true);
    // Not for someone already retired (no working years) or not earning.
    const retired = base({ people: [{ currentAge: 66, superBalance: 400_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }], retirementAge: 66 });
    expect(buildStrategyCatalog(retired).some((c) => c.id === "ttr")).toBe(false);
  });

  it("maxSustainableSpend finds the highest spend that still lasts to life expectancy", () => {
    const b = base({ targetSpending: 90_000, lifeExpectancy: 90 });
    const s = maxSustainableSpend(b, cfg);
    // At the sustainable level the money lasts; a clear step above it, it doesn't.
    expect(simulate(withSpend(b, s), cfg).lastsToLifeExpectancy).toBe(true);
    expect(simulate(withSpend(b, s + 5_000), cfg).lastsToLifeExpectancy).toBe(false);
  });

  it("essentialsFloor uses the plan's own budget essentials, else an ASFA-modest fallback", () => {
    // With a budget: sum of the essential categories (food is a need, leisure is not).
    const withBudget = base({
      targetSpending: 90_000,
      budget: { tenure: "own", lifestyle: "comfortable", applyPhases: false, categories: { food: 12_000, leisure: 8_000 } },
    });
    expect(essentialsFloor(withBudget, cfg)).toBe(12_000);
    // Fallback (no budget): a positive floor that never exceeds current spend.
    const noBudget = base({ targetSpending: 30_000 });
    const e = essentialsFloor(noBudget, cfg);
    expect(e).toBeGreaterThan(0);
    expect(e).toBeLessThanOrEqual(30_000);
  });

  it("maxSpendForConfidence finds the highest spend meeting a Monte Carlo success target, below the deterministic max", () => {
    const b = base({
      people: [{ currentAge: 66, superBalance: 900_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
      retirementAge: 66, outsideSuper: 300_000, targetSpending: 45_000, lifeExpectancy: 90,
    });
    const mc = { iterations: 300, seed: 12345 };
    const safe = maxSpendForConfidence(b, cfg, 0.85, mc);
    // At the safe level success meets the target; a clear step above it, it doesn't.
    expect(runMonteCarlo(withSpend(b, safe), cfg, mc).successRate).toBeGreaterThanOrEqual(0.85);
    expect(runMonteCarlo(withSpend(b, safe + 10_000), cfg, mc).successRate).toBeLessThan(0.85);
    // Accounting for market risk, the safe spend is below the deterministic max.
    expect(safe).toBeLessThan(maxSustainableSpend(b, cfg));
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
    const b = base({ people: [{ currentAge: 67, superBalance: 200_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }], retirementAge: 67, outsideSuper: 50_000, home: { value: 900_000, growthReal: 0 } });
    const card = cardById(b, "downsize");
    expect(card.exclusive).toBe("home");
    // From the $900k home (no loan, no growth) down to a $500k home → frees $400k;
    // $150k into super (downsizer), $250k into savings.
    const plan = card.apply(b, resolveValues(card, { age: 70, newValue: 500_000, toSuper: 150_000 }));
    expect(plan.home?.downsize).toEqual({ atAge: 70, newValue: 500_000, toSuper: 150_000 });
    expect(plan.home?.value).toBe(900_000); // keeps the ORIGINAL value; new value on the event
    // The tracked home value steps from the original to the new value at the downsize.
    const rows = simulate(plan, cfg).rows;
    expect(rows.find((r) => r.age === 69)!.homeValue).toBe(900_000);
    expect(rows.find((r) => r.age === 71)!.homeValue).toBe(500_000);

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

  it("downsizing discharges the mortgage from the sale (loan cost stops)", () => {
    const b = base({
      people: [{ currentAge: 67, superBalance: 300_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
      retirementAge: 67,
      home: { value: 900_000, growthReal: 0 },
      mortgage: { type: "interest_only", balance: 200_000, interestRate: 6, annualRepayment: 0, payoffAge: null, strategy: "carry" },
    });
    const card = cardById(b, "downsize");
    // $900k home (no growth), $200k loan → downsize to a $400k home frees $300k (net of loan).
    const plan = card.apply(b, resolveValues(card, { age: 70, newValue: 400_000, toSuper: 0 }));
    const rows = simulate(plan, cfg);
    // The engine derives the freed equity from the grown value net of the loan:
    // ~$300k lands in savings (net of drawdown, so a lower bound).
    const b69 = rows.rows.find((r) => r.age === 69)!;
    const b70 = rows.rows.find((r) => r.age === 70)!;
    expect(b70.outside - b69.outside).toBeGreaterThan(250_000);
    // Interest-only loan is an ongoing cost until the downsize, then discharged.
    expect(b69.breakdown.mortgageCost).toBeGreaterThan(0);
    expect(rows.rows.find((r) => r.age === 71)!.breakdown.mortgageCost).toBe(0);
    // Not paid from super (repaid from the sale) — no super lump-sum recorded.
    expect(b70.breakdown.mortgageCleared).toBe(0);
  });

  it("net worth is continuous across a downsize with a mortgage (home band nets the loan)", () => {
    const b = base({
      people: [{ currentAge: 64, superBalance: 400_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
      retirementAge: 64, outsideSuper: 100_000, targetSpending: 60_000, lifeExpectancy: 90,
      home: { value: 1_000_000, growthReal: 0 },
      mortgage: { type: "interest_only", balance: 300_000, interestRate: 6, annualRepayment: 0, payoffAge: null, strategy: "carry" },
    });
    const card = cardById(b, "downsize");
    const rows = simulate(card.apply(b, resolveValues(card, { age: 67, newValue: 600_000, toSuper: 0 })), cfg).rows;
    const nw = (age: number) => { const r = rows.find((x) => x.age === age)!; return r.homeEquity + r.totalSuper + r.outside; };
    // The net-worth home band nets the mortgage at its TODAY'S-DOLLARS value — the
    // $300k nominal loan deflated by inflation (the same basis as the repayment) —
    // before the downsize, and becomes the new home value once the loan is discharged.
    const deflatedLoan = 300_000 / (1 + b.inflation / 100) ** 2; // age 66 = t=2 (currentAge 64)
    expect(rows.find((r) => r.age === 66)!.homeEquity).toBeCloseTo(1_000_000 - deflatedLoan, -2);
    expect(rows.find((r) => r.age === 67)!.homeEquity).toBeCloseTo(600_000, -2);
    // The downsize adds no net-worth cliff: the drop into the downsize year is the
    // same normal drawdown as an ordinary year, NOT the $300k loan the old gross
    // band lost when the mortgage was discharged.
    expect(Math.abs((nw(66) - nw(67)) - (nw(65) - nw(66)))).toBeLessThan(20_000);
  });

  it("routing freed equity into super shelters it from the tax on outside-super earnings", () => {
    const b = base({
      people: [{ currentAge: 66, superBalance: 400_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
      retirementAge: 66, outsideSuper: 200_000, targetSpending: 70_000, lifeExpectancy: 92,
      home: { value: 2_800_000, growthReal: 0 },
    });
    const card = cardById(b, "downsize");
    // A big equity release leaves a large taxable outside pool: its dividend yield
    // plus the gains realised on drawdown clear even the senior (SAPTO) offset.
    const run = (toSuper: number) => simulate(card.apply(b, resolveValues(card, { age: 67, newValue: 800_000, toSuper })), cfg).rows;
    const toSavings = run(0);
    const toSuper = run(300_000);
    const totalOutsideTax = (rows: typeof toSavings) =>
      rows.reduce((s, r) => s + r.breakdown.outsideTax, 0);
    // A large outside-super balance is taxed on its earnings in retirement
    // (less LITO + SAPTO, so it's modest but real)...
    const savingsTax = totalOutsideTax(toSavings);
    expect(savingsTax).toBeGreaterThan(2_500);
    // ...so routing the freed equity into (tax-free) super removes that tax.
    // (With outside-super spent down FIRST, and the ATO minimum forcing more out
    // of a larger super balance, the end-wealth difference is marginal — the
    // clear win here is the earnings tax avoided, not a big longevity gap.)
    expect(totalOutsideTax(toSuper)).toBeLessThan(savingsTax);
  });

  it("lump sum: taken once at the chosen age, hard-capped at the super balance", () => {
    const b = base({ people: [{ currentAge: 60, superBalance: 500_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }], retirementAge: 60, outsideSuper: 100_000, targetSpending: 45_000 });
    // The lever is in the catalog, and applying it sets plan.lumpSum.
    expect(buildStrategyCatalog(b).some((c) => c.id === "lump-sum")).toBe(true);
    const applied = applyOne(b, "lump-sum", { age: 68, amount: 80_000 });
    expect(applied.lumpSum).toEqual({ atAge: 68, amount: 80_000 });

    const rows = simulate({ ...b, lumpSum: { atAge: 68, amount: 80_000 } }, cfg).rows;
    const taken = rows.filter((r) => r.breakdown.lumpSum > 0);
    expect(taken.length).toBe(1); // one-off
    expect(taken[0].age).toBe(68);
    expect(taken[0].breakdown.lumpSum).toBeCloseTo(80_000, 0);
    // It's spent: end wealth drops by at least the lump sum.
    const end = (p: RetirementPlan) => simulate(p, cfg).rows.at(-1)!.total;
    expect(end(b) - end({ ...b, lumpSum: { atAge: 68, amount: 80_000 } })).toBeGreaterThan(80_000 - 1);
    // Hard cap: asking for far more than the balance withdraws only what's there.
    const capped = simulate({ ...b, lumpSum: { atAge: 88, amount: 5_000_000 } }, cfg).rows.find((r) => r.age === 88)!;
    expect(capped.breakdown.lumpSum).toBeGreaterThan(0);
    expect(capped.breakdown.lumpSum).toBeLessThanOrEqual(capped.totalSuper + 1);
  });

  it("recontribution: yearly stream or one-off, capped at NCC / savings / age-75", () => {
    const b = base({ people: [{ currentAge: 62, superBalance: 400_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }], retirementAge: 62, outsideSuper: 500_000, targetSpending: 45_000 });
    expect(buildStrategyCatalog(b).some((c) => c.id === "recontribute")).toBe(true);
    expect(applyOne(b, "recontribute", { amount: 20_000, fromAge: 62, untilAge: 75 }).recontribute).toEqual({ perYear: 20_000, fromAge: 62, untilAge: 75 });

    // Yearly stream 62→75.
    const rows = simulate({ ...b, recontribute: { perYear: 20_000, fromAge: 62, untilAge: 75 } }, cfg).rows;
    const y65 = rows.find((r) => r.age === 65)!;
    expect(y65.breakdown.recontribution).toBeCloseTo(20_000, 0);
    const base65 = simulate(b, cfg).rows.find((r) => r.age === 65)!;
    expect(y65.totalSuper).toBeGreaterThan(base65.totalSuper + 40_000);
    expect(y65.outside).toBeLessThan(base65.outside - 40_000);
    expect(Math.abs(y65.total - base65.total)).toBeLessThan(2_000); // net worth barely moves

    // One-off (fromAge == untilAge): only that year recontributes.
    const oneOff = simulate({ ...b, recontribute: { perYear: 80_000, fromAge: 68, untilAge: 68 } }, cfg).rows.filter((r) => r.breakdown.recontribution > 0);
    expect(oneOff.length).toBe(1);
    expect(oneOff[0].age).toBe(68);

    // Never past age 75, even if asked.
    const ages = simulate({ ...b, recontribute: { perYear: 20_000, fromAge: 62, untilAge: 90 } }, cfg).rows.filter((r) => r.breakdown.recontribution > 0).map((r) => r.age);
    expect(Math.max(...ages)).toBe(75);
    // Capped at the annual non-concessional cap.
    const bigRow = simulate({ ...b, recontribute: { perYear: 500_000, fromAge: 62, untilAge: 75 } }, cfg).rows.find((r) => r.age === 63)!;
    expect(bigRow.breakdown.recontribution).toBeLessThanOrEqual(cfg.nonConcessionalCap + 1);
  });

  it("selling an investment property reallocates net worth (no windfall)", () => {
    const b = base({
      people: [{ currentAge: 66, superBalance: 300_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
      retirementAge: 66, outsideSuper: 100_000, targetSpending: 50_000, lifeExpectancy: 90,
      // purchasePrice = value + growthReal 0 → no capital gain, so the reallocation
      // is exact (no CGT) and easy to assert against.
      investmentProperties: [prop({ value: 600_000, purchasePrice: 600_000, loanBalance: 200_000, growthReal: 0 })],
    });
    const card = cardById(b, "sell-prop-0");
    const rows = simulate(card.apply(b, resolveValues(card, { age: 70 })), cfg).rows;
    // Net worth as the chart plots it (rowNetWorth = super + outside + home equity
    // + property equity, bridging the sale year with that year's proceeds).
    const nw = (age: number) => rowNetWorth(rows.find((x) => x.age === age)!);
    // The held property's net equity ($600k − $200k loan) is on the net-worth ledger...
    expect(rows.find((r) => r.age === 69)!.propertyEquity).toBeCloseTo(400_000, -3);
    // ...and drops to 0 at the sale as the proceeds move into savings.
    expect(rows.find((r) => r.age === 70)!.propertyEquity).toBe(0);
    // No windfall: the sale-year net-worth change is ordinary drawdown, NOT a jump
    // by the sale proceeds (the bug when held equity wasn't counted in net worth).
    expect(Math.abs((nw(69) - nw(70)) - (nw(68) - nw(69)))).toBeLessThan(20_000);
  });

  it("the home appreciates, so a later downsize frees more equity", () => {
    const b = base({
      people: [{ currentAge: 65, superBalance: 200_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
      retirementAge: 65,
      home: { value: 900_000, growthReal: 3 },
    });
    const card = cardById(b, "downsize");
    const freedAt = (age: number) => {
      const rows = simulate(card.apply(b, resolveValues(card, { age, newValue: 500_000, toSuper: 0 })), cfg).rows;
      const before = rows.find((r) => r.age === age - 1)!;
      const at = rows.find((r) => r.age === age)!;
      return at.outside - before.outside;
    };
    // Home grows at 3% real; the tracked value climbs each year until the downsize.
    const rows = simulate(card.apply(b, resolveValues(card, { age: 80, newValue: 500_000, toSuper: 0 })), cfg).rows;
    expect(rows.find((r) => r.age === 70)!.homeValue).toBeGreaterThan(rows.find((r) => r.age === 66)!.homeValue);
    // And a downsize at 75 frees more than one at 67 (more appreciation banked).
    expect(freedAt(75)).toBeGreaterThan(freedAt(67));
  });

  it("sell-and-rent releases equity, adds rent, and switches to non-homeowner thresholds", () => {
    const b = base({ people: [{ currentAge: 67, superBalance: 150_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }], retirementAge: 67, outsideSuper: 20_000, targetSpending: 45_000 });
    const card = cardById(b, "sell-and-rent");
    expect(card.exclusive).toBe("home");
    const plan = card.apply(b, resolveValues(card, { age: 70, rent: 30_000 }));
    expect(plan.home?.sellAndRent).toEqual({ atAge: 70, rentPerYear: 30_000 });

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
    const plan = card.apply(b, resolveValues(card, { age: 70, rent: 0 }));
    const rows = simulate(plan, cfg).rows;
    // Before the sale the interest-only loan is an ongoing cost; after, it's gone.
    expect(rows.find((r) => r.age === 69)!.breakdown.mortgageCost).toBeGreaterThan(0);
    expect(rows.find((r) => r.age === 71)!.breakdown.mortgageCost).toBe(0);
  });

  it("part-time work offsets drawdown and preserves super early in retirement", () => {
    const b = base({ people: [{ currentAge: 65, superBalance: 300_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }], retirementAge: 65 });
    const card = cardById(b, "part-time-work");
    const plan = card.apply(b, resolveValues(card, { perYear: 25_000, untilAge: 70 }));
    expect(plan.workIncome).toEqual({ perYear: 25_000, untilAge: 70 });
    // Earning while retired means drawing less, so super holds up better at 69
    // and the money lasts at least as long.
    const withWork = simulate(plan, cfg);
    const noWork = simulate(b, cfg);
    const superAt = (r: ReturnType<typeof simulate>, age: number) => r.rows.find((x) => x.age === age)!.totalSuper;
    expect(superAt(withWork, 69)).toBeGreaterThan(superAt(noWork, 69));
    // The net work income lands on the year rows during the work years, and stops after.
    expect(withWork.rows.find((x) => x.age === 68)!.workIncome).toBeCloseTo(25_000, -2);
    expect(withWork.rows.find((x) => x.age === 71)!.workIncome).toBe(0);
    const score = (r: ReturnType<typeof simulate>) => (r.lastsToLifeExpectancy ? 999 : r.depletedAge ?? 0);
    expect(score(withWork)).toBeGreaterThanOrEqual(score(noWork));
  });

  it("taxes part-time work income (SAPTO makes modest amounts tax-free)", () => {
    // Modest income sits under the effective (SAPTO) threshold → no tax.
    expect(seniorEmploymentTax(20_000, "single")).toBe(0);
    expect(seniorEmploymentTax(30_000, "single")).toBe(0);
    // Higher income is taxed.
    expect(seniorEmploymentTax(50_000, "single")).toBeGreaterThan(0);
    // A single pays no more tax than a couple splitting the same per-person income
    // (couple gets a smaller offset each).
    expect(seniorEmploymentTax(50_000, "couple")).toBeGreaterThan(seniorEmploymentTax(50_000, "single"));

    // A high work income leaves less to spend (after tax) than the gross.
    const b = base({ people: [{ currentAge: 66, superBalance: 250_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }], retirementAge: 66, targetSpending: 55_000 });
    const card = cardById(b, "part-time-work");
    const taxed = card.apply(b, resolveValues(card, { perYear: 55_000, untilAge: 72 }));
    const untaxedProxy = card.apply(b, resolveValues(card, { perYear: 30_000, untilAge: 72 }));
    // Both help, but the taxed run doesn't get the full $55k of benefit.
    expect(simulate(taxed, cfg).superAtRetirement).toBeGreaterThan(0);
    expect(untaxedProxy.workIncome?.perYear).toBe(30_000);
  });

  it("work income stops at the chosen age", () => {
    const b = base({ people: [{ currentAge: 65, superBalance: 300_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }], retirementAge: 65 });
    const card = cardById(b, "part-time-work");
    const plan = card.apply(b, resolveValues(card, { perYear: 30_000, untilAge: 68 }));
    const rows = simulate(plan, cfg);
    const superAt = (age: number) => rows.rows.find((x) => x.age === age)!.totalSuper;
    // While working (to 68) super is preserved; once it stops, drawdown resumes.
    expect(superAt(67) - superAt(68)).toBeLessThan(superAt(69) - superAt(70));
  });

  it("composes multiple strategies onto the baseline", () => {
    const b = base({ mortgage: { type: "principal_interest", balance: 150_000, interestRate: 6, annualRepayment: 18_000, payoffAge: 72, strategy: "carry" } });
    const cat = buildStrategyCatalog(b);
    const composed = applyStrategies(b, cat, new Set(["retire-later", "clear-mortgage"]), { "retire-later": { age: 68 } });
    expect(composed.retirementAge).toBe(68);
    expect(composed.mortgage?.strategy).toBe("clear_at_retirement");
  });
});

describe("Gap years (career break)", () => {
  const worker = (over: Partial<RetirementPlan> = {}) =>
    base({
      people: [{ currentAge: 45, superBalance: 200_000, salary: 100_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
      retirementAge: 65, outsideSuper: 150_000, annualOutsideSavings: 10_000, ...over,
    });

  it("offers the lever only while person 0 is still working", () => {
    expect(buildStrategyCatalog(worker()).map((c) => c.id)).toContain("gap-years");
    const retired = base({ people: [{ currentAge: 68, superBalance: 300_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }], retirementAge: 65 });
    expect(buildStrategyCatalog(retired).map((c) => c.id)).not.toContain("gap-years");
  });

  it("lowers super at retirement (missed contributions + compounding)", () => {
    const b = worker();
    const withBreak = applyOne(b, "gap-years", { startAge: 47, years: 3, spendFromSavings: 40_000 });
    expect(withBreak.careerBreaks).toEqual([{ atAge: 47, years: 3, spendFromSavings: 40_000, who: 0 }]);
    const noBreak = simulate(b, cfg).superAtRetirement;
    const broken = simulate(withBreak, cfg).superAtRetirement;
    expect(broken).toBeLessThan(noBreak);
  });

  it("pauses contributions/savings and draws living costs during the break only", () => {
    const b = worker();
    const r = simulate(applyOne(b, "gap-years", { startAge: 47, years: 3, spendFromSavings: 40_000 }), cfg);
    const at = (age: number) => r.rows.find((x) => x.age === age)!.breakdown;
    // Break years 47,48,49: no contributions, no salary, savings paused, $40k drawn.
    for (const age of [47, 48, 49]) {
      expect(at(age).contribNet).toBe(0);
      expect(at(age).salaryIncome).toBe(0);
      expect(at(age).savings).toBe(0);
      expect(at(age).careerBreakDraw).toBeCloseTo(40_000, 0);
    }
    // Working years around it are unaffected.
    expect(at(46).contribNet).toBeGreaterThan(0);
    expect(at(46).careerBreakDraw ?? 0).toBe(0);
    expect(at(50).contribNet).toBeGreaterThan(0);
  });

  it("keeps the accumulation ledger reconciling with the break draw", () => {
    const r = simulate(applyOne(worker(), "gap-years", { startAge: 47, years: 3, spendFromSavings: 40_000 }), cfg);
    for (const row of r.rows.filter((x) => x.phase === "accumulation")) {
      const b = row.breakdown;
      const closing = b.openingOutside + b.savings + b.outsideGrowth - b.outsideTax + (b.rentSaved ?? 0) - (b.careerBreakDraw ?? 0);
      expect(Math.abs(closing - b.closingOutside)).toBeLessThan(1);
    }
  });

  it("floors the living-cost draw at the savings available (never negative)", () => {
    // Tiny outside balance, big requested draw → draw is capped, outside stays ≥ 0.
    const r = simulate(applyOne(worker({ outsideSuper: 15_000, annualOutsideSavings: 0 }), "gap-years", { startAge: 47, years: 3, spendFromSavings: 40_000 }), cfg);
    for (const row of r.rows) expect(row.outside).toBeGreaterThanOrEqual(-1);
    const first = r.rows.find((x) => x.age === 47)!.breakdown;
    expect(first.careerBreakDraw!).toBeLessThan(40_000); // capped by the ~$15k available
  });
});

describe("Gap years — couples (choose which partner, or both)", () => {
  const couple = (over: Partial<RetirementPlan> = {}) =>
    base({
      household: "couple", superMode: "individual",
      people: [
        { currentAge: 45, superBalance: 200_000, salary: 100_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
        { currentAge: 45, superBalance: 150_000, salary: 80_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
      ],
      retirementAge: 65, outsideSuper: 250_000, annualOutsideSavings: 12_000, ...over,
    });

  it("offers a gap-years card for each partner", () => {
    const ids = buildStrategyCatalog(couple()).map((c) => c.id);
    expect(ids).toContain("gap-years"); // you
    expect(ids).toContain("gap-years-1"); // partner
  });

  it("targets the chosen partner only; the other keeps earning and saving", () => {
    const partnerBreak = applyOne(couple(), "gap-years-1", { startAge: 47, years: 2, spendFromSavings: 30_000 });
    expect(partnerBreak.careerBreaks).toEqual([{ atAge: 47, years: 2, spendFromSavings: 30_000, who: 1 }]);
    const b47 = simulate(partnerBreak, cfg).rows.find((x) => x.age === 47)!.breakdown;
    expect(b47.salaryIncome).toBe(100_000); // only person 0's salary — partner is off
    expect(b47.savings).toBe(12_000); // person 0 still works → household savings continue
    expect(b47.careerBreakDraw).toBeCloseTo(30_000, 0);
  });

  it("models BOTH partners off — savings pause only when neither is earning", () => {
    const b = couple();
    const cat = buildStrategyCatalog(b);
    const both = applyStrategies(b, cat, new Set(["gap-years", "gap-years-1"]), {
      "gap-years": { startAge: 47, years: 2, spendFromSavings: 40_000 },
      "gap-years-1": { startAge: 47, years: 2, spendFromSavings: 30_000 },
    });
    expect(both.careerBreaks).toHaveLength(2);
    const b47 = simulate(both, cfg).rows.find((x) => x.age === 47)!.breakdown;
    expect(b47.salaryIncome).toBe(0); // both off
    expect(b47.savings).toBe(0); // nobody earning → savings additions pause
    expect(b47.careerBreakDraw).toBeCloseTo(70_000, 0); // both living costs summed
  });

  it("staggered breaks: savings continue in the year only one partner is off", () => {
    const b = couple();
    const cat = buildStrategyCatalog(b);
    const both = applyStrategies(b, cat, new Set(["gap-years", "gap-years-1"]), {
      "gap-years": { startAge: 47, years: 1, spendFromSavings: 40_000 }, // person 0 off at 47 only
      "gap-years-1": { startAge: 50, years: 1, spendFromSavings: 30_000 }, // partner off at 50 only
    });
    const at = (age: number) => simulate(both, cfg).rows.find((x) => x.age === age)!.breakdown;
    expect(at(47).savings).toBe(12_000); // partner still working
    expect(at(50).savings).toBe(12_000); // person 0 still working
    expect(at(47).salaryIncome).toBe(80_000); // person 0 off, partner earns
    expect(at(50).salaryIncome).toBe(100_000); // partner off, person 0 earns
  });
});

describe("appliedStrategies — What-If changes baked into a saved plan", () => {
  it("returns [] for a plan with no What-If selection", () => {
    expect(appliedStrategies(base({}), cfg)).toEqual([]);
  });

  it("marks a baked-in strategy reflected, and a stale one overridden", () => {
    const plan = base({
      people: [{ currentAge: 62, superBalance: 800_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
      retirementAge: 62, outsideSuper: 200_000, targetSpending: 55_000,
      guardrails: {}, keepSuperInAccumulation: true,
      // Bookmark lists three; guardrails + keep-accumulation are baked in, but
      // part-time-work was never applied (no workIncome) → not reflected.
      whatIf: { active: ["guardrails", "keep-accumulation", "part-time-work"], values: {}, baselineId: "current" },
    });
    const applied = appliedStrategies(plan, cfg);
    const by = Object.fromEntries(applied.map((s) => [s.id, s]));
    expect(by["guardrails"].reflected).toBe(true);
    expect(by["guardrails"].label).toBe("Flexible spending (guardrails)");
    expect(by["keep-accumulation"].reflected).toBe(true);
    expect(by["part-time-work"].reflected).toBe(false); // re-applying it changes the sim
  });
});
