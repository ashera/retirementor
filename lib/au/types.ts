// Domain types for the Australian retirement planner.

import type { SuperFees } from "./config";

export type Household = "single" | "couple";

export interface Person {
  currentAge: number;
  superBalance: number; // current super balance
  salary: number; // gross annual salary (drives Super Guarantee)
  voluntaryConcessional: number; // annual salary-sacrifice / personal deductible contributions
  voluntaryNonConcessional: number; // annual after-tax contributions
}

// How retirement spending is modelled over time.
//   flat   — one amount for the whole of retirement
//   stages — the "go-go / slow-go / no-go" approach: spending steps down as you age
export type SpendingMode = "flat" | "stages";

export interface SpendingStages {
  goGo: number; // active early years (from retirement)
  slowGo: number; // slowing down
  noGo: number; // later years
  slowGoAge: number; // age the slow-go phase begins
  noGoAge: number; // age the no-go phase begins
}

/** Sensible default stages derived from a flat amount (85% then 70%, at ages 75/85). */
export function deriveStages(base: number): SpendingStages {
  const k = (x: number) => Math.round(x / 1000) * 1000;
  return {
    goGo: k(base),
    slowGo: k(base * 0.85),
    noGo: k(base * 0.7),
    slowGoAge: 75,
    noGoAge: 85,
  };
}

// A guided, category-by-category budget the user builds to arrive at their
// target spend. Optional — plans made before this feature simply won't have one.
export type BudgetLifestyle = "modest" | "comfortable" | "premium";

// Home tenure. ASFA assumes you own outright, so "own" and "mortgage" share the
// same owner housing costs (rates, insurance, upkeep); "mortgage" adds a loan on
// top (RetirementPlan.mortgage). "rent" uses ASFA's (higher) renter housing.
export type HomeTenure = "own" | "mortgage" | "rent";

export interface RetirementBudget {
  tenure: HomeTenure;
  lifestyle: BudgetLifestyle; // preset the categories were last seeded from
  categories: Record<string, number>; // category key → annual $ (household-level)
  applyPhases: boolean; // seed spendingStages via the retirement spending smile
}

// A home loan carried into retirement — a temporary expense on top of the
// steady-state (ASFA-style) budget.
//   principal_interest — fixed repayment that clears the loan by `payoffAge`
//   interest_only      — pay interest (balance × rate) only; principal persists
export type MortgageType = "principal_interest" | "interest_only";

// What the household plans to do about the loan.
//   carry              — keep paying from retirement income until payoff (or life)
//   clear_at_retirement — pay the balance off with a tax-free super lump sum at
//                         retirement (lowers assessable assets → can lift the pension)
export type MortgageStrategy = "carry" | "clear_at_retirement";

export interface MortgageDetail {
  type: MortgageType;
  balance: number; // amount still owing (today's dollars)
  interestRate: number; // annual interest rate, percent (drives interest-only cost)
  annualRepayment: number; // P&I fixed repayment, today's-nominal dollars
  payoffAge: number | null; // P&I: oldest person's age at payoff; interest-only: null
  strategy: MortgageStrategy;
}

// The principal home (PPOR), modelled as an asset for the household's net-worth
// picture. Unlike an investment property it is EXEMPT from the Age Pension assets
// test and produces no assessable income, so its value does not feed the engine
// (the loan is handled separately via MortgageDetail). Kept as a first-class
// object so the home can later gain downsizing/equity-release behaviour.
export interface HomeDetail {
  value: number; // current market value (today's dollars)
  growthReal: number; // annual real capital growth, percent
  // Optional downsize: at `atAge`, free up `release` of equity (staying a
  // homeowner). `toSuper` of it goes into super as a downsizer contribution
  // (assessable but tax-advantaged); the rest lands in outside savings (deemed).
  downsize?: { atAge: number; release: number; toSuper: number };
  // Optional sell-up-and-rent: at `atAge`, release all `release` equity into
  // savings, become a NON-homeowner (higher assets-test threshold) and pay
  // `rentPerYear` from then on. Any mortgage is treated as repaid from proceeds.
  sellAndRent?: { atAge: number; release: number; rentPerYear: number };
}

// An investment property held into retirement. Unlike the home it is assessable
// for the Age Pension (net equity under the assets test; actual net rent under
// the income test — not deemed). The secured loan is modelled interest-only.
export interface PropertyDetail {
  name?: string; // optional user label (e.g. "Beach house"); falls back to "Property N"
  value: number; // current market value (today's dollars)
  growthReal: number; // annual real capital growth, percent
  grossYield: number; // gross rent as a percent of value
  costRatio: number; // percent of gross rent lost to expenses + vacancy
  loanBalance: number; // loan secured against this property (interest-only)
  loanRate: number; // loan interest rate, percent
  purchasePrice: number; // cost base for CGT (today's-dollar approximation)
  strategy: "hold" | "sell"; // hold for income, or sell at an age
  sellAtAge: number; // oldest person's age at sale (when strategy === "sell")
}

