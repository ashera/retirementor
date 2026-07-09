import { describe, it, expect } from "vitest";
import { simulate } from "../../lib/au/simulate";
import { DEFAULT_CONFIG as cfg, minDrawdownRate } from "../../lib/au/config";
import {
  DEFAULT_PLAN,
  startingSuperBalances,
  type MortgageDetail,
  type Person,
  type PropertyDetail,
  type RetirementPlan,
} from "../../lib/au/types";
import * as ref from "../../lib/au/scenarios/reference";

// ── Stress matrix ────────────────────────────────────────────────────────────
// A cartesian sweep across every permutation the app supports. For EACH plan we
// assert universal invariants that must hold no matter the inputs. Any violation
// is a genuine bug in the engine's logic — this is the bug hunt, not a snapshot.

const P = (over: Partial<Person> = {}): Person => ({
  currentAge: 50, superBalance: 400_000, salary: 90_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0, ...over,
});

const households: { name: string; over: Partial<RetirementPlan> }[] = [
  { name: "single", over: { household: "single", people: [P()] } },
  { name: "couple-individual", over: { household: "couple", superMode: "individual", people: [P(), P({ currentAge: 48, superBalance: 250_000, salary: 70_000 })] } },
  { name: "couple-joint", over: { household: "couple", superMode: "joint", people: [P(), P({ currentAge: 48 })], jointSuperBalance: 650_000, jointSuperSplit: 60 } },
  { name: "couple-agegap", over: { household: "couple", superMode: "individual", people: [P(), P({ currentAge: 40, superBalance: 180_000, salary: 60_000 })] } },
];

const retire: { name: string; over: Partial<RetirementPlan> }[] = [
  { name: "early-bridge", over: { retirementAge: 52 } }, // retires before preservation age → bridge
  { name: "at-60", over: { retirementAge: 60 } },
  { name: "drawdown-63", over: { retirementAge: 63 } },
  { name: "at-pension-67", over: { retirementAge: 67 } },
];

const piCarry: MortgageDetail = { type: "principal_interest", balance: 180_000, interestRate: 6, annualRepayment: 20_000, payoffAge: 72, strategy: "carry" };
const ioCarry: MortgageDetail = { type: "interest_only", balance: 200_000, interestRate: 6, annualRepayment: 0, payoffAge: null, strategy: "carry" };
const clear: MortgageDetail = { type: "principal_interest", balance: 150_000, interestRate: 6, annualRepayment: 18_000, payoffAge: 75, strategy: "clear_at_retirement" };

const home: { name: string; over: Partial<RetirementPlan> }[] = [
  { name: "owner", over: { homeowner: true, mortgage: undefined } },
  { name: "renter", over: { homeowner: false, mortgage: undefined } },
  { name: "mortgage-pi", over: { homeowner: true, mortgage: piCarry } },
  { name: "mortgage-io", over: { homeowner: true, mortgage: ioCarry } },
  { name: "mortgage-clear", over: { homeowner: true, mortgage: clear } },
];

const propHold: PropertyDetail = { value: 500_000, growthReal: 2, grossYield: 4.5, costRatio: 28, loanBalance: 180_000, loanRate: 6, purchasePrice: 300_000, strategy: "hold", sellAtAge: 80 };
const propSell: PropertyDetail = { ...propHold, strategy: "sell", sellAtAge: 74 };
const propGeared: PropertyDetail = { ...propHold, loanBalance: 420_000, grossYield: 3 }; // heavily geared → negative cash rent

const property: { name: string; over: Partial<RetirementPlan> }[] = [
  { name: "no-property", over: { investmentProperty: undefined } },
  { name: "property-hold", over: { investmentProperty: propHold } },
  { name: "property-sell", over: { investmentProperty: propSell } },
  { name: "property-geared", over: { investmentProperty: propGeared } },
];

