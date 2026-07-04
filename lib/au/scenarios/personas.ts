// Named persona scenarios with an INDEPENDENT analytical oracle.
//
// Each persona runs through the engine (`simulate`) and, separately, has its key
// values re-derived from first principles in ./reference (closed-form maths + the
// published Age Pension formula — NOT the engine's code path). `evaluatePersona`
// returns both figures side by side with the full derivation ("workings"), so the
// same data drives the Vitest assertions AND the auditor-facing admin view.

import { simulate } from "../simulate";
import { fmtCurrency } from "../format";
import type { EngineConfig } from "../config";
import {
  DEFAULT_PLAN,
  startingSuperBalances,
  type Household,
  type MortgageDetail,
  type Person,
  type PropertyDetail,
  type RetirementPlan,
} from "../types";
import * as ref from "./reference";

const m = (n: number) => fmtCurrency(Math.round(n));

export interface CheckpointResult {
  label: string; // "Super at retirement"
  point: string; // "Age 67"
  source: string; // where the EXPECTED value comes from (independent)
  workings: string; // the derivation with the actual numbers plugged in
  expected: number | string;
  actual: number | string; // the engine's value
  tolerance: number; // dollars ($0 for exact/text match)
  pass: boolean;
}

export interface PersonaReport {
  key: string;
  name: string;
  blurb: string;
  covers: string[]; // permutation tags this persona exercises
  assumptions: string[];
  inputs: { label: string; value: string }[];
  checkpoints: CheckpointResult[];
  allPass: boolean;
}

function moneyCheck(
  label: string, point: string, source: string, workings: string,
  expected: number, actual: number, tolerance = 1,
): CheckpointResult {
  return { label, point, source, workings, expected, actual, tolerance, pass: Math.abs(expected - actual) <= tolerance };
}

// Shared: derive the first-year Age Pension from the published two-test formula
// and describe every step, then compare to the engine's figure.
function pensionCheckpoint(
  household: Household, homeowner: boolean, assessableSuper: number, assessableOutside: number,
  propertyEquity: number, rentAssessable: number, actual: number, config: EngineConfig,
): CheckpointResult {
  const financial = assessableSuper + assessableOutside;
  const assess = financial + propertyEquity;
  const pen = ref.agePension(
    { household, homeowner, assessableAssets: assess, financialAssets: financial, otherIncome: rentAssessable },
    config,
  );
  const side = household === "single" ? config.agePension.single : config.agePension.couple;
  const freeArea = homeowner ? side.assetsFreeArea.homeowner : side.assetsFreeArea.nonHomeowner;
  const assetsTest = Math.max(0, side.maxAnnual - Math.max(0, assess - freeArea) * config.agePension.assetsTaperPerDollar);
  const deemed = ref.deemedIncome(financial, household, config);
  const income = deemed + rentAssessable;
  const incomeTest = Math.max(0, side.maxAnnual - Math.max(0, income - side.incomeFreeAreaAnnual) * config.agePension.incomeTaperPerDollar);

  const workings =
    `Assessable assets = super + outside${propertyEquity ? " + investment-property equity" : ""} = ${m(assess)} (family home exempt${homeowner ? "" : "; renter"}). ` +
    `ASSETS test: ${m(side.maxAnnual)} max − max(0, ${m(assess)} − ${m(freeArea)} free area) × $${config.agePension.assetsTaperPerDollar.toFixed(3)}/$ = ${m(assetsTest)}. ` +
    `INCOME test: deemed on financial ${m(financial)} = ${m(deemed)}${rentAssessable ? ` + net rent ${m(rentAssessable)} (actual, not deemed)` : ""} = ${m(income)}; ${m(side.maxAnnual)} − max(0, ${m(income)} − ${m(side.incomeFreeAreaAnnual)} free area) × ${config.agePension.incomeTaperPerDollar}/$ = ${m(incomeTest)}. ` +
    `Pension = the LOWER of the two = ${pen.binding.toUpperCase()} test → ${m(pen.annual)}.`;

  return moneyCheck(
    `Age Pension, first year (${pen.binding}-test binding)`,
    `Age ${config.agePensionAge}`,
    "Services Australia income & assets tests — the lower applies (independent formula)",
    workings, Math.round(pen.annual), Math.round(actual),
  );
}

