import { describe, it, expect } from "vitest";
import { simulate } from "../../lib/au/simulate";
import { DEFAULT_CONFIG } from "../../lib/au/config";
import { DEFAULT_PLAN, type Person, type RetirementPlan } from "../../lib/au/types";
import * as ref from "../../lib/au/scenarios/reference";

// Layer E — differential checks. Change exactly ONE lever and assert the OUTCOME
// moves by an independently-derived delta. This is precisely what the What-If
// marginal chips compute, so it validates that engine + interaction logic, and
// catches bugs the absolute-value personas miss (a constant offset cancels in a
// delta, but a wrong *sensitivity* shows up here).
//
// livingStandardsGrowthPct = 0 so today's $ = nominal and the closed forms are
// exact (same trick the personas use); inflation 0 on every plan.
const cfg = { ...DEFAULT_CONFIG, livingStandardsGrowthPct: 0 };
const near = (a: number, b: number, tol = 2) => Math.abs(a - b) <= tol;

const P = (over: Partial<Person> = {}): Person => ({
  currentAge: 57, superBalance: 300_000, salary: 90_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0, ...over,
});
const base = (over: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN, household: "single", superMode: "individual", people: [P()],
  homeowner: true, outsideSuper: 150_000, annualOutsideSavings: 5_000,
  retirementAge: 67, spendingMode: "flat", targetSpending: 50_000,
  investmentReturn: 6, inflation: 0, lifeExpectancy: 90, ...over,
});

const superAtRet = (p: RetirementPlan) => simulate(p, cfg).superAtRetirement;
const rowAt = (p: RetirementPlan, age: number) => simulate(p, cfg).rows.find((x) => x.age === age)!;
const drawAt = (p: RetirementPlan, age: number) => {
  const r = rowAt(p, age);
  return r.superDrawn + r.outsideDrawn;
};

