import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG, withDefaults } from "../lib/au/config";
import { incomeTax, medicareLevy, sapto, seniorIncomeTax, residentIncomeTax } from "../lib/au/tax";
import { outstandingBalance } from "../lib/au/mortgage";
import { guardrailsTimeline } from "../lib/au/guardrails";
import { failsafeSpend, runStressTest } from "../lib/au/stresstest";
import { bootstrapShockPath } from "../lib/au/historicalReturns";
import { DEFAULT_PLAN, spendingForAge, type RetirementPlan, type Person } from "../lib/au/types";

// Regression tests for the adversarial engine review (Tier 1 + verified Tier 2).
// livingStandardsGrowthPct = 0 so today's $ = nominal and the numbers are clean.
const cfg = { ...DEFAULT_CONFIG, livingStandardsGrowthPct: 0 };
const P = (o: Partial<Person> = {}): Person => ({ currentAge: 60, superBalance: 500_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0, ...o });
const base = (o: Partial<RetirementPlan> = {}): RetirementPlan => ({
  ...DEFAULT_PLAN, household: "single", superMode: "individual", people: [P()],
  homeowner: true, outsideSuper: 0, annualOutsideSavings: 0, retirementAge: 60,
  spendingMode: "flat", targetSpending: 40_000, investmentReturn: 6, inflation: 0, lifeExpectancy: 90, ...o,
});
const rowAt = (p: RetirementPlan, age: number) => simulate(p, cfg).rows.find((r) => r.age === age)!;

describe("Review fix #2 — age-gap couple Age Pension", () => {
  it("pays the member-of-a-couple rate (half) when only one partner has reached Age Pension age", () => {
    const assets = { retirementAge: 60, outsideSuper: 20_000, targetSpending: 30_000, household: "couple" as const, superMode: "individual" as const };
    const gap = base({ ...assets, people: [P({ currentAge: 67, superBalance: 80_000 }), P({ currentAge: 62, superBalance: 80_000 })] });
    const both = base({ ...assets, people: [P({ currentAge: 67, superBalance: 80_000 }), P({ currentAge: 67, superBalance: 80_000 })] });
    const gapPension = rowAt(gap, 67).agePension; // one partner 67, one 62
    const bothPension = rowAt(both, 67).agePension; // both 67
    expect(gapPension).toBeGreaterThan(0);
    expect(bothPension).toBeGreaterThan(gapPension * 1.9); // roughly double
    expect(gapPension).toBeCloseTo(bothPension / 2, 0); // exactly half (same assets)
  });
});

describe("Review fix #1 — guardrails don't ratchet on an income-covered first year", () => {
  it("anchors the rails on the first REAL draw, not a year fully covered by income", () => {
    // Well funded (~3.3% draw), but part-time work covers spending for the first
    // years — the old zero-anchor bug would then cut spending to the floor forever.
    const plan = base({
      people: [P({ currentAge: 60, superBalance: 800_000 })], outsideSuper: 400_000,
      targetSpending: 40_000, workIncome: { perYear: 55_000, untilAge: 67 }, guardrails: {},
    });
    const spend75 = rowAt(plan, 75).breakdown.livingSpend; // years after work stops
    expect(spend75).toBeGreaterThan(37_000); // held near the $40k start, not the ~$28k floor
  });
});

describe("Review fix #3 — downsizing after mortgage payoff releases full equity", () => {
  it("does not subtract a mortgage that is already discharged", () => {
    const home = { value: 900_000, growthReal: 0, downsize: { atAge: 70, newValue: 500_000, toSuper: 0 } };
    const withLoan = base({
      people: [P({ currentAge: 60, superBalance: 400_000 })], retirementAge: 65, home,
      mortgage: { type: "principal_interest", balance: 200_000, interestRate: 5, annualRepayment: 24_000, payoffAge: 65, strategy: "carry" },
    });
    const noLoan = base({ people: [P({ currentAge: 60, superBalance: 400_000 })], retirementAge: 65, home });
    const relWith = rowAt(withLoan, 70).breakdown.homeProceeds;
    const relNo = rowAt(noLoan, 70).breakdown.homeProceeds;
    expect(relWith).toBeGreaterThan(0);
    expect(relWith).toBeCloseTo(relNo, 0); // loan gone by 70 → same release as no-mortgage
  });
});