function superCheckpoint(
  people: { name: string; person: Person }[], nomReturn: number, infl: number, years: number,
  actual: number, config: EngineConfig,
): CheckpointResult {
  const et = config.superEarningsTaxAccumulation;
  const feePct = config.fees?.adminInvestmentPct ?? 0;
  const deduction = (config.fees?.fixedAdminAnnual ?? 0) + (config.fees?.insuranceAnnual ?? 0);
  const g = ref.realRate(nomReturn * (1 - et) - feePct, infl);
  let total = 0;
  const parts: string[] = [];
  for (const { name, person } of people) {
    const c = ref.netAnnualContribution(
      person.salary, config.sgRate, person.voluntaryConcessional, config.concessionalCap,
      config.contributionsTax, person.voluntaryNonConcessional, config.nonConcessionalCap,
    );
    const fv = ref.superBalanceAt(person.superBalance, c, nomReturn, infl, et, years, feePct, deduction);
    total += fv;
    parts.push(
      `${name}: B₀ ${m(person.superBalance)}, net contribution min($${person.salary.toLocaleString()}×${(config.sgRate * 100).toFixed(0)}%, cap)×(1−${(config.contributionsTax * 100).toFixed(0)}%) = ${m(c)}/yr, less ${m(deduction)} fees → ${m(fv)}`,
    );
  }
  const workings =
    `Add-then-grow closed form, real growth g = (${nomReturn}%×(1−${(et * 100).toFixed(0)}% earnings tax) − ${feePct}% fee) = ${(g * 100).toFixed(2)}%, over ${years} years. ` +
    parts.join("; ") + (people.length > 1 ? `; combined ${m(total)}.` : ".");
  return moneyCheck(
    "Super at retirement", `Age ${config.agePensionAge}`,
    "Closed-form geometric accumulation — independent of the engine's year loop",
    workings, Math.round(total), Math.round(actual),
  );
}

function outsideCheckpoint(
  opening: number, savings: number, nomReturn: number, infl: number, years: number,
  actual: number, config: EngineConfig,
): CheckpointResult {
  const exp = ref.outsideBalanceAt(opening, savings, nomReturn, infl, years);
  return moneyCheck(
    "Outside super at retirement", `Age ${config.agePensionAge}`,
    "Closed-form FV (no earnings tax) — independent",
    `${m(opening)} opening + ${m(savings)}/yr, growth ${nomReturn}% real, over ${years} years → ${m(exp)}.`,
    Math.round(exp), Math.round(actual),
  );
}

function propertyCheckpoints(
  p: PropertyDetail, years: number, row: { propertyEquity: number; rentIncome: number },
  config: EngineConfig,
): CheckpointResult[] {
  const v = ref.propertyValueAt(p, years);
  const eq = ref.propertyNetEquity(p, years);
  const rent = ref.propertyNetRent(p, years);
  return [
    moneyCheck(
      "Investment-property equity", `Age ${config.agePensionAge}`,
      "Independent: value grown at real rate, less the secured loan",
      `Value ${m(p.value)}×(1+${p.growthReal}%)^${years} = ${m(v)}, less ${m(p.loanBalance)} loan → ${m(eq)}.`,
      Math.round(eq), Math.round(row.propertyEquity),
    ),
    moneyCheck(
      "Net rent (investment property)", `Age ${config.agePensionAge}`,
      "Independent: gross rent less costs & loan interest",
      `${m(v)}×${p.grossYield}% gross ×(1−${p.costRatio}% costs) − ${m(p.loanBalance)}×${p.loanRate}% interest → ${m(rent)}.`,
      Math.round(rent), Math.round(row.rentIncome),
    ),
  ];
}

function finish(report: Omit<PersonaReport, "allPass">): PersonaReport {
  return { ...report, allPass: report.checkpoints.every((c) => c.pass) };
}