const spending: { name: string; over: Partial<RetirementPlan> }[] = [
  { name: "modest", over: { spendingMode: "flat", targetSpending: 40_000 } },
  { name: "high", over: { spendingMode: "flat", targetSpending: 85_000 } }, // designed to deplete
  { name: "staged", over: { spendingMode: "stages", spendingStages: { goGo: 60_000, slowGo: 50_000, noGo: 42_000, slowGoAge: 75, noGoAge: 85 } } },
];

const inflation: { name: string; over: Partial<RetirementPlan> }[] = [
  { name: "infl-0", over: { inflation: 0 } },
  { name: "infl-2.5", over: { inflation: 2.5 } },
];

function buildPlans(): { name: string; plan: RetirementPlan }[] {
  const out: { name: string; plan: RetirementPlan }[] = [];
  for (const hh of households)
    for (const rt of retire)
      for (const hm of home)
        for (const pr of property)
          for (const sp of spending)
            for (const inf of inflation) {
              const plan: RetirementPlan = {
                ...DEFAULT_PLAN,
                superMode: "individual",
                homeowner: true,
                outsideSuper: 150_000,
                annualOutsideSavings: 6_000,
                investmentReturn: 6,
                returnVolatility: 11,
                lifeExpectancy: 92,
                ...hh.over, ...rt.over, ...hm.over, ...pr.over, ...sp.over, ...inf.over,
              };
              out.push({ name: `${hh.name}/${rt.name}/${hm.name}/${pr.name}/${sp.name}/${inf.name}`, plan });
            }
  return out;
}

// Targeted edges the cartesian salaries don't reach: concessional cap, salary
// sacrifice over the cap, non-concessional contributions, already-retired, and a
// low-asset full-pension renter.
const b0 = (over: Partial<RetirementPlan>): RetirementPlan => ({
  ...DEFAULT_PLAN, household: "single", superMode: "individual", homeowner: true,
  outsideSuper: 100_000, annualOutsideSavings: 0, retirementAge: 67, spendingMode: "flat",
  targetSpending: 45_000, investmentReturn: 6, inflation: 0, lifeExpectancy: 90, ...over,
});
const EDGE: { name: string; plan: RetirementPlan }[] = [
  { name: "edge/high-earner-caps-hit", plan: b0({ people: [P({ currentAge: 50, salary: 300_000, superBalance: 500_000 })] }) },
  { name: "edge/salary-sacrifice-over-cap", plan: b0({ people: [P({ currentAge: 50, salary: 100_000, voluntaryConcessional: 25_000 })] }) },
  { name: "edge/non-concessional", plan: b0({ people: [P({ currentAge: 50, voluntaryNonConcessional: 30_000 })] }) },
  { name: "edge/already-retired", plan: b0({ people: [P({ currentAge: 68 })], retirementAge: 65 }) },
  { name: "edge/full-pension-renter", plan: b0({ people: [P({ currentAge: 66, superBalance: 120_000, salary: 40_000 })], homeowner: false, outsideSuper: 20_000 }) },
];

const PLANS = [...buildPlans(), ...EDGE];
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