// How a couple's super is held. "joint" = a single pooled SMSF balance entered as
// one figure (still split across members internally so each member's contributions,
// preservation-age access and means-test treatment apply).
export type SuperMode = "individual" | "joint";

export interface RetirementPlan {
  household: Household;
  people: Person[]; // 1 entry for single, 2 for couple
  superMode: SuperMode; // couples only; single households are always individual
  jointSuperBalance: number; // combined balance used when superMode === "joint"
  jointSuperSplit: number; // person[0]'s % share of the joint balance (0–100)
  homeowner: boolean; // principal home is exempt from the assets test
  outsideSuper: number; // combined non-super investments today (funds an early-retirement bridge)
  annualOutsideSavings: number; // added to outside-super each working year
  retirementAge: number; // age of person[0] when household stops working
  spendingMode: SpendingMode;
  targetSpending: number; // flat annual spend (and the go-go base when deriving stages)
  spendingStages: SpendingStages; // used when spendingMode === "stages"
  investmentReturn: number; // nominal annual return, percent
  returnVolatility: number; // annual return standard deviation, percent (for Monte Carlo)
  inflation: number; // annual inflation, percent
  lifeExpectancy: number; // simulate until the oldest person reaches this age
  fees?: SuperFees; // optional per-plan fee override (else the config default applies)
  budget?: RetirementBudget; // optional guided budget that produced targetSpending
  mortgage?: MortgageDetail; // optional home loan carried into retirement
  home?: HomeDetail; // the principal home as an asset (exempt; net-worth context only)
  workIncome?: { perYear: number; untilAge: number }; // part-time work in early retirement (offsets drawdown; income-test assessable net of the Work Bonus)
  investmentProperties?: PropertyDetail[]; // income-producing properties (source of truth)
  investmentProperty?: PropertyDetail; // DEPRECATED legacy single property — read via getInvestmentProperties()
  // Which optional sections the user has explicitly answered in the wizard (incl.
  // "none"), so plan-completeness can reach 100% honestly and the dashboard ring
  // matches the wizard. Not used by the engine.
  answered?: { contributions?: boolean; outside?: boolean; property?: boolean };
}

/** All investment properties on a plan, tolerating the legacy single-property
 *  field. An explicit `investmentProperties` (even empty) wins; otherwise the
 *  deprecated `investmentProperty` is treated as a one-element list. */
export function getInvestmentProperties(plan: RetirementPlan): PropertyDetail[] {
  if (plan.investmentProperties) return plan.investmentProperties;
  return plan.investmentProperty ? [plan.investmentProperty] : [];
}

/** Whether the plan has at least one investment property. */
export function hasInvestmentProperty(plan: RetirementPlan): boolean {
  return getInvestmentProperties(plan).length > 0;
}

/** Household spending for a given age, honouring the flat/staged mode. */
export function spendingForAge(plan: RetirementPlan, age: number): number {
  if (plan.spendingMode !== "stages") return plan.targetSpending;
  const s = plan.spendingStages;
  if (age >= s.noGoAge) return s.noGo;
  if (age >= s.slowGoAge) return s.slowGo;
  return s.goGo;
}

/** Starting super per member — a joint SMSF balance is apportioned by jointSuperSplit. */
export function startingSuperBalances(plan: RetirementPlan): number[] {
  if (plan.superMode === "joint" && plan.people.length > 1) {
    if (plan.people.length === 2) {
      const shareA = Math.min(1, Math.max(0, (plan.jointSuperSplit ?? 50) / 100));
      return [
        plan.jointSuperBalance * shareA,
        plan.jointSuperBalance * (1 - shareA),
      ];
    }
    const each = plan.jointSuperBalance / plan.people.length;
    return plan.people.map(() => each);
  }
  return plan.people.map((p) => p.superBalance);
}

/** Combined starting super today. */
export function totalStartingSuper(plan: RetirementPlan): number {
  return startingSuperBalances(plan).reduce((a, b) => a + b, 0);
}

/** Min/max annual spend across retirement (both equal for flat mode). */
export function spendingRange(plan: RetirementPlan): { min: number; max: number } {
  if (plan.spendingMode !== "stages")
    return { min: plan.targetSpending, max: plan.targetSpending };
  const { goGo, slowGo, noGo } = plan.spendingStages;
  return {
    min: Math.min(goGo, slowGo, noGo),
    max: Math.max(goGo, slowGo, noGo),
  };
}

export type Phase = "accumulation" | "bridge" | "drawdown" | "pension";

// A full ledger of the money flows behind a single year, so the change in balance
// can be reconciled: opening + inflows − outflows = closing.
/** One person's contribution to the legislated minimum super drawdown in a year. */
export interface MinDrawdownPart {
  age: number;
  balance: number; // opening super balance this year
  rate: number; // legislated minimum rate for this age (fraction)
  amount: number; // balance × rate
}