// ── Solo Sandra ──────────────────────────────────────────────────────────────
function soloSandra(config: EngineConfig): PersonaReport {
  const person: Person = { currentAge: 60, superBalance: 300_000, salary: 90_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 };
  const plan: RetirementPlan = {
    ...DEFAULT_PLAN, household: "single", people: [person], superMode: "individual",
    homeowner: true, outsideSuper: 50_000, annualOutsideSavings: 5_000,
    retirementAge: 67, spendingMode: "flat", targetSpending: 45_000,
    investmentReturn: 6, inflation: 0, lifeExpectancy: 90,
  };
  const r = simulate(plan, config);
  const years = 67 - 60;
  const row = r.rows.find((x) => x.age === 67)!;

  return finish({
    key: "solo-sandra",
    name: "Solo Sandra",
    blurb: "Single homeowner who retires exactly at Age Pension age.",
    covers: ["Single", "Homeowner", "Standard retirement", "Assets-test binding", "Part pension"],
    assumptions: [
      "All figures in today's dollars — inflation set to 0%, so today's $ = nominal and the closed forms are exact.",
      "Retires at Age Pension age (67), so the first pension year's assessable assets equal her closed-form retirement balances (no drawdown to model first).",
      "Constant salary, contributions under the concessional cap, so the geometric closed form applies.",
      `Reference data: FY${config.financialYear} config seed.`,
    ],
    inputs: [
      { label: "Household", value: "Single" },
      { label: "Age now → retire", value: "60 → 67" },
      { label: "Super today", value: `${m(300_000)}` },
      { label: "Salary", value: `${m(90_000)}/yr (Super Guarantee only)` },
      { label: "Outside super", value: `${m(50_000)} + ${m(5_000)}/yr` },
      { label: "Home", value: "Owner (no mortgage)" },
      { label: "Return / inflation", value: "6% / 0%" },
      { label: "Spending", value: `${m(45_000)}/yr flat` },
    ],
    checkpoints: [
      superCheckpoint([{ name: "Sandra", person }], 6, 0, years, row.totalSuper, config),
      outsideCheckpoint(50_000, 5_000, 6, 0, years, row.outside, config),
      pensionCheckpoint("single", true, row.totalSuper, row.outside, 0, 0, row.agePension, config),
    ],
  });
}

// ── Coupled Craig & Kim ──────────────────────────────────────────────────────
function coupledCraigKim(config: EngineConfig): PersonaReport {
  const craig: Person = { currentAge: 60, superBalance: 250_000, salary: 80_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 };
  const kim: Person = { currentAge: 60, superBalance: 150_000, salary: 60_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 };
  const plan: RetirementPlan = {
    ...DEFAULT_PLAN, household: "couple", people: [craig, kim], superMode: "individual",
    homeowner: false, outsideSuper: 60_000, annualOutsideSavings: 4_000,
    retirementAge: 67, spendingMode: "flat", targetSpending: 55_000,
    investmentReturn: 6, inflation: 0, lifeExpectancy: 92,
  };
  const r = simulate(plan, config);
  const years = 67 - 60;
  const row = r.rows.find((x) => x.age === 67)!;

  return finish({
    key: "coupled-craig-kim",
    name: "Coupled Craig & Kim",
    blurb: "A renting couple with individual super, retiring at Age Pension age.",
    covers: ["Couple", "Individual super", "Renter", "Income-test binding", "Part pension"],
    assumptions: [
      "All figures in today's dollars (inflation 0%).",
      "Both retire at Age Pension age (67).",
      "They rent — the higher non-homeowner assets free area lets the INCOME test bind (the opposite of Sandra), exercising the other side of the means test.",
      `Reference data: FY${config.financialYear} config seed.`,
    ],
    inputs: [
      { label: "Household", value: "Couple (individual super)" },
      { label: "Ages now → retire", value: "60 & 60 → 67" },
      { label: "Super today", value: `Craig ${m(250_000)} · Kim ${m(150_000)}` },
      { label: "Salaries", value: `Craig ${m(80_000)} · Kim ${m(60_000)} (SG only)` },
      { label: "Outside super", value: `${m(60_000)} + ${m(4_000)}/yr` },
      { label: "Home", value: "Renting" },
      { label: "Return / inflation", value: "6% / 0%" },
      { label: "Spending", value: `${m(55_000)}/yr flat` },
    ],
    checkpoints: [
      superCheckpoint([{ name: "Craig", person: craig }, { name: "Kim", person: kim }], 6, 0, years, row.totalSuper, config),
      outsideCheckpoint(60_000, 4_000, 6, 0, years, row.outside, config),
      pensionCheckpoint("couple", false, row.totalSuper, row.outside, 0, 0, row.agePension, config),
    ],
  });
}