describe("Differential — one-lever deltas match an independent delta", () => {
  it("salary-sacrifice: extra super = FV of the extra net concessional", () => {
    const extra = 15_000;
    const engine = superAtRet(base({ people: [P({ voluntaryConcessional: extra })] })) - superAtRet(base());
    const et = cfg.superEarningsTaxAccumulation;
    const feePct = cfg.fees.adminInvestmentPct;
    const ded = cfg.fees.fixedAdminAnnual + cfg.fees.insuranceAnnual;
    const cWith = ref.netAnnualContribution(90_000, cfg.sgRate, extra, cfg.concessionalCap, cfg.contributionsTax, 0, cfg.nonConcessionalCap, cfg.div293Threshold, cfg.div293ExtraTaxRate);
    const cWithout = ref.netAnnualContribution(90_000, cfg.sgRate, 0, cfg.concessionalCap, cfg.contributionsTax, 0, cfg.nonConcessionalCap, cfg.div293Threshold, cfg.div293ExtraTaxRate);
    const refDelta =
      ref.superBalanceAt(300_000, cWith, 6, 0, et, 10, feePct, ded) -
      ref.superBalanceAt(300_000, cWithout, 6, 0, et, 10, feePct, ded);
    expect(near(engine, refDelta, 2), `engine Δ${engine.toFixed(0)} vs ref Δ${refDelta.toFixed(0)}`).toBe(true);
  });

  it("extra outside savings: extra outside balance = FV of the extra savings", () => {
    const engine = rowAt(base({ annualOutsideSavings: 13_000 }), 67).outside - rowAt(base(), 67).outside;
    // The extra savings also grow a bigger taxable dividend each working year, so
    // the delta is less than a pure FV — the recurrence captures that.
    const yld = cfg.outsideTax.incomeYieldPct;
    const refDelta =
      ref.outsideAccumWithTax(150_000, 13_000, 6, 0, yld, 10, [90_000]) -
      ref.outsideAccumWithTax(150_000, 5_000, 6, 0, yld, 10, [90_000]);
    expect(near(engine, refDelta, 2), `engine Δ${engine.toFixed(0)} vs ref Δ${refDelta.toFixed(0)}`).toBe(true);
  });

  it("retire one year later: extra super = one more accumulation year of the closed form", () => {
    const engine = superAtRet(base({ retirementAge: 68 })) - superAtRet(base({ retirementAge: 67 }));
    const et = cfg.superEarningsTaxAccumulation;
    const feePct = cfg.fees.adminInvestmentPct;
    const ded = cfg.fees.fixedAdminAnnual + cfg.fees.insuranceAnnual;
    const c = ref.netAnnualContribution(90_000, cfg.sgRate, 0, cfg.concessionalCap, cfg.contributionsTax, 0, cfg.nonConcessionalCap, cfg.div293Threshold, cfg.div293ExtraTaxRate);
    const refDelta =
      ref.superBalanceAt(300_000, c, 6, 0, et, 11, feePct, ded) -
      ref.superBalanceAt(300_000, c, 6, 0, et, 10, feePct, ded);
    expect(near(engine, refDelta, 2), `engine Δ${engine.toFixed(0)} vs ref Δ${refDelta.toFixed(0)}`).toBe(true);
  });

  it("adjust spending +$10k: first retirement year draws exactly $10k more", () => {
    // At age 67 the opening assets (hence the Age Pension) are identical, so the
    // whole extra spend falls on the drawdown.
    const engine = drawAt(base({ targetSpending: 60_000 }), 67) - drawAt(base({ targetSpending: 50_000 }), 67);
    expect(near(engine, 10_000, 2), `drawdown Δ${engine.toFixed(0)} ≠ 10000`).toBe(true);
  });

  it("part-time work: drawdown falls by exactly the net-of-tax work income", () => {
    // Retire at 63, look at 64 (before Age Pension age) so no income test interferes.
    const b = base({ retirementAge: 63 });
    const w = base({ retirementAge: 63, workIncome: { perYear: 25_000, untilAge: 70 } });
    const engine = drawAt(w, 64) - drawAt(b, 64);
    const netWork = ref.netWorkIncome(25_000, 1, "single", false); // age 64 → pre-SAPTO, ordinary tax
    expect(near(engine, -netWork, 2), `drawdown Δ${engine.toFixed(0)} vs −netWork ${(-netWork).toFixed(0)}`).toBe(true);
  });

  it("outside-super tax: only the dividend yield + discounted realised gains, ordinary tax pre-67", () => {
    // Early retiree living off a sizeable outside-super pool. The realistic model
    // taxes the DIVIDEND YIELD each year (deferring unrealised capital growth, and
    // discounting the gain that IS realised by 50%) — not the whole return as
    // income (which badly over-taxed an equity portfolio).
    const outside = 1_500_000, spend = 60_000;
    const plan = base({
      people: [P({ currentAge: 58, salary: 0, superBalance: 300_000 })],
      retirementAge: 58, outsideSuper: outside, targetSpending: spend,
    });
    const rows = simulate(plan, cfg).rows;

    // First retirement year: basis is fresh, so the drawdown realises NO gain and
    // the whole outside tax is the dividend yield on the post-drawdown balance,
    // taxed at the ordinary (pre-67, no SAPTO) resident scale — an exact closed form.
    const first = rows.find((r) => r.age === 58)!;
    const income = (outside - spend) * (cfg.outsideTax.incomeYieldPct / 100); // draw is outside-first
    const expected = ref.residentIncomeTax(income);
    expect(near(first.breakdown.outsideTax, expected, 2), `age 58: engine ${first.breakdown.outsideTax.toFixed(0)} vs ref ${expected.toFixed(0)}`).toBe(true);

    // Genuinely taxed pre-67 (the SAPTO-fix invariant) — income alone clears LITO.
    expect(first.breakdown.outsideTax).toBeGreaterThan(1_000);
    // ...but FAR less than the old model, which taxed the full ~6% return as income
    // (≈ residentIncomeTax on 6% of the balance, an order of magnitude more).
    const oldModel = ref.residentIncomeTax((outside - spend) * 0.06);
    expect(first.breakdown.outsideTax).toBeLessThan(oldModel * 0.6);
  });

  it("downsizer split: $ moved to super reallocates from savings 1:1, release unchanged", () => {
    const home = { value: 900_000, growthReal: 2 };
    const toSavings = base({ people: [P({ currentAge: 60, salary: 0 })], retirementAge: 65, home: { ...home, downsize: { atAge: 70, newValue: 550_000, toSuper: 0 } } });
    const toSuper = base({ people: [P({ currentAge: 60, salary: 0 })], retirementAge: 65, home: { ...home, downsize: { atAge: 70, newValue: 550_000, toSuper: 150_000 } } });
    const rs = simulate(toSavings, cfg).rows.find((x) => x.breakdown.homeProceeds > 0)!;
    const ru = simulate(toSuper, cfg).rows.find((x) => x.breakdown.homeProceeds > 0)!;
    // Same equity freed, just a different destination.
    expect(near(rs.breakdown.homeProceeds, ru.breakdown.homeProceeds, 1), "release differs").toBe(true);
    // The $150k lands in super instead of savings — an exact 1:1 reallocation at
    // the injection (opening balances, before the year's growth/tax diverge).
    expect(near(ru.breakdown.openingSuper - rs.breakdown.openingSuper, 150_000, 2), "super not +150k").toBe(true);
    expect(near(ru.breakdown.openingOutside - rs.breakdown.openingOutside, -150_000, 2), "outside not −150k").toBe(true);
  });
});