describe("Review fix #4 — outside-super tax stacks a working partner's salary", () => {
  it("taxes a still-working partner's share of outside gains at their marginal rate", () => {
    // Staggered couple: partner 0 retired at 60, partner 1 works to 67 on $180k.
    // Salary covers spending (no drawdown), so the assessable is dividend income;
    // partner 1's half must stack on $180k (37%+), not the $0 threshold.
    const plan = base({
      household: "couple", superMode: "individual",
      people: [
        P({ currentAge: 60, superBalance: 300_000 }),
        P({ currentAge: 60, superBalance: 300_000, salary: 180_000, retirementAge: 67 }),
      ],
      retirementAge: 60, outsideSuper: 1_500_000, targetSpending: 70_000,
    });
    const tax63 = rowAt(plan, 63).breakdown.outsideTax; // a staggered-gap year
    // Old model (both halves from $0) would give only a few hundred dollars; stacking
    // partner 1's ~$18k half on $180k of salary yields several thousand.
    expect(tax63).toBeGreaterThan(4_000);
  });
});

describe("Review fix #5 — Division 293 base excludes the salary-sacrifice", () => {
  it("uses taxable + concessional, not salary + concessional", () => {
    // $220k salary sacrificing to the cap: taxable+concessional ≈ $246k (< $250k → NO
    // Div 293); salary+concessional ≈ $252.5k would have wrongly triggered it.
    const plan = base({ people: [P({ currentAge: 50, superBalance: 300_000, salary: 220_000, voluntaryConcessional: 10_000 })], retirementAge: 67 });
    const contribNet = rowAt(plan, 50).breakdown.contribNet;
    const concessional = Math.min(220_000 * cfg.sgRate + 10_000, cfg.concessionalCap);
    expect(contribNet).toBeCloseTo(concessional * (1 - cfg.contributionsTax), 0); // no Div 293 deducted
  });
});

describe("Review Tier-3 fixes", () => {
  it("#1 FY2026-27 resident scale uses the 15% bracket (not 16%)", () => {
    expect(incomeTax(45_000)).toBeCloseTo(4_020, 0); // 26,800 × 15%
    expect(incomeTax(100_000)).toBeCloseTo(20_520, 0); // 4,020 + 55,000 × 30%
  });

  it("#2 Medicare levy: nil under the threshold, shaded in, then flat 2%", () => {
    expect(medicareLevy(20_000)).toBe(0);
    expect(medicareLevy(30_000)).toBeCloseTo(0.1 * (30_000 - 27_222), 0); // shade-in
    expect(medicareLevy(100_000)).toBeCloseTo(2_000, 0); // flat 2%
    // and the engine's take-home now includes it
    const p = base({ people: [P({ currentAge: 50, superBalance: 300_000, salary: 100_000 })], retirementAge: 67 });
    expect(rowAt(p, 50).takeHome).toBeCloseTo(100_000 - incomeTax(100_000) - 2_000, 0);
  });

  it("#11 non-concessional cap falls to $0 once total super ≥ the threshold", () => {
    const over = base({ people: [P({ currentAge: 50, superBalance: 2_200_000, salary: 50_000, voluntaryNonConcessional: 100_000 })], retirementAge: 67 });
    const under = base({ people: [P({ currentAge: 50, superBalance: 1_000_000, salary: 50_000, voluntaryNonConcessional: 100_000 })], retirementAge: 67 });
    // Over the threshold: no NCC added; under: the full $100k goes in.
    expect(rowAt(under, 50).breakdown.contribNet - rowAt(over, 50).breakdown.contribNet).toBeCloseTo(100_000, -1);
  });

  it("#10 downsizer contribution is capped at $300k per person", () => {
    const plan = base({
      people: [P({ currentAge: 60, superBalance: 400_000 })], retirementAge: 65,
      home: { value: 1_500_000, growthReal: 0, downsize: { atAge: 70, newValue: 600_000, toSuper: 500_000 } },
    });
    const row = simulate(plan, cfg).rows.find((r) => r.breakdown.homeProceedsToSuper > 0)!;
    expect(row.breakdown.homeProceedsToSuper).toBeCloseTo(300_000, 0); // requested $500k → capped at $300k (single)
  });

  it("#8 a floorPct over 100% is clamped — the floor never exceeds the start spend", () => {
    const tl = guardrailsTimeline({ ...base({ people: [P({ currentAge: 60, superBalance: 900_000 })], retirementAge: 60, outsideSuper: 0, targetSpending: 55_000 }), guardrails: { floorPct: 120 } }, cfg);
    expect(tl.floor).toBeLessThanOrEqual(tl.start);
  });

  it("#6 bootstrap sampler survives a non-finite blockYears (no infinite loop)", () => {
    const path = bootstrapShockPath(() => 0.5, 20, Number.NaN);
    expect(path).toHaveLength(21);
    expect(path.every((v) => Number.isFinite(v))).toBe(true);
  });
});