// ── Bridging Ben ─────────────────────────────────────────────────────────────
function bridgingBen(config: EngineConfig): PersonaReport {
  const person: Person = { currentAge: 50, superBalance: 500_000, salary: 100_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 };
  const plan: RetirementPlan = {
    ...DEFAULT_PLAN, household: "single", people: [person], superMode: "individual",
    homeowner: true, outsideSuper: 300_000, annualOutsideSavings: 10_000,
    retirementAge: 55, spendingMode: "flat", targetSpending: 45_000,
    investmentReturn: 6, inflation: 0, lifeExpectancy: 90,
  };
  const r = simulate(plan, config);
  const years = 55 - 50;
  const row = r.rows.find((x) => x.age === 55)!;
  const bridge = r.rows.filter((x) => x.phase === "bridge");
  const maxBridgeDraw = Math.max(0, ...bridge.map((x) => x.superDrawn));

  return finish({
    key: "bridging-ben",
    name: "Bridging Ben",
    blurb: "Retires early at 55 and bridges to 60 on savings — super stays locked.",
    covers: ["Single", "Early retirement", "Bridge phase", "Homeowner"],
    assumptions: [
      "Today's dollars (inflation 0%).",
      "Retires at 55, before preservation age (60) — the ‘bridge’ years must run entirely off outside-super savings; super is inaccessible.",
      `Reference data: FY${config.financialYear} config seed.`,
    ],
    inputs: [
      { label: "Household", value: "Single" }, { label: "Age now → retire", value: "50 → 55 (early)" },
      { label: "Super today", value: `${m(500_000)}` }, { label: "Salary", value: `${m(100_000)}/yr` },
      { label: "Outside super", value: `${m(300_000)} + ${m(10_000)}/yr` }, { label: "Home", value: "Owner" },
      { label: "Return / inflation", value: "6% / 0%" }, { label: "Spending", value: `${m(45_000)}/yr` },
    ],
    checkpoints: [
      superCheckpoint([{ name: "Ben", person }], 6, 0, years, row.totalSuper, config),
      outsideCheckpoint(300_000, 10_000, 6, 0, years, row.outside, config),
      moneyCheck(
        "Super preserved through the bridge", "Ages 55–59",
        "Super is locked until preservation age (60) — the engine must draw $0",
        `The most drawn from super across the bridge years was ${m(maxBridgeDraw)} — it must be $0 because super is inaccessible before 60.`,
        0, maxBridgeDraw,
      ),
    ],
  });
}

// ── Landlord Lena ────────────────────────────────────────────────────────────
function landlordLena(config: EngineConfig): PersonaReport {
  const person: Person = { currentAge: 60, superBalance: 350_000, salary: 90_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 };
  const prop: PropertyDetail = { value: 500_000, growthReal: 2, grossYield: 4.5, costRatio: 28, loanBalance: 150_000, loanRate: 6, purchasePrice: 300_000, strategy: "hold", sellAtAge: 85 };
  const plan: RetirementPlan = {
    ...DEFAULT_PLAN, household: "single", people: [person], superMode: "individual",
    homeowner: true, outsideSuper: 60_000, annualOutsideSavings: 4_000, investmentProperty: prop,
    retirementAge: 67, spendingMode: "flat", targetSpending: 55_000, investmentReturn: 6, inflation: 0, lifeExpectancy: 90,
  };
  const r = simulate(plan, config);
  const years = 7;
  const row = r.rows.find((x) => x.age === 67)!;

  return finish({
    key: "landlord-lena",
    name: "Landlord Lena",
    blurb: "Single homeowner holding an investment property through retirement.",
    covers: ["Single", "Homeowner", "Investment property", "Rental income", "Part pension"],
    assumptions: [
      "Today's dollars (inflation 0%); retires at Age Pension age (67).",
      "The investment property is assessable: its net equity counts under the assets test and its actual net rent under the income test (not deemed).",
      `Reference data: FY${config.financialYear} config seed.`,
    ],
    inputs: [
      { label: "Household", value: "Single" }, { label: "Age now → retire", value: "60 → 67" },
      { label: "Super today", value: `${m(350_000)}` }, { label: "Salary", value: `${m(90_000)}/yr` },
      { label: "Outside super", value: `${m(60_000)} + ${m(4_000)}/yr` }, { label: "Home", value: "Owner" },
      { label: "Investment property", value: `${m(500_000)}, ${m(150_000)} loan, 4.5% yield` },
      { label: "Return / inflation", value: "6% / 0%" }, { label: "Spending", value: `${m(55_000)}/yr` },
    ],
    checkpoints: [
      superCheckpoint([{ name: "Lena", person }], 6, 0, years, row.totalSuper, config),
      outsideCheckpoint(60_000, 4_000, 6, 0, years, row.outside, config),
      ...propertyCheckpoints(prop, years, row, config),
      pensionCheckpoint("single", true, row.totalSuper, row.outside, ref.propertyNetEquity(prop, years), Math.max(0, ref.propertyNetRent(prop, years)), row.agePension, config),
    ],
  });
}