// The Age Pension means-test working for one year (the engine's actual inputs
// and both test results), so the income modal can show exactly how the figure
// was reached. null before Age Pension age.
export interface PensionBreakdown {
  // Assessable assets, itemised (the family home is excluded entirely).
  outsideAssets: number; // savings/investments outside super
  accessibleSuper: number; // super counted in the assets test
  propertyEquity: number; // combined investment-property net equity (0 if none)
  propertyParts: { name?: string; index: number; equity: number }[]; // per-property net equity (held this year)
  assessableAssets: number; // sum of the three above
  financialAssets: number; // outsideAssets + accessibleSuper (the deemed base)
  // Assessable income, itemised.
  deemedIncome: number; // income deemed on financialAssets
  otherIncome: number; // assessable rent counted in the income test
  assetsTestAnnual: number; // entitlement under the assets test
  incomeTestAnnual: number; // entitlement under the income test
  bindingTest: "assets" | "income"; // the lower (binding) test
}

export interface YearBreakdown {
  openingSuper: number;
  openingOutside: number;
  closingSuper: number;
  closingOutside: number;
  // Accumulation (working-year) inflows
  contribGross: number; // gross concessional (SG + salary sacrifice)
  contribTax: number; // 15% contributions tax withheld
  contribNet: number; // net amount added to super (concessional net + non-concessional)
  savings: number; // added to outside-super this year
  salaryIncome: number; // gross household salary this year (accumulation only; 0 in retirement)
  // Investment growth (super growth is net of accumulation earnings tax AND the
  // % investment/admin fee; the fixed $ fees + insurance are the `fees` line)
  superGrowth: number;
  outsideGrowth: number;
  fees: number; // fixed admin + insurance $ deducted from super this year
  earningsTax: number; // approx 15% super earnings tax (accumulation only)
  // Retirement income
  agePension: number;
  pension: PensionBreakdown | null; // means-test working behind agePension (null before pension age)
  rentIncome: number; // net cash rent from an investment property
  minDrawdown: number; // legislated minimum super drawdown this year (per-person, summed)
  minDrawdownParts: MinDrawdownPart[]; // the per-person split behind minDrawdown
  // Retirement spending
  livingSpend: number;
  mortgageCost: number;
  mortgageCleared: number; // one-off super lump sum used to clear the home loan
  // Investment property sale
  propertyProceeds: number; // net proceeds added to outside super
  propertyCgt: number; // CGT paid on the sale
}

export interface YearRow {
  age: number; // oldest person's age this year
  totalSuper: number; // combined super balance (today's $)
  outside: number; // outside-super balance
  total: number; // totalSuper + outside
  agePension: number; // Age Pension received this year
  pension: PensionBreakdown | null; // means-test working behind agePension (null before pension age)
  salaryIncome: number; // gross household salary this year (0 once retired)
  superDrawn: number; // drawn from super this year
  outsideDrawn: number; // drawn from outside-super this year
  spending: number; // target spending this year (0 while working)
  rentIncome: number; // net cash rent from an investment property (can be negative)
  propertyEquity: number; // assessable net equity of an investment property
  phase: Phase;
  funded: boolean; // was spending fully met this year?
  breakdown: YearBreakdown; // full money-flow ledger for the reconciliation modal
}

export interface SimResult {
  rows: YearRow[];
  retirementAge: number;
  agePensionAge: number; // from the active config (used for chart markers)
  superAtRetirement: number; // combined super when retirement begins
  totalAtRetirement: number; // total investable assets when retirement begins
  depletedAge: number | null; // first age spending couldn't be met; null if never
  lastsToLifeExpectancy: boolean;
  firstAgePensionAge: number | null; // age the household first receives Age Pension
  realReturn: number; // inflation-adjusted return (fraction)
}

export const DEFAULT_PLAN: RetirementPlan = {
  household: "single",
  people: [
    {
      currentAge: 40,
      superBalance: 150_000,
      salary: 95_000,
      voluntaryConcessional: 0,
      voluntaryNonConcessional: 0,
    },
  ],
  superMode: "individual",
  jointSuperBalance: 300_000,
  jointSuperSplit: 50,
  homeowner: true,
  outsideSuper: 50_000,
  annualOutsideSavings: 5_000,
  retirementAge: 60,
  spendingMode: "flat",
  targetSpending: 55_000,
  spendingStages: deriveStages(55_000),
  investmentReturn: 7,
  returnVolatility: 11,
  // CPI inflation (ASIC RG 276 default 2.5%). The engine deflates to today's
  // dollars in two stages: pre-retirement by wage inflation (this + the config's
  // livingStandardsGrowthPct, i.e. 3.7%), retirement by this CPI figure.
  inflation: 2.5,
  lifeExpectancy: 90,
};

export const DEFAULT_PARTNER: Person = {
  currentAge: 40,
  superBalance: 120_000,
  salary: 85_000,
  voluntaryConcessional: 0,
  voluntaryNonConcessional: 0,
};