// ── Pass 2 (2026-07-16): a second adversarial review, different partition ─────
describe("Review pass-2 #1 — a pension-age partner's super is assessed while still working", () => {
  it("assesses a still-working 68-year-old's super the same as if it were in pension phase", () => {
    // Only difference between the two plans: whether partner #2 (68, $300k super,
    // earns nothing) has retired. Their super is assessable from Age Pension age
    // either way, so the household pension must match. Pre-fix, the working case
    // omitted their super from the assets test and paid a much larger pension.
    const common = { household: "couple" as const, superMode: "individual" as const, retirementAge: 68, outsideSuper: 50_000, targetSpending: 55_000 };
    const retired = base({ ...common, people: [P({ currentAge: 68, superBalance: 300_000 }), P({ currentAge: 68, superBalance: 300_000, retirementAge: 68 })] });
    const working = base({ ...common, people: [P({ currentAge: 68, superBalance: 300_000 }), P({ currentAge: 68, superBalance: 300_000, salary: 0, retirementAge: 75 })] });
    const pRetired = rowAt(retired, 68).agePension;
    const pWorking = rowAt(working, 68).agePension;
    expect(pRetired).toBeGreaterThan(5_000); // part-pension (assets under the cutout)
    // Assessed either way — the tiny residual is just one year's super growth landing
    // before the means test for a working member vs after for a retired one. Pre-fix
    // the working case omitted $300k of super and paid ~$20k more pension.
    expect(Math.abs(pWorking - pRetired)).toBeLessThan(3_000);
  });
});

describe("Review pass-2 #5 — Work Bonus is per pension-age earner, not per household member", () => {
  it("excludes $7,800 only for the partner who has reached Age Pension age", () => {
    const plan = base({
      household: "couple", superMode: "individual", retirementAge: 67,
      people: [P({ currentAge: 67, superBalance: 100_000 }), P({ currentAge: 63, superBalance: 100_000, retirementAge: 63 })],
      outsideSuper: 20_000, targetSpending: 40_000, workIncome: { perYear: 30_000, untilAge: 80 },
    });
    // $30k work split 15k/15k: the 67-year-old gets the $7,800 bonus (→ 7,200), the
    // 63-year-old does not (→ 15,000). Pre-fix a flat 2×$7,800 gave 30k−15.6k = 14.4k.
    const other = rowAt(plan, 67).breakdown.pension!.otherIncome;
    expect(other).toBeCloseTo(22_200, 0);
  });
});

describe("Review pass-2 #4 — SAPTO phases out at high income", () => {
  it("grants full SAPTO on modest income, tapers it, and removes it entirely above ~$50k", () => {
    expect(sapto(30_000, "single")).toBeCloseTo(2_230, 0); // below the shade-in threshold
    expect(seniorIncomeTax(30_000, "single")).toBe(0); // modest senior income stays tax-free
    expect(sapto(45_000, "single")).toBeCloseTo(640, 0); // (45,000−32,279)·0.125 = 1,590 withdrawn
    expect(sapto(50_119, "single")).toBeCloseTo(0, 0); // fully phased out
    // Above the cut-out the senior pays the ordinary (LITO-only) tax — no free SAPTO.
    expect(seniorIncomeTax(80_000, "single")).toBeCloseTo(residentIncomeTax(80_000), 0);
  });
});