// ── Interest-only Ian ────────────────────────────────────────────────────────
function interestOnlyIan(config: EngineConfig): PersonaReport {
  const person: Person = { currentAge: 60, superBalance: 400_000, salary: 95_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 };
  const mtg: MortgageDetail = { type: "interest_only", balance: 180_000, interestRate: 6, annualRepayment: 0, payoffAge: null, strategy: "carry" };
  const plan: RetirementPlan = {
    ...DEFAULT_PLAN, household: "single", people: [person], superMode: "individual",
    homeowner: true, outsideSuper: 80_000, annualOutsideSavings: 5_000, mortgage: mtg,
    retirementAge: 67, spendingMode: "flat", targetSpending: 55_000, investmentReturn: 6, inflation: 0, lifeExpectancy: 90,
  };
  const r = simulate(plan, config);
  const years = 7;
  const row = r.rows.find((x) => x.age === 67)!;
  const nominal = ref.mortgageNominalCost(mtg);

  return finish({
    key: "interest-only-ian",
    name: "Interest-only Ian",
    blurb: "Single homeowner carrying an interest-only loan into retirement.",
    covers: ["Single", "Homeowner", "Interest-only mortgage", "Part pension"],
    assumptions: [
      "Today's dollars (inflation 0%); retires at Age Pension age (67).",
      "A home loan doesn't change the Age Pension (the home is exempt and the loan isn't netted); it's an expense on top.",
      "Simplification: the interest-only principal is never repaid in the model (assumed cleared from the estate), so total cost is understated.",
      `Reference data: FY${config.financialYear} config seed.`,
    ],
    inputs: [
      { label: "Household", value: "Single" }, { label: "Age now → retire", value: "60 → 67" },
      { label: "Super today", value: `${m(400_000)}` }, { label: "Salary", value: `${m(95_000)}/yr` },
      { label: "Outside super", value: `${m(80_000)} + ${m(5_000)}/yr` },
      { label: "Home loan", value: `Interest-only, ${m(180_000)} @ 6%` },
      { label: "Return / inflation", value: "6% / 0%" }, { label: "Spending", value: `${m(55_000)}/yr` },
    ],
    checkpoints: [
      superCheckpoint([{ name: "Ian", person }], 6, 0, years, row.totalSuper, config),
      outsideCheckpoint(80_000, 5_000, 6, 0, years, row.outside, config),
      pensionCheckpoint("single", true, row.totalSuper, row.outside, 0, 0, row.agePension, config),
      moneyCheck(
        "Home-loan interest (first year)", "Age 67",
        "Interest-only: balance × rate, deflated to today's dollars (independent)",
        `${m(180_000)} × 6% = ${m(nominal)} nominal ÷ (1+0%)^7 = ${m(nominal)}.`,
        Math.round(nominal), Math.round(row.breakdown.mortgageCost),
      ),
    ],
  });
}