describe(`Stress matrix — ${PLANS.length} plans, universal invariants`, () => {
  it("every year's ledger reconciles (opening + flows = closing) and chains", () => {
    const fails: string[] = [];
    for (const { name, plan } of PLANS) {
      const r = simulate(plan, cfg);
      for (const row of r.rows) {
        const b = row.breakdown;
        if (!near(row.total, row.totalSuper + row.outside)) fails.push(`${name} @${row.age}: total≠super+outside`);
        if (row.phase === "accumulation") {
          if (!near(b.openingSuper + b.contribNet + b.ttrBenefit - b.fees + b.superGrowth, b.closingSuper)) fails.push(`${name} @${row.age}: accum super`);
          if (!near(b.openingOutside + b.savings + b.outsideGrowth, b.closingOutside)) fails.push(`${name} @${row.age}: accum outside`);
        } else {
          if (!near(b.openingSuper - b.mortgageCleared - row.superDrawn - b.fees + b.superGrowth, b.closingSuper)) fails.push(`${name} @${row.age}: ret super`);
        }
      }
      // The stock is re-expressed wage-real → CPI-real at the retirement boundary
      // (RG 276 two-stage), so closing×wedge chains to the next opening there.
      const n = Math.max(0, Math.round(plan.retirementAge - plan.people[0].currentAge));
      const wedge = Math.pow((1 + (plan.inflation + cfg.livingStandardsGrowthPct) / 100) / (1 + plan.inflation / 100), n);
      for (let i = 0; i < r.rows.length - 1; i++) {
        const f = r.rows[i].phase === "accumulation" && r.rows[i + 1].phase !== "accumulation" ? wedge : 1;
        if (!near(r.rows[i].breakdown.closingSuper * f, r.rows[i + 1].breakdown.openingSuper)) fails.push(`${name} chain super @${r.rows[i].age}`);
        if (!near(r.rows[i].breakdown.closingOutside * f, r.rows[i + 1].breakdown.openingOutside)) fails.push(`${name} chain outside @${r.rows[i].age}`);
      }
    }
    expect(fails.slice(0, 25)).toEqual([]);
  });

  it("balances, pension and drawdowns are never negative", () => {
    const fails: string[] = [];
    for (const { name, plan } of PLANS) {
      const r = simulate(plan, cfg);
      for (const row of r.rows) {
        if (row.totalSuper < -1) fails.push(`${name} @${row.age}: super ${row.totalSuper.toFixed(0)}`);
        if (row.outside < -1) fails.push(`${name} @${row.age}: outside ${row.outside.toFixed(0)}`);
        if (row.agePension < -1) fails.push(`${name} @${row.age}: pension ${row.agePension.toFixed(0)}`);
        if (row.superDrawn < -1) fails.push(`${name} @${row.age}: superDrawn`);
        if (row.outsideDrawn < -1) fails.push(`${name} @${row.age}: outsideDrawn`);
        if (row.propertyEquity < -1) fails.push(`${name} @${row.age}: equity`);
      }
    }
    expect(fails.slice(0, 25)).toEqual([]);
  });

  it("funded retirement years: Age Pension + net rent + savings drawdown = spending", () => {
    const fails: string[] = [];
    for (const { name, plan } of PLANS) {
      const r = simulate(plan, cfg);
      for (const row of r.rows) {
        if (row.phase === "accumulation" || !row.funded) continue;
        const b = row.breakdown;
        const openingTotal = b.openingSuper + b.openingOutside;
        const closingTotal = b.closingSuper + b.closingOutside;
        const growth = b.superGrowth + b.outsideGrowth;
        const netDrawdown = openingTotal + growth + b.propertyProceeds - b.mortgageCleared - b.fees - b.outsideTax - closingTotal;
        if (!near(b.agePension + b.rentIncome + netDrawdown, row.spending, 2)) {
          fails.push(`${name} @${row.age}: pension ${b.agePension.toFixed(0)} + rent ${b.rentIncome.toFixed(0)} + draw ${netDrawdown.toFixed(0)} ≠ spend ${row.spending.toFixed(0)}`);
        }
      }
    }
    expect(fails.slice(0, 25)).toEqual([]);
  });

  it("super & outside at retirement match the INDEPENDENT closed form", () => {
    const fails: string[] = [];
    for (const { name, plan } of PLANS) {
      const r = simulate(plan, cfg);
      const n = Math.max(0, Math.round(plan.retirementAge - plan.people[0].currentAge));
      const opening = startingSuperBalances(plan);
      // Accumulation is deflated by WAGE inflation (RG 276 two-stage): CPI + the
      // living-standards uplift.
      const wageInfl = plan.inflation + cfg.livingStandardsGrowthPct;
      // Accumulation is wage-real; at retirement the stock is re-expressed to
      // CPI-real (RG 276 two-stage) — scale the closed form by the same wedge.
      const wedge = Math.pow((1 + wageInfl / 100) / (1 + plan.inflation / 100), n);
      let expSuper = 0;
      plan.people.forEach((p, i) => {
        const c = ref.netAnnualContribution(p.salary, cfg.sgRate, p.voluntaryConcessional, cfg.concessionalCap, cfg.contributionsTax, p.voluntaryNonConcessional, cfg.nonConcessionalCap, cfg.div293Threshold, cfg.div293ExtraTaxRate);
        expSuper += ref.superBalanceAt(opening[i], c, plan.investmentReturn, wageInfl, cfg.superEarningsTaxAccumulation, n, cfg.fees.adminInvestmentPct, cfg.fees.fixedAdminAnnual + cfg.fees.insuranceAnnual);
      });
      const expOutside = ref.outsideBalanceAt(plan.outsideSuper, plan.annualOutsideSavings, plan.investmentReturn, wageInfl, n);
      if (!near(r.superAtRetirement, expSuper * wedge, 1)) fails.push(`${name}: super ${r.superAtRetirement.toFixed(0)} vs ref ${(expSuper * wedge).toFixed(0)}`);
      const retRow = r.rows.find((x) => x.age === Math.max(...plan.people.map((p) => p.currentAge)) + n)!;
      if (retRow && !near(retRow.outside, expOutside * wedge, 1)) fails.push(`${name}: outside ${retRow.outside.toFixed(0)} vs ref ${(expOutside * wedge).toFixed(0)}`);
    }
    expect(fails.slice(0, 25)).toEqual([]);
  });

  it("held-property equity & net rent match the INDEPENDENT formulas at retirement", () => {
    const valueAt = (p: PropertyDetail, t: number) => p.value * Math.pow(1 + p.growthReal / 100, t);
    const equity = (p: PropertyDetail, t: number) => Math.max(0, valueAt(p, t) - p.loanBalance);
    const rent = (p: PropertyDetail, t: number) => valueAt(p, t) * (p.grossYield / 100) * (1 - p.costRatio / 100) - p.loanBalance * (p.loanRate / 100);
    const fails: string[] = [];
    for (const { name, plan } of PLANS) {
      const p = plan.investmentProperty;
      if (!p || p.strategy !== "hold") continue;
      const r = simulate(plan, cfg);
      const startOldest = Math.max(...plan.people.map((x) => x.currentAge));
      const n = Math.max(0, Math.round(plan.retirementAge - plan.people[0].currentAge));
      const retRow = r.rows.find((x) => x.age === startOldest + n);
      if (!retRow) continue;
      if (!near(retRow.propertyEquity, equity(p, n), 1)) fails.push(`${name}: equity ${retRow.propertyEquity.toFixed(0)} vs ${equity(p, n).toFixed(0)}`);
      if (!near(retRow.rentIncome, rent(p, n), 1)) fails.push(`${name}: rent ${retRow.rentIncome.toFixed(0)} vs ${rent(p, n).toFixed(0)}`);
    }
    expect(fails.slice(0, 25)).toEqual([]);
  });

  it("carried mortgage cost matches nominal ÷ (1+inflation)^t", () => {
    const fails: string[] = [];
    for (const { name, plan } of PLANS) {
      const mtg = plan.mortgage;
      if (!mtg || mtg.strategy !== "carry") continue;
      const r = simulate(plan, cfg);
      const nominal = mtg.type === "interest_only" ? mtg.balance * (mtg.interestRate / 100) : mtg.annualRepayment;
      for (const row of r.rows) {
        if (row.phase === "accumulation") continue;
        const t = row.age - Math.max(...plan.people.map((x) => x.currentAge));
        const active = mtg.type === "interest_only" || (mtg.payoffAge != null && row.age < mtg.payoffAge);
        const exp = active ? nominal / Math.pow(1 + plan.inflation / 100, t) : 0;
        if (!near(row.breakdown.mortgageCost, exp, 1)) {
          fails.push(`${name} @${row.age}: mortgageCost ${row.breakdown.mortgageCost.toFixed(0)} vs ${exp.toFixed(0)}`);
          break;
        }
      }
    }
    expect(fails.slice(0, 25)).toEqual([]);
  });

  it("Age Pension every retirement year matches the INDEPENDENT two-test formula", () => {
    const fails: string[] = [];
    for (const { name, plan } of PLANS) {
      const r = simulate(plan, cfg);
      const startOldest = Math.max(...plan.people.map((p) => p.currentAge));
      const youngestNow = Math.min(...plan.people.map((p) => p.currentAge));
      for (const row of r.rows) {
        if (row.phase === "accumulation" || row.age < cfg.agePensionAge) continue;
        // Reconstruct only when the whole super pool is accessible (youngest ≥ 60),
        // so accessible super = total super (post any clear-at-retirement draw).
        const youngestAge = youngestNow + (row.age - startOldest);
        if (youngestAge < cfg.preservationAge) continue;
        const b = row.breakdown;
        const financial = row.totalSuper - b.mortgageCleared + row.outside + b.propertyProceeds;
        const assess = financial + row.propertyEquity;
        const p = ref.agePension(
          { household: plan.household, homeowner: plan.homeowner, assessableAssets: assess, financialAssets: financial, otherIncome: Math.max(0, row.rentIncome) },
          cfg,
        );
        if (!near(row.agePension, p.annual, 1)) {
          fails.push(`${name} @${row.age}: pension ${row.agePension.toFixed(0)} vs ref ${p.annual.toFixed(0)} (assess ${assess.toFixed(0)})`);
          break;
        }
      }
    }
    expect(fails.slice(0, 25)).toEqual([]);
  });

  it("super is untouched (and loan not cleared) before preservation age — bridge phase", () => {
    const fails: string[] = [];
    for (const { name, plan } of PLANS) {
      const r = simulate(plan, cfg);
      for (const row of r.rows) {
        if (row.phase !== "bridge") continue;
        if (row.superDrawn > 1) fails.push(`${name} @${row.age}: drew ${row.superDrawn.toFixed(0)} from locked super`);
        if (row.breakdown.mortgageCleared > 1) fails.push(`${name} @${row.age}: cleared loan from locked super`);
      }
    }
    expect(fails.slice(0, 25)).toEqual([]);
  });

  it("minimum drawdown is enforced each retirement year (single)", () => {
    const fails: string[] = [];
    for (const { name, plan } of PLANS) {
      if (plan.people.length !== 1) continue;
      const r = simulate(plan, cfg);
      for (const row of r.rows) {
        if (row.phase === "accumulation" || row.age < cfg.preservationAge) continue;
        const accessible = row.totalSuper - row.breakdown.mortgageCleared;
        if (accessible < 1) continue;
        const minDraw = accessible * minDrawdownRate(row.age, cfg);
        if (row.superDrawn + 1 < Math.min(minDraw, accessible)) {
          fails.push(`${name} @${row.age}: superDrawn ${row.superDrawn.toFixed(0)} < min ${Math.min(minDraw, accessible).toFixed(0)}`);
          break;
        }
      }
    }
    expect(fails.slice(0, 25)).toEqual([]);
  });

  it("depletion flag is consistent (lasts ⇔ every year funded)", () => {
    const fails: string[] = [];
    for (const { name, plan } of PLANS) {
      const r = simulate(plan, cfg);
      const anyShort = r.rows.some((x) => !x.funded);
      if (r.lastsToLifeExpectancy === anyShort) fails.push(`${name}: lasts=${r.lastsToLifeExpectancy} but anyShort=${anyShort}`);
    }
    expect(fails.slice(0, 25)).toEqual([]);
  });
});