describe("Review pass-2 #2 — retirement tax reconciles with the consolidated modal", () => {
  it("stacks net rent + outside earnings on ONE tax scale (charged == personTax), not independently", () => {
    const plan = base({
      people: [P({ currentAge: 67, superBalance: 300_000 })], retirementAge: 67,
      outsideSuper: 900_000, targetSpending: 90_000, lifeExpectancy: 90,
      investmentProperties: [{ name: "IP", value: 600_000, purchasePrice: 400_000, growthReal: 0, grossYield: 8, costRatio: 20, loanBalance: 0, loanRate: 0, strategy: "hold", sellAtAge: 99 }],
    });
    const r = simulate(plan, cfg).rows.find((x) => x.age === 70)!.breakdown;
    const charged = (r.rentTax ?? 0) + (r.outsideTax ?? 0); // actually deducted from the pools
    const modal = (r.incomeTax ?? 0) + ((r.capitalGains ?? 0) - (r.propertyCgt ?? 0)); // consolidated personTax (excl property-sale CGT)
    expect(charged).toBeGreaterThan(1_000); // rent + a drawn outside pool → real tax
    expect(charged).toBeCloseTo(modal, 0); // was ~$5k apart when rent & outside stacked separately
  });
});

describe("Review pass-2 #3 — clear-at-retirement pays the loan's real value, not the nominal balance", () => {
  it("deflates the $200k nominal balance to today's dollars at the clear year", () => {
    const plan = base({
      people: [P({ currentAge: 55, superBalance: 500_000 })], retirementAge: 67, inflation: 2.5, targetSpending: 40_000,
      mortgage: { type: "interest_only", balance: 200_000, interestRate: 6, annualRepayment: 0, payoffAge: null, strategy: "clear_at_retirement" },
    });
    const cleared = simulate(plan, cfg).rows.find((r) => r.breakdown.mortgageCleared > 0)!;
    const expected = 200_000 / 1.025 ** (cleared.age - 55); // deflated to the clear year (CPI)
    expect(cleared.breakdown.mortgageCleared).toBeCloseTo(expected, 0);
    expect(cleared.breakdown.mortgageCleared).toBeLessThan(190_000); // not the raw nominal balance
  });
});

describe("Review pass-2 #6 — a career break during the staggered gap is honoured", () => {
  it("stops the still-working partner's salary + contributions during the break", () => {
    const people = (): Person[] => [P({ currentAge: 60, superBalance: 300_000, retirementAge: 60 }), P({ currentAge: 58, superBalance: 300_000, salary: 90_000, retirementAge: 67 })];
    const common = { household: "couple" as const, superMode: "individual" as const, retirementAge: 60, outsideSuper: 200_000, targetSpending: 50_000, lifeExpectancy: 90 };
    const noBreak = base({ ...common, people: people() });
    const withBreak = base({ ...common, people: people(), careerBreaks: [{ atAge: 62, years: 2, spendFromSavings: 0, who: 1 }] });
    // Partner #2 hits age 62 when the household (person 0) is 64 — rows are keyed by
    // the oldest age. In that year they earn nothing and add no super.
    const breakRow = simulate(withBreak, cfg).rows.find((r) => r.age === 64)!.breakdown;
    expect(breakRow.onBreak).toBe(true);
    expect(breakRow.salaryIncome).toBe(0);
    // The lost contributions cost real super by the time they'd have retired (67).
    const endSuper = (p: RetirementPlan) => simulate(p, cfg).rows.find((r) => r.age === 67)!.totalSuper;
    expect(endSuper(withBreak)).toBeLessThan(endSuper(noBreak));
  });
});

// ── Tier-3 backlog (2026-07-16) ──────────────────────────────────────────────
describe("Review T3-1 — keepSuperInAccumulation shelters an under-67 partner's super", () => {
  it("exempts a retired under-67 partner's accumulation-phase super from the means test", () => {
    const common = { household: "couple" as const, superMode: "individual" as const, retirementAge: 68, outsideSuper: 50_000, targetSpending: 55_000 };
    const people = () => [P({ currentAge: 68, superBalance: 300_000 }), P({ currentAge: 63, superBalance: 300_000, retirementAge: 63 })];
    const sheltered = base({ ...common, people: people(), keepSuperInAccumulation: true });
    const assessed = base({ ...common, people: people() }); // default → partner's super in pension phase, assessed
    // Under-67 partner's super is assessable only once it's a pension (income stream) —
    // in accumulation it's exempt until pension age, so sheltering lifts the pension.
    expect(rowAt(sheltered, 68).agePension).toBeGreaterThan(rowAt(assessed, 68).agePension + 2_000);
  });
});

