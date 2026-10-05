import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { buildStrategyCatalog, resolveValues } from "../lib/au/strategies";
import { composeScenario } from "../lib/au/scenario";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";

// Super Guarantee on EMPLOYED part-time work, the lifted earnings cap, and the
// employed/hobby toggle — the gaps a RetireWiz user hit modelling coast/part-time
// FIRE. These tests are written against closed-form expectations with inflation 0,
// so the Super Guarantee figure is exact.

// A coast-FIRE single: retires at 50 (well under the 60 preservation age), a big
// outside-super bridge pool that comfortably covers spending, so the super pool is
// never drawn — it only grows and receives any Super Guarantee. Part-time employed
// income runs for the first decade of retirement.
const coast = (over: Partial<RetirementPlan["workIncome"]> | false = { perYear: 40_000, untilAge: 60, addsSuper: true }): RetirementPlan => ({
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ ...DEFAULT_PLAN.people[0], currentAge: 50, superBalance: 300_000, salary: 0, voluntaryConcessional: 0 }],
  superMode: "individual",
  homeowner: true,
  outsideSuper: 500_000,
  annualOutsideSavings: 0,
  retirementAge: 50,
  spendingMode: "flat",
  targetSpending: 40_000,
  investmentReturn: 5,
  returnVolatility: 11,
  inflation: 0, // makes the Super Guarantee figure exact in today's dollars
  lifeExpectancy: 90,
  workIncome: over === false ? undefined : { perYear: 40_000, untilAge: 60, addsSuper: true, ...over },
});

const rowAt = (p: RetirementPlan, age: number) => simulate(p, cfg).rows.find((r) => r.age === age)!;

// Exact net Super Guarantee on $X of employed income: SG rate, minus 15% contributions tax.
const sgNet = (gross: number) => gross * cfg.sgRate * (1 - cfg.contributionsTax);

describe("Coast-FIRE: Super Guarantee on employed part-time work", () => {
  it("adds the exact net SG to super each working year (point #1)", () => {
    const r = rowAt(coast(), 55).breakdown; // age 55 — within the work window, under preservation age
    // $40k employed → 12% SG, net of 15% contributions tax = $4,080, recorded as the
    // year's net contribution so the money-flow waterfall reconciles.
    expect(r.contribNet).toBeCloseTo(sgNet(40_000), 2);
    expect(r.contribGross).toBeCloseTo(40_000 * cfg.sgRate, 2);
    expect(r.contribTax).toBeCloseTo(40_000 * cfg.sgRate * cfg.contributionsTax, 2);
    // Under preservation age it lands in the ACCUMULATION pool.
    expect(r.accumSuper).toBeGreaterThan(1);
  });

  it("stops contributing once part-time work ends (untilAge)", () => {
    expect(rowAt(coast(), 59).breakdown.contribNet).toBeCloseTo(sgNet(40_000), 2); // last work year
    expect(rowAt(coast(), 60).breakdown.contribNet).toBeLessThan(1); // work ended at 60
  });

  it("the SG is ON TOP of the wage — it never reduces the income that offsets drawdown", () => {
    const employed = rowAt(coast({ addsSuper: true }), 55).breakdown;
    const hobby = rowAt(coast({ addsSuper: false }), 55).breakdown;
    // Net work income (what offsets drawdown) is identical; only the super differs.
    expect(employed.workIncome).toBeCloseTo(hobby.workIncome, 6);
    expect(employed.contribNet).toBeGreaterThan(hobby.contribNet);
  });

  it("rebuilds a meaningful super balance over the coast decade", () => {
    const employed = rowAt(coast({ addsSuper: true }), 60).totalSuper;
    const hobby = rowAt(coast({ addsSuper: false }), 60).totalSuper;
    // 10 years of ~$4,080 net SG (ages 50–59), the earliest compounding ~9 years.
    expect(employed - hobby).toBeGreaterThan(40_000);
  });

  it("hobby / self-employed income adds NO super", () => {
    const rows = simulate(coast({ addsSuper: false }), cfg).rows.filter((r) => r.phase !== "accumulation");
    expect(rows.every((r) => (r.breakdown.contribNet ?? 0) < 1)).toBe(true);
  });
});

describe("Backward compatibility: workIncome without addsSuper", () => {
  it("defaults to NO super (byte-identical to explicit hobby)", () => {
    const legacy = simulate(coast({ addsSuper: undefined as unknown as boolean }), cfg); // {perYear, untilAge} only
    const hobby = simulate(coast({ addsSuper: false }), cfg);
    expect(JSON.stringify(legacy.rows)).toBe(JSON.stringify(hobby.rows));
  });

  it("no workIncome at all is unaffected", () => {
    const none = simulate(coast(false), cfg);
    // Sanity: a plan with no part-time work has no work income anywhere.
    expect(none.rows.every((r) => (r.breakdown.workIncome ?? 0) < 1)).toBe(true);
  });
});

describe("Part-time-work What-If lever", () => {
  const base = coast(false); // no baked-in workIncome; the lever supplies it
  const card = () => buildStrategyCatalog(base, { config: cfg }).find((c) => c.id === "part-time-work")!;

  it("earnings cap is lifted well above $60k for high earners dropping days (point #2)", () => {
    const perYear = card().params.find((p) => p.key === "perYear")!;
    expect(perYear.max).toBeGreaterThanOrEqual(200_000); // was 60_000
  });

  it("has an employed/hobby toggle defaulting to employed (earns super)", () => {
    const applied = card().apply(base, resolveValues(card()));
    expect(applied.workIncome?.addsSuper).toBe(true);
  });

  it("the hobby option switches SG off", () => {
    const applied = card().apply(base, resolveValues(card(), { employed: 0 }));
    expect(applied.workIncome?.addsSuper).toBe(false);
  });

  it("composing the lever onto a plan feeds SG through to the engine", () => {
    const layer = { active: ["part-time-work"], values: { "part-time-work": { perYear: 80_000, untilAge: 60 } } };
    const composed = composeScenario(base, layer, cfg);
    expect(composed.workIncome).toEqual({ perYear: 80_000, untilAge: 60, addsSuper: true });
    // $80k employed → net SG recorded in the ledger (over the $60k old cap too).
    const r = simulate(composed, cfg).rows.find((row) => row.age === 55)!.breakdown;
    expect(r.contribNet).toBeCloseTo(sgNet(80_000), 1);
  });
});