// ── Selling Sam ──────────────────────────────────────────────────────────────
function sellingSam(config: EngineConfig): PersonaReport {
  const person: Person = { currentAge: 60, superBalance: 400_000, salary: 90_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 };
  const prop: PropertyDetail = { value: 500_000, growthReal: 2, grossYield: 4.5, costRatio: 28, loanBalance: 150_000, loanRate: 6, purchasePrice: 300_000, strategy: "sell", sellAtAge: 67 };
  const plan: RetirementPlan = {
    ...DEFAULT_PLAN, household: "single", people: [person], superMode: "individual",
    homeowner: true, outsideSuper: 50_000, annualOutsideSavings: 4_000, investmentProperty: prop,
    retirementAge: 67, spendingMode: "flat", targetSpending: 50_000, investmentReturn: 6, inflation: 0, lifeExpectancy: 90,
  };
  const r = simulate(plan, config);
  const years = 7;
  const row = r.rows.find((x) => x.age === 67)!;
  const v = ref.propertyValueAt(prop, years);
  const cgt = ref.propertyCGT(prop, years);
  const proceeds = ref.propertySaleProceeds(prop, years);

  return finish({
    key: "selling-sam",
    name: "Selling Sam",
    blurb: "Single homeowner who sells the investment property at retirement.",
    covers: ["Single", "Homeowner", "Property sale", "Capital gains tax", "Part pension"],
    assumptions: [
      "Today's dollars (inflation 0%); sells the property at 67.",
      "Sale triggers CGT (50% discount on the gain, resident brackets); net proceeds move into outside-super and become assessable/deemed.",
      "Simplification: CGT is on the discounted gain alone, ignoring other income and SAPTO.",
      `Reference data: FY${config.financialYear} config seed.`,
    ],
    inputs: [
      { label: "Household", value: "Single" }, { label: "Age now → retire", value: "60 → 67" },
      { label: "Super today", value: `${m(400_000)}` }, { label: "Salary", value: `${m(90_000)}/yr` },
      { label: "Outside super", value: `${m(50_000)} + ${m(4_000)}/yr` },
      { label: "Property (sold at 67)", value: `${m(500_000)}, cost base ${m(300_000)}` },
      { label: "Return / inflation", value: "6% / 0%" }, { label: "Spending", value: `${m(50_000)}/yr` },
    ],
    checkpoints: [
      superCheckpoint([{ name: "Sam", person }], 6, 0, years, row.totalSuper, config),
      moneyCheck(
        "Capital gains tax on sale", "Age 67",
        "Independent: 50% discount on the gain, resident tax brackets",
        `Grown value ${m(v)} − cost base ${m(300_000)} = ${m(v - 300_000)} gain × 50% = ${m((v - 300_000) * 0.5)} taxable → CGT ${m(cgt)}.`,
        Math.round(cgt), Math.round(row.breakdown.propertyCgt),
      ),
      moneyCheck(
        "Net sale proceeds", "Age 67",
        "Independent: grown value − loan − CGT",
        `${m(v)} − ${m(150_000)} loan − ${m(cgt)} CGT → ${m(proceeds)}.`,
        Math.round(proceeds), Math.round(row.breakdown.propertyProceeds),
      ),
      pensionCheckpoint("single", true, row.totalSuper, row.outside + proceeds, 0, 0, row.agePension, config),
    ],
  });
}

// ── SMSF Sam & Sue ───────────────────────────────────────────────────────────
function smsfSamSue(config: EngineConfig): PersonaReport {
  const sam: Person = { currentAge: 60, superBalance: 0, salary: 85_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 };
  const sue: Person = { currentAge: 60, superBalance: 0, salary: 65_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 };
  const plan: RetirementPlan = {
    ...DEFAULT_PLAN, household: "couple", people: [sam, sue], superMode: "joint",
    jointSuperBalance: 600_000, jointSuperSplit: 55,
    homeowner: true, outsideSuper: 70_000, annualOutsideSavings: 5_000,
    retirementAge: 67, spendingMode: "flat", targetSpending: 60_000, investmentReturn: 6, inflation: 0, lifeExpectancy: 90,
  };
  const r = simulate(plan, config);
  const years = 7;
  const row = r.rows.find((x) => x.age === 67)!;
  const opening = startingSuperBalances(plan); // splits the joint balance 55/45

  return finish({
    key: "smsf-sam-sue",
    name: "SMSF Sam & Sue",
    blurb: "A couple with one pooled (joint) SMSF balance, split 55/45.",
    covers: ["Couple", "Joint SMSF", "Homeowner", "Part pension"],
    assumptions: [
      "Today's dollars (inflation 0%); both retire at 67.",
      "The pooled SMSF balance is apportioned 55/45 between members; each then accrues their own Super Guarantee contributions.",
      `Reference data: FY${config.financialYear} config seed.`,
    ],
    inputs: [
      { label: "Household", value: "Couple (joint SMSF)" }, { label: "Ages now → retire", value: "60 & 60 → 67" },
      { label: "Pooled super", value: `${m(600_000)} (split 55/45)` },
      { label: "Salaries", value: `Sam ${m(85_000)} · Sue ${m(65_000)}` },
      { label: "Outside super", value: `${m(70_000)} + ${m(5_000)}/yr` }, { label: "Home", value: "Owner" },
      { label: "Return / inflation", value: "6% / 0%" }, { label: "Spending", value: `${m(60_000)}/yr` },
    ],
    checkpoints: [
      superCheckpoint([
        { name: "Sam (55% of pool)", person: { ...sam, superBalance: opening[0] } },
        { name: "Sue (45% of pool)", person: { ...sue, superBalance: opening[1] } },
      ], 6, 0, years, row.totalSuper, config),
      outsideCheckpoint(70_000, 5_000, 6, 0, years, row.outside, config),
      pensionCheckpoint("couple", true, row.totalSuper, row.outside, 0, 0, row.agePension, config),
    ],
  });
}

