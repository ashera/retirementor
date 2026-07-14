import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type PropertyDetail, type RetirementPlan } from "../lib/au/types";
import { capitalGainsTax } from "../lib/au/property";
import { incomeTax } from "../lib/au/tax";

const base = (over: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN,
  household: "single",
  people: [
    { currentAge: 67, superBalance: 400_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
  ],
  homeowner: true,
  outsideSuper: 0,
  annualOutsideSavings: 0,
  retirementAge: 67,
  spendingMode: "flat",
  targetSpending: 40_000,
  investmentReturn: 6,
  inflation: 2.5,
  lifeExpectancy: 90,
  ...over,
});

const prop = (over: Partial<PropertyDetail> = {}): PropertyDetail => ({
  value: 500_000,
  growthReal: 2,
  grossYield: 4,
  costRatio: 25,
  loanBalance: 200_000,
  loanRate: 6,
  purchasePrice: 300_000,
  strategy: "hold",
  sellAtAge: 80,
  ...over,
});

const super0 = [{ currentAge: 67, superBalance: 0, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }];
const rowAt = (r: ReturnType<typeof simulate>, age: number) => r.rows.find((x) => x.age === age)!;
const pensionAt = (r: ReturnType<typeof simulate>, age: number) => rowAt(r, age).agePension;

describe("Investment property", () => {
  it("throws off net rent as income and counts net equity as an asset", () => {
    const r = simulate(base({ investmentProperty: prop() }), cfg);
    const row = rowAt(r, 67);
    // Gross 20k × (1−25%) = 15k, less 12k interest → 3k net rent.
    expect(row.rentIncome).toBeCloseTo(3_000, 0);
    // 500k value − 200k loan = 300k net equity.
    expect(row.propertyEquity).toBe(300_000);
  });

  it("a negatively-geared property yields NEGATIVE net rent (raw, not clamped)", () => {
    // The income chart + year modal rely on rentIncome being the RAW net figure so
    // they can net a geared property's cash drain out of total income.
    const r = simulate(base({ investmentProperty: prop({ loanBalance: 500_000 }) }), cfg);
    // Gross 20k × 0.75 = 15k, less 30k interest (500k × 6%) → −15k net rent.
    expect(rowAt(r, 67).rentIncome).toBeCloseTo(-15_000, 0);
  });

  it("assesses rent as ACTUAL, not deemed (vs the same value held as cash)", () => {
    // Same ~320k assessable either way (below the assets cut-off, so the income
    // test binds). As a property its actual rent (~$3k) is far below what deeming
    // would impute on $320k of cash (~$9k) → a bigger pension.
    const asProperty = simulate(base({ people: super0, outsideSuper: 20_000, investmentProperty: prop() }), cfg);
    const asCash = simulate(base({ people: super0, outsideSuper: 320_000 }), cfg);
    expect(pensionAt(asProperty, 67)).toBeGreaterThan(pensionAt(asCash, 67));
  });

  it("nets the secured loan off the assessed value (bigger loan → more pension)", () => {
    // Assets test binds here (super 400k). A bigger secured loan shrinks the
    // assessable equity, so the pension is higher.
    const smallLoan = simulate(base({ investmentProperty: prop({ loanBalance: 200_000 }) }), cfg);
    const bigLoan = simulate(base({ investmentProperty: prop({ loanBalance: 350_000 }) }), cfg);
    expect(pensionAt(bigLoan, 67)).toBeGreaterThan(pensionAt(smallLoan, 67));
  });

  it("selling triggers CGT and moves the proceeds into the deemed pool", () => {
    const r = simulate(
      base({
        people: [{ currentAge: 67, superBalance: 800_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
        investmentProperty: prop({ strategy: "sell", sellAtAge: 70 }),
      }),
      cfg,
    );
    expect(rowAt(r, 69).propertyEquity).toBeGreaterThan(0); // held until the sale
    expect(rowAt(r, 70).propertyEquity).toBe(0); // sold
    expect(rowAt(r, 70).rentIncome).toBe(0); // no more rent
    // Net proceeds (~$300k after loan + CGT) land in the outside-super pool.
    expect(rowAt(r, 72).outside).toBeGreaterThan(rowAt(r, 69).outside + 200_000);
  });

  it("computes CGT on the discounted gain", () => {
    // 500k − 300k = 200k gain, halved to 100k, taxed at resident rates.
    expect(capitalGainsTax(prop(), 500_000)).toBeCloseTo(incomeTax(100_000), 5);
  });
});

describe("Multiple investment properties", () => {
  it("sums net rent and net equity across held properties", () => {
    const one = rowAt(simulate(base({ people: super0, investmentProperties: [prop()] }), cfg), 67);
    const two = rowAt(simulate(base({ people: super0, investmentProperties: [prop(), prop()] }), cfg), 67);
    expect(two.rentIncome).toBeCloseTo(one.rentIncome * 2, 0);
    expect(two.propertyEquity).toBe(one.propertyEquity * 2);
  });

  it("tracks each property's sale independently", () => {
    const people = [{ currentAge: 67, superBalance: 800_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }];
    const r = simulate(base({ people, investmentProperties: [prop({ strategy: "sell", sellAtAge: 70 }), prop({ strategy: "hold" })] }), cfg);
    const oneHeld = simulate(base({ people, investmentProperties: [prop({ strategy: "hold" })] }), cfg);
    // Before the sale both are held → twice a single held property's equity.
    expect(rowAt(r, 69).propertyEquity).toBeCloseTo(rowAt(oneHeld, 69).propertyEquity * 2, -2);
    // After the sale only the survivor remains → exactly one held property.
    expect(rowAt(r, 71).propertyEquity).toBeCloseTo(rowAt(oneHeld, 71).propertyEquity, -2);
    expect(rowAt(r, 71).rentIncome).toBeGreaterThan(0); // the held one still earns rent
  });

  it("treats a legacy single investmentProperty the same as a one-element array", () => {
    const legacy = simulate(base({ people: super0, investmentProperty: prop() }), cfg);
    const array = simulate(base({ people: super0, investmentProperties: [prop()] }), cfg);
    expect(rowAt(array, 67).propertyEquity).toBe(rowAt(legacy, 67).propertyEquity);
    expect(pensionAt(array, 67)).toBeCloseTo(pensionAt(legacy, 67), 5);
  });
});