describe("Review T3-2 — a couple's property gain is split across co-owners", () => {
  it("taxes a jointly-owned gain as two shares, so a couple pays less CGT than a single", () => {
    const prop = { name: "IP", value: 900_000, purchasePrice: 300_000, growthReal: 0, grossYield: 0, costRatio: 0, loanBalance: 0, loanRate: 0, strategy: "sell" as const, sellAtAge: 68 };
    const common = { retirementAge: 68, outsideSuper: 100_000, targetSpending: 40_000, investmentProperties: [prop] };
    const single = base({ ...common, people: [P({ currentAge: 68, superBalance: 500_000 })] });
    const couple = base({ ...common, household: "couple", superMode: "individual", people: [P({ currentAge: 68, superBalance: 500_000 }), P({ currentAge: 68, superBalance: 500_000 })] });
    const singleCgt = rowAt(single, 68).breakdown.propertyCgt ?? 0;
    const coupleCgt = rowAt(couple, 68).breakdown.propertyCgt ?? 0;
    expect(singleCgt).toBeGreaterThan(0);
    expect(coupleCgt).toBeLessThan(singleCgt); // $600k gain split 2×$300k → lower progressive tax
  });
});

describe("Review T3-3 — a property sale scheduled in the working years happens then", () => {
  it("sells during accumulation (proceeds into savings), not deferred to retirement", () => {
    const prop = { name: "IP", value: 500_000, purchasePrice: 400_000, growthReal: 0, grossYield: 0, costRatio: 0, loanBalance: 0, loanRate: 0, strategy: "sell" as const, sellAtAge: 60 };
    const plan = base({ people: [P({ currentAge: 55, superBalance: 300_000, salary: 80_000 })], retirementAge: 67, outsideSuper: 50_000, investmentProperties: [prop] });
    const rows = simulate(plan, cfg).rows;
    const sale = rows.find((r) => (r.breakdown.propertyProceeds ?? 0) > 0)!;
    expect(sale.age).toBe(60); // sold at the scheduled age, in the working years
    expect(sale.phase).toBe("accumulation");
    expect(sale.breakdown.propertyProceeds).toBeGreaterThan(400_000); // ~$500k less CGT into savings
    // Rows plot the OPENING balance, so the proceeds show at the next year's open.
    expect(rows.find((r) => r.age === 61)!.outside).toBeGreaterThan(rows.find((r) => r.age === 60)!.outside + 400_000);
  });
});

describe("Review T3-5 — an underwater property sale charges the shortfall to savings", () => {
  it("reduces savings by the negative equity instead of dropping it", () => {
    const prop = { name: "IP", value: 300_000, purchasePrice: 300_000, growthReal: 0, grossYield: 0, costRatio: 0, loanBalance: 450_000, loanRate: 0, strategy: "sell" as const, sellAtAge: 68 };
    const plan = base({ people: [P({ currentAge: 66, superBalance: 300_000 })], retirementAge: 66, outsideSuper: 400_000, targetSpending: 30_000, investmentProperties: [prop] });
    const sale = rowAt(plan, 68).breakdown;
    expect(sale.propertyCgt).toBe(0); // value == cost base → no gain
    expect(sale.propertyProceeds).toBeCloseTo(-150_000, -2); // 300k value − 450k loan = −150k shortfall paid from savings
  });
});