// ── Capped Carl ──────────────────────────────────────────────────────────────
function cappedCarl(config: EngineConfig): PersonaReport {
  const person: Person = { currentAge: 60, superBalance: 600_000, salary: 300_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 };
  const plan: RetirementPlan = {
    ...DEFAULT_PLAN, household: "single", people: [person], superMode: "individual",
    homeowner: true, outsideSuper: 150_000, annualOutsideSavings: 20_000,
    retirementAge: 67, spendingMode: "flat", targetSpending: 70_000, investmentReturn: 6, inflation: 0, lifeExpectancy: 90,
  };
  const r = simulate(plan, config);
  const years = 7;
  const row = r.rows.find((x) => x.age === 67)!;

  return finish({
    key: "capped-carl",
    name: "Capped Carl",
    blurb: "High earner whose contributions are capped — and too asset-rich for a pension.",
    covers: ["Single", "Homeowner", "Concessional cap hit", "High earner", "Nil pension"],
    assumptions: [
      "Today's dollars (inflation 0%); retires at 67.",
      "Salary $300k × 12% SG = $36k exceeds the $32,500 concessional cap, so contributions are capped — the closed form uses the capped, net-of-15% amount.",
      "GAP DISCLOSURE: Division 293 (extra 15% concessional tax for incomes over $250k) is NOT modelled — the engine and this reference both apply a flat 15%, so a real high earner's super would be lower.",
      `Reference data: FY${config.financialYear} config seed.`,
    ],
    inputs: [
      { label: "Household", value: "Single" }, { label: "Age now → retire", value: "60 → 67" },
      { label: "Super today", value: `${m(600_000)}` }, { label: "Salary", value: `${m(300_000)}/yr (SG capped)` },
      { label: "Outside super", value: `${m(150_000)} + ${m(20_000)}/yr` }, { label: "Home", value: "Owner" },
      { label: "Return / inflation", value: "6% / 0%" }, { label: "Spending", value: `${m(70_000)}/yr` },
    ],
    checkpoints: [
      superCheckpoint([{ name: "Carl", person }], 6, 0, years, row.totalSuper, config),
      outsideCheckpoint(150_000, 20_000, 6, 0, years, row.outside, config),
      pensionCheckpoint("single", true, row.totalSuper, row.outside, 0, 0, row.agePension, config),
    ],
  });
}