describe("Review T3-6 — a downsize nets a P&I loan at its amortised balance", () => {
  it("releases equity against the paid-down balance, not the full original", () => {
    const mortgage = { type: "principal_interest" as const, balance: 300_000, interestRate: 5, annualRepayment: 30_000, payoffAge: 78, strategy: "carry" as const };
    const plan = base({
      people: [P({ currentAge: 60, superBalance: 400_000 })], retirementAge: 60, targetSpending: 40_000,
      home: { value: 1_000_000, growthReal: 0, downsize: { atAge: 65, newValue: 600_000, toSuper: 0 } }, mortgage,
    });
    const amortised = outstandingBalance(mortgage, 5); // t=5 at the downsize (currentAge 60 → age 65)
    expect(amortised).toBeLessThan(300_000); // paid down below the original
    const release = rowAt(plan, 65).breakdown.homeProceeds ?? 0;
    expect(release).toBeCloseTo(1_000_000 - 600_000 - amortised, -2);
  });
});

describe("Review T3-4 — CGT discount input is normalised + clamped", () => {
  it("reads a fraction (0.5) as 50% and clamps out-of-range values", () => {
    const mk = (pct: number) => withDefaults({ ...DEFAULT_CONFIG, outsideTax: { ...DEFAULT_CONFIG.outsideTax, cgtDiscountPct: pct } }).outsideTax.cgtDiscountPct;
    expect(mk(0.5)).toBe(50); // the classic "0.5 vs 50" entry mistake
    expect(mk(50)).toBe(50); // already a percent — unchanged
    expect(mk(500)).toBe(100); // clamped to the max
    expect(mk(-5)).toBe(0); // clamped to the min
  });
});

// ── Adversarial review — round 3 (verified fixes) ─────────────────────────────

describe("Review fix — fixed super fees can't drive a balance negative", () => {
  it("a $0-balance, non-earning member keeps super >= 0 through accumulation", () => {
    const plan = base({
      people: [P({ currentAge: 55, superBalance: 0, salary: 0 })],
      retirementAge: 65,
      fees: { adminInvestmentPct: 0, fixedAdminAnnual: 200, insuranceAnnual: 300 },
    });
    const rows = simulate(plan, cfg).rows;
    expect(Math.min(...rows.map((r) => r.totalSuper))).toBeGreaterThanOrEqual(0);
  });
});

describe("Review fix — recontribution only fires once person 0 has retired", () => {
  it("doesn't run (nor double NCC) while a staggered person 0 is still working", () => {
    const plan = base({
      household: "couple",
      superMode: "individual",
      people: [
        P({ currentAge: 60, superBalance: 300_000, salary: 100_000, voluntaryNonConcessional: 100_000 }),
        P({ currentAge: 60, superBalance: 300_000, salary: 0, retirementAge: 60 }), // retires first → household retired from t=0
      ],
      retirementAge: 67, // person 0 retires at 67
      outsideSuper: 1_000_000,
      recontribute: { perYear: 100_000, fromAge: 60, untilAge: 75 },
      targetSpending: 40_000,
    });
    const rows = simulate(plan, cfg).rows;
    // While person 0 (age < 67) is still working, no recontribution should be recorded.
    const gapRows = rows.filter((r) => r.age >= 60 && r.age < 67 && r.phase !== "accumulation");
    expect(gapRows.length).toBeGreaterThan(0); // ensure the staggered gap is actually exercised
    expect(gapRows.every((r) => (r.breakdown.recontribution ?? 0) === 0)).toBe(true);
    // …and it DOES fire once person 0 has retired.
    expect(rows.find((r) => r.age === 67)?.breakdown.recontribution ?? 0).toBeGreaterThan(0);
  });
});

describe("Review fix — staggered couple keeps saving while a partner still earns", () => {
  it("adds annualOutsideSavings during the gap (higher terminal wealth than $0 savings)", () => {
    const mk = (annualOutsideSavings: number) =>
      base({
        household: "couple",
        superMode: "individual",
        people: [
          P({ currentAge: 60, superBalance: 400_000, salary: 120_000 }),
          P({ currentAge: 60, superBalance: 400_000, salary: 0, retirementAge: 60 }),
        ],
        retirementAge: 67,
        outsideSuper: 100_000,
        annualOutsideSavings,
        targetSpending: 40_000,
      });
    const withSaving = simulate(mk(20_000), cfg);
    const without = simulate(mk(0), cfg);
    const terminal = (r: ReturnType<typeof simulate>) => r.rows[r.rows.length - 1].total;
    expect(terminal(withSaving)).toBeGreaterThan(terminal(without));
  });
});

describe("Review fix — degenerate horizons don't report a false 'lasts'", () => {
  it("lifeExpectancy <= retirementAge is not reported as lasting", () => {
    const plan = base({ retirementAge: 70, lifeExpectancy: 65, people: [P({ currentAge: 55, superBalance: 500_000 })] });
    expect(simulate(plan, cfg).lastsToLifeExpectancy).toBe(false);
  });
});

// ── Design change — guardrails flex AROUND the spending smile ──────────────────

describe("Guardrails flex around the spending smile (not flat at go-go)", () => {
  const staged = (o: Partial<RetirementPlan> = {}) =>
    base({
      spendingMode: "stages",
      spendingStages: { goGo: 60_000, slowGo: 48_000, noGo: 40_000, slowGoAge: 75, noGoAge: 85 },
      guardrails: {},
      retirementAge: 60,
      ...o,
    } as Partial<RetirementPlan>);

  it("steps spending DOWN at each smile boundary (not held flat at go-go)", () => {
    // Well funded → the market may nudge the factor, but a ~20% stage drop can't be
    // masked by a single ≤10% guardrail raise, so spend must fall crossing a boundary.
    const p = staged({ people: [P({ currentAge: 60, superBalance: 1_400_000 })], outsideSuper: 400_000 });
    const rows = simulate(p, cfg).rows.filter((r) => r.phase !== "accumulation");
    const at = (age: number) => rows.find((r) => r.age === age)!.breakdown.livingSpend;
    // Every age where the plan's smile steps down, the engine's spend steps down too.
    const boundaries = rows.filter((r) => spendingForAge(p, r.age) < spendingForAge(p, r.age - 1) - 1);
    expect(boundaries.length).toBeGreaterThan(0);
    for (const b of boundaries) expect(at(b.age)).toBeLessThan(at(b.age - 1));
  });

  it("still trims BELOW the smile plan when the portfolio is stressed", () => {
    const p = staged({ people: [P({ currentAge: 60, superBalance: 350_000 })], outsideSuper: 0 });
    const rows = simulate(p, cfg).rows.filter((r) => r.phase !== "accumulation");
    const belowPlan = rows.some((r) => r.breakdown.livingSpend < spendingForAge(p, r.age) - 1);
    expect(belowPlan).toBe(true); // guardrails still bite (factor < 1 somewhere)
  });

  it("a flat plan is unchanged (spend holds at target when the market co-operates)", () => {
    const p = base({ people: [P({ currentAge: 60, superBalance: 1_200_000 })], outsideSuper: 300_000, targetSpending: 45_000, guardrails: {} });
    const rows = simulate(p, cfg).rows.filter((r) => r.phase !== "accumulation");
    expect(rows.every((r) => r.breakdown.livingSpend >= 45_000 - 1)).toBe(true); // never trimmed
  });
});

// ── ERN idea — failsafe withdrawal (survives every historical stress era) ──────

describe("failsafeSpend — the tightest never-cut spend that survives all eras", () => {
  it("survives every era at the failsafe, and fails just above it", () => {
    const plan = base({
      people: [P({ currentAge: 55, superBalance: 1_000_000 })],
      outsideSuper: 150_000, retirementAge: 60, targetSpending: 60_000, investmentReturn: 6.5,
    });
    const fs = failsafeSpend(plan, cfg);
    expect(fs.spend).toBeGreaterThan(0);
    // At the failsafe every era lasts; a few % above, at least one fails (it's tight).
    const at = runStressTest({ ...plan, guardrails: undefined, targetSpending: fs.spend }, cfg);
    expect(at.survived).toBe(at.total);
    const above = runStressTest({ ...plan, guardrails: undefined, targetSpending: fs.spend * 1.06 }, cfg);
    expect(above.survived).toBeLessThan(above.total);
    expect(fs.bindingEra).not.toBeNull();
  });

  it("is far below an over-spent plan's actual spend", () => {
    const plan = base({ people: [P({ currentAge: 60, superBalance: 100_000 })], retirementAge: 60, targetSpending: 55_000, investmentReturn: 1 });
    const fs = failsafeSpend(plan, cfg);
    expect(fs.spend).toBeLessThan(fs.currentSpend); // headroom is negative
    expect(fs.headroomPct).toBeLessThan(0);
  });
});