// ── Full-pension Fiona ───────────────────────────────────────────────────────
function fullPensionFiona(config: EngineConfig): PersonaReport {
  const person: Person = { currentAge: 66, superBalance: 100_000, salary: 40_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 };
  const plan: RetirementPlan = {
    ...DEFAULT_PLAN, household: "single", people: [person], superMode: "individual",
    homeowner: false, outsideSuper: 20_000, annualOutsideSavings: 0,
    retirementAge: 67, spendingMode: "flat", targetSpending: 30_000, investmentReturn: 6, inflation: 0, lifeExpectancy: 90,
  };
  const r = simulate(plan, config);
  const years = 1;
  const row = r.rows.find((x) => x.age === 67)!;

  return finish({
    key: "full-pension-fiona",
    name: "Full-pension Fiona",
    blurb: "Low-asset renter whose assets sit under the free area — full pension.",
    covers: ["Single", "Renter", "Full pension", "Low assets"],
    assumptions: [
      "Today's dollars (inflation 0%); retires at 67.",
      "Assets are well below the free area, so neither test reduces the pension — she receives the full single rate.",
      `Reference data: FY${config.financialYear} config seed.`,
    ],
    inputs: [
      { label: "Household", value: "Single" }, { label: "Age now → retire", value: "66 → 67" },
      { label: "Super today", value: `${m(100_000)}` }, { label: "Salary", value: `${m(40_000)}/yr` },
      { label: "Outside super", value: `${m(20_000)}` }, { label: "Home", value: "Renting" },
      { label: "Return / inflation", value: "6% / 0%" }, { label: "Spending", value: `${m(30_000)}/yr` },
    ],
    checkpoints: [
      superCheckpoint([{ name: "Fiona", person }], 6, 0, years, row.totalSuper, config),
      outsideCheckpoint(20_000, 0, 6, 0, years, row.outside, config),
      pensionCheckpoint("single", false, row.totalSuper, row.outside, 0, 0, row.agePension, config),
    ],
  });
}

// ── Clearing Clare ───────────────────────────────────────────────────────────
function clearingClare(config: EngineConfig): PersonaReport {
  const person: Person = { currentAge: 60, superBalance: 700_000, salary: 90_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 };
  const mtg: MortgageDetail = { type: "principal_interest", balance: 200_000, interestRate: 6, annualRepayment: 24_000, payoffAge: 75, strategy: "clear_at_retirement" };
  const plan: RetirementPlan = {
    ...DEFAULT_PLAN, household: "single", people: [person], superMode: "individual",
    homeowner: true, outsideSuper: 100_000, annualOutsideSavings: 5_000, mortgage: mtg,
    retirementAge: 67, spendingMode: "flat", targetSpending: 55_000, investmentReturn: 6, inflation: 0, lifeExpectancy: 90,
  };
  const r = simulate(plan, config);
  const years = 7;
  const row = r.rows.find((x) => x.age === 67)!;

  return finish({
    key: "clearing-clare",
    name: "Clearing Clare",
    blurb: "Pays off the home loan with a tax-free super lump sum at retirement.",
    covers: ["Single", "Homeowner", "Clear loan with super", "Part pension"],
    assumptions: [
      "Today's dollars (inflation 0%); retires at 67.",
      "At retirement she draws the $200k loan balance from super (tax-free from 60). This lowers assessable super, so the pension is computed on the reduced balance.",
      `Reference data: FY${config.financialYear} config seed.`,
    ],
    inputs: [
      { label: "Household", value: "Single" }, { label: "Age now → retire", value: "60 → 67" },
      { label: "Super today", value: `${m(700_000)}` }, { label: "Salary", value: `${m(90_000)}/yr` },
      { label: "Outside super", value: `${m(100_000)} + ${m(5_000)}/yr` },
      { label: "Home loan", value: `${m(200_000)} — cleared with super at 67` },
      { label: "Return / inflation", value: "6% / 0%" }, { label: "Spending", value: `${m(55_000)}/yr` },
    ],
    checkpoints: [
      superCheckpoint([{ name: "Clare", person }], 6, 0, years, row.totalSuper, config),
      outsideCheckpoint(100_000, 5_000, 6, 0, years, row.outside, config),
      pensionCheckpoint("single", true, row.totalSuper - mtg.balance, row.outside, 0, 0, row.agePension, config),
    ],
  });
}

export const PERSONAS: ((config: EngineConfig) => PersonaReport)[] = [
  soloSandra, coupledCraigKim, bridgingBen, landlordLena, interestOnlyIan,
  sellingSam, smsfSamSue, cappedCarl, fullPensionFiona, clearingClare,
];

export function evaluatePersonas(config: EngineConfig): PersonaReport[] {
  // These reference personas isolate the accumulation maths with the RG 276
  // living-standards uplift switched off, so their inflation-0 runs give exact
  // closed forms (today's $ = nominal). The two-stage wage/CPI deflator is
  // exercised numerically by the stress suite instead.
  const refConfig = { ...config, livingStandardsGrowthPct: 0 };
  return PERSONAS.map((p) => p(refConfig));
}
