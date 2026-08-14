// Domain types for the Australian retirement planner.

import type { SuperFees } from "./config";

export type Household = "single" | "couple";

export interface Person {
  currentAge: number;
  superBalance: number; // current super balance
  salary: number; // gross annual salary (drives Super Guarantee)
  voluntaryConcessional: number; // annual salary-sacrifice / personal deductible contributions
  voluntaryNonConcessional: number; // annual after-tax contributions
  // Couples only: the age THIS person retires. Person 0's retirement age is
  // plan.retirementAge; a partner may retire at a different age. When unset, a
  // partner retires at the same TIME as person 0 (so age-gap couples that never
  // set this are unchanged from the single-retirement-age model).
  retirementAge?: number;
  // Optional — used only by the longevity ("Rich, Broke or Dead") overlay to weight
  // outcomes by survival. Male/female mortality differ ~3-4 yrs; unset → a 50/50
  // blended life table. Not used anywhere in the projection maths.
  sex?: "male" | "female";
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
  // Optional downsize: at `atAge`, move to a home worth `newValue`. The freed
  // equity (grown current value − newValue − loan) is computed by the engine;
  // `toSuper` of it goes into super as a downsizer contribution (assessable but
  // tax-advantaged), the rest into outside savings (deemed). `value` stays ORIGINAL.
  downsize?: { atAge: number; newValue: number; toSuper: number };
  // Optional sell-up-and-rent: at `atAge`, release all equity (grown value − loan,
  // computed by the engine) into savings, become a NON-homeowner (higher assets
  // threshold) and pay `rentPerYear` from then on. Any mortgage is repaid from it.
  sellAndRent?: { atAge: number; rentPerYear: number };
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

/** The CGT working behind a single investment-property sale (today's dollars). */
export interface PropertySaleDetail {
  name: string; // property label ("Beach house" / "Property 2")
  saleValue: number; // market value at sale
  costBase: number; // purchase price (cost base)
  gain: number; // saleValue − costBase (floored at 0)
  regime: "discount" | "indexed"; // which CGT regime applied
  discountPct: number; // % of the gain excluded (50 for the discount regime; 0 if indexed)
  taxableGain: number; // gain after the discount (or full real gain under the indexed regime)
  owners: number; // co-owners the gain is split across (couple = 2)
  cgt: number; // CGT paid across all owners
}

// How a couple's super is held. "joint" = a single pooled SMSF balance entered as
// one figure (still split across members internally so each member's contributions,
// preservation-age access and means-test treatment apply).
export type SuperMode = "individual" | "joint";

// A career break ("gap years"): person `who` takes `years` off from their age
// `atAge`, drawing `spendFromSavings`/yr from outside savings to live.
export interface CareerBreak {
  atAge: number;
  years: number;
  spendFromSavings: number;
  who: number; // person index (0 = "you")
}

// A general "life event": a one-off cashflow at a chosen age (the oldest person's
// age on the timeline). v1 covers the two low-risk presets — a windfall/inheritance
// (income lands in savings, not taxed) and a one-off expense (an extra draw that
// year). Recurring streams and taxable income (a DB pension) are a later phase.
// Amounts are in today's dollars, like targetSpending and lumpSum.
export interface LifeEvent {
  id: string; // stable id for the What-If list (add/edit/remove/toggle)
  kind: "income" | "expense";
  amount: number; // today's dollars
  atAge: number; // oldest person's age when it happens
  label?: string; // e.g. "Inheritance", "Big trip", "New car"
}

// A recurring income STREAM — a defined-benefit pension, annuity, or foreign
// pension / social security (e.g. US Social Security). Runs from `fromAge` to
// `untilAge` (default: for life), in today's dollars. `indexed` (default true) keeps
// it constant in real terms (CPI-linked, "indexed for life"); non-indexed erodes
// with inflation. Defaults model it as real, assessable, taxable income: it offsets
// the drawdown, is counted under the Age Pension INCOME test (actual income — not
// deemed, and NOT asset-tested, since a lifelong pension isn't a countable asset),
// and is taxed as ordinary income (SAPTO applies from Age-Pension age). Ages are the
// OLDEST person's age on the timeline (same axis as life events).
export interface IncomeStream {
  id: string; // stable id for add/edit/remove
  label?: string; // e.g. "Defined benefit pension", "US Social Security"
  perYear: number; // today's dollars
  fromAge: number; // oldest person's age it starts
  untilAge?: number; // oldest person's age it stops; omitted → for life
  indexed?: boolean; // default true → constant real; false → erodes with CPI
  taxable?: boolean; // default true → taxed as ordinary income
  assessable?: boolean; // default true → counted in the Age Pension income test
  foreignSourced?: boolean; // default false. Only bites when taxResidency === "non-resident": a foreign-sourced stream (e.g. US Social Security) isn't taxed by Australia or counted in its income test; a resident is taxed on worldwide income regardless.
  owner?: number; // couples only: which person the income belongs to for TAX (0 = you, 1 = partner). Omitted → split evenly. No effect on the Age Pension income test (assessed on combined household income) or for a single.
}

// Aged care (v1, consumer-facing general information). Models a late-life
// residential- or home-care phase for ONE person (single, or one member of a
// couple with the partner as the protected person keeping the home exempt).
// `framing`: "assume" models a definite care phase; "probabilistic" weights the
// cost by the config entry probability (a gentler "what if you need care?"). All
// amounts today's dollars. Residential accommodation is paid as a refundable
// lump sum (RAD), an ongoing daily charge (DAP = RAD × MPIR/365), or a blend;
// the RAD is preserved as refundable estate value (not consumed) and is exempt
// from the Age Pension assets test while held. See docs/aged-care-module-v1-spec.md.
export interface AgedCarePlan {
  enabled: boolean;
  framing: "assume" | "probabilistic";
  careType: "residential" | "home";
  person?: number; // person index entering care; default the oldest member
  entryAge: number; // oldest person's age on the timeline when care begins
  durationYears: number; // modelled length of the care phase
  // Residential only:
  accommodation?: "rad" | "dap" | "combo";
  radAmount?: number; // RAD price (today's $); default config.agedCare.radNationalAvg
  radSharePct?: number; // combo: % of the RAD paid as a lump sum, remainder as DAP (0–100)
  radFundedFrom?: "home" | "super" | "outside" | "auto"; // lump-sum funding source (auto: home → outside → super)
  homeAction?: "sell" | "keep-rent" | "keep-vacant"; // what happens to the former home
}

// Per-person "keep super in accumulation" configuration (see RetirementPlan).
export interface KeepAccumulation {
  who?: number[]; // person indices kept in accumulation (default: every member)
  mode?: "untilPensionAge" | "forever"; // convert to a pension at Age-Pension age, or never
}

// One person's income-tax reconciliation for a year — all ordinary income taxed
// together, with a single LITO + SAPTO application. For the tax-analysis modal.
export interface PersonTaxDetail {
  label: string; // "You" / "Your partner" (or name)
  salary: number; // taxable salary (after any sacrifice)
  work: number; // part-time work income
  rent: number; // net rent share (can be negative — negative gearing)
  stream: number; // taxable income-stream share (DB / annuity / foreign pension)
  dividends: number; // outside-super dividend share
  gain: number; // realised capital gain share
  gross: number; // bracket tax on total ordinary income, before offsets
  lito: number; // Low Income Tax Offset applied
  sapto: number; // Seniors & Pensioners Tax Offset applied
  incomeTax: number; // net ordinary income tax after LITO + SAPTO
  medicare: number;
  cgt: number; // tax on the realised gain (regime + 30% minimum)
}

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
  investmentReturn: number; // nominal annual return, percent (super, and the default for outside)
  returnVolatility: number; // annual return standard deviation, percent (for Monte Carlo)
  // Optional: model outside-super money with its own return/volatility (e.g. held
  // more conservatively, or a cash-heavy pool). Both default to the super figures
  // above when unset, so plans that don't set them are unchanged. In the Monte
  // Carlo the two pools share one market shock each year (perfect correlation, a
  // fair simplification) but scale it by their own volatility — so a low-return,
  // low-volatility outside pool behaves like cash.
  outsideReturn?: number; // nominal outside-super return, percent (defaults to investmentReturn)
  outsideVolatility?: number; // outside-super return std deviation, percent (defaults to returnVolatility)
  inflation: number; // annual inflation, percent
  lifeExpectancy: number; // simulate until the oldest person reaches this age
  fees?: SuperFees; // optional per-plan fee override (else the config default applies)
  budget?: RetirementBudget; // optional guided budget that produced targetSpending
  mortgage?: MortgageDetail; // optional home loan carried into retirement
  home?: HomeDetail; // the principal home as an asset (exempt; net-worth context only)
  workIncome?: { perYear: number; untilAge: number }; // part-time work in early retirement (offsets drawdown; income-test assessable net of the Work Bonus)
  ttr?: { extraSacrifice: number; who?: number[] }; // Transition to Retirement: extra pre-tax sacrifice/yr from preservation age → retirement, take-home held by a tax-free TTR pension. `who` = person indices it applies to (defaults to [0] for backward compatibility); each named person sacrifices `extraSacrifice` in the years they are 60+ and still working.
  keepSuperInAccumulation?: boolean | KeepAccumulation; // keep super in accumulation instead of starting an account-based pension. Legacy `true` = every member, for life. The object form is per-person: keep a member in accumulation until they reach Age-Pension age (shields it from the means test — the age-gapped-couple strategy) then convert to pension, or keep it in accumulation for life (avoids the forced minimum drawdown). 15% earnings tax while in accumulation vs tax-free in pension.
  guardrails?: { guardPct?: number; adjustPct?: number; floorPct?: number }; // Guyton-Klinger dynamic spending: flex living-spend with the portfolio. If the net-of-pension withdrawal RATE drifts guardPct% (default 20) above its initial level, cut spending adjustPct% (default 10); if it drifts guardPct% below, raise it — never below the greater of essentials or floorPct% (default 70) of the initial spend. Presence enables it.
  lumpSum?: { atAge: number; amount: number }; // one-off tax-free super withdrawal at an age (spent), capped at the accessible super balance then
  recontribute?: { perYear: number; fromAge: number; untilAge: number }; // recontribution: after-tax (non-concessional) top-up of super from outside savings, each year from fromAge to untilAge (a one-off when they're equal), age ≤75, within the NCC + total-super caps
  careerBreak?: { atAge: number; years: number; spendFromSavings: number }; // DEPRECATED single-person form (person 0); read via getCareerBreaks(). Kept so plans saved before careerBreaks[] still load.
  careerBreaks?: CareerBreak[]; // "gap years": each entry = person `who` takes `years` off from their age `atAge` — no salary or super contributions in that window, drawing `spendFromSavings`/yr from outside savings to live. Savings additions pause only when EVERY working member is on a break that year. Super keeps earning on the existing balance; the lost contributions + compounding are the main cost.
  lifeEvents?: LifeEvent[]; // committed one-off cashflows at an age: an income (windfall/inheritance) lands in outside savings untaxed; an expense is an extra draw that year (from savings while working, from the retirement drawdown once retired). Today's dollars. Flows through the means test, MC, stress test, failsafe and guardrails automatically.
  incomeStreams?: IncomeStream[]; // recurring income (defined-benefit / annuity / foreign pension e.g. US Social Security): offsets the drawdown, assessed under the Age Pension INCOME test (not deemed/not asset-tested) and taxed as ordinary income by default; indexed (constant real) unless flagged otherwise. See IncomeStream.
  agedCare?: AgedCarePlan; // optional late-life aged-care phase (cost overlay + RAD/DAP accommodation + former-home & Age Pension interaction). General information; flows through the projection, MC, stress test and failsafe. See AgedCarePlan.
  // Tax residency for the WHOLE projection. "non-resident" (foreign resident, e.g. a
  // retiree living permanently overseas) uses the foreign-resident tax scale (no
  // tax-free threshold, no Medicare, no LITO/SAPTO), taxes only AU-sourced income
  // (foreign-sourced streams + the outside-super portfolio fall outside AU tax), and
  // by default treats the Age Pension as not claimable from abroad (see
  // claimAgePensionAbroad). Defaults to resident. Non-resident tax is genuinely
  // complex (source rules, tax treaties) — this is an estimate.
  taxResidency?: "resident" | "non-resident";
  claimAgePensionAbroad?: boolean; // non-resident override: keep the Age Pension despite living abroad (portability varies; off by default).
  // Debt recycling (What-If): while working, run a geared share sleeve funded by a
  // deductible investment loan (redraw against the home loan). `perYear` is added to
  // the loan + invested each working year until `untilAge`; interest is tax-deductible;
  // the sleeve lives in the outside pool (dividends taxed, growth deferred) and is
  // unwound (loan repaid from the pool) at retirement. Needs a home loan to recycle
  // against. Flows through the projection, MC and stress test.
  debtRecycle?: { perYear: number; loanRatePct: number; untilAge: number };
  investmentProperties?: PropertyDetail[]; // income-producing properties (source of truth)
  investmentProperty?: PropertyDetail; // DEPRECATED legacy single property — read via getInvestmentProperties()
  // Which optional sections the user has explicitly answered in the wizard (incl.
  // "none"), so plan-completeness can reach 100% honestly and the dashboard ring
  // matches the wizard. Not used by the engine.
  answered?: { contributions?: boolean; outside?: boolean; property?: boolean; income?: boolean };
  // UI-only: the What-If board selection that produced this saved scenario, so it
  // can be reopened and tweaked ("Edit in What-If"). Ignored by the engine.
  whatIf?: WhatIfSaved;
}

/** The What-If board selection (which strategies are on + their params + the
 *  chosen baseline), stored alongside a saved scenario so it can be reopened. */
export interface WhatIfSaved {
  active: string[]; // strategy card ids that are toggled on
  values: Record<string, Record<string, number>>; // per-card param values
  baselineId: string; // "current" or a saved-plan id
  // The actual plan the strategies were applied to (the board's baseline at save
  // time). Stored so reopening can put the strategies back on their ORIGINAL base —
  // `baselineId: "current"` isn't recoverable later (it now points at the composed,
  // strategies-baked-in plan). Its own `whatIf` is stripped to avoid recursion.
  baselinePlan?: RetirementPlan;
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

/** Career breaks on a plan, normalising the deprecated single-person `careerBreak`
 *  (person 0) into the `careerBreaks[]` form. An explicit `careerBreaks` wins. Only
 *  breaks targeting a real person are returned. */
export function getCareerBreaks(plan: RetirementPlan): CareerBreak[] {
  const raw = plan.careerBreaks ?? (plan.careerBreak ? [{ ...plan.careerBreak, who: 0 }] : []);
  return raw.filter((b) => b.who >= 0 && b.who < plan.people.length);
}

/** Valid life events on a plan: a positive amount and a kind the engine handles.
 *  Tolerates a missing array. */
export function getLifeEvents(plan: RetirementPlan): LifeEvent[] {
  return (plan.lifeEvents ?? []).filter(
    (e) => e && e.amount > 0 && (e.kind === "income" || e.kind === "expense"),
  );
}

/** Valid recurring income streams (DB pension, annuity, foreign pension). Defaults:
 *  indexed (constant real), taxable, and assessable under the Age Pension income test. */
export function getIncomeStreams(plan: RetirementPlan): Required<IncomeStream>[] {
  return (plan.incomeStreams ?? [])
    .filter((s) => s && s.perYear > 0 && Number.isFinite(s.fromAge))
    .map((s) => ({
      id: s.id,
      label: s.label ?? "Income stream",
      perYear: s.perYear,
      fromAge: s.fromAge,
      untilAge: s.untilAge ?? Number.POSITIVE_INFINITY,
      indexed: s.indexed ?? true,
      taxable: s.taxable ?? true,
      assessable: s.assessable ?? true,
      foreignSourced: s.foreignSourced ?? false,
      owner: typeof s.owner === "number" && s.owner >= 0 ? s.owner : -1, // -1 = split evenly
    }));
}

/** Resolve keepSuperInAccumulation into { who, mode }, or null when it's off.
 *  Legacy `true` → every member, "forever" (byte-identical to the old all-or-nothing
 *  behaviour). The object form defaults to every member converting at Age-Pension age. */
export function keepAccumConfig(
  plan: RetirementPlan,
): { who: Set<number>; mode: "untilPensionAge" | "forever" } | null {
  const k = plan.keepSuperInAccumulation;
  if (!k) return null;
  const everyone = plan.people.map((_, i) => i);
  if (k === true) return { who: new Set(everyone), mode: "forever" };
  const who = k.who && k.who.length ? k.who : everyone;
  return {
    who: new Set(who.filter((i) => i >= 0 && i < plan.people.length)),
    mode: k.mode ?? "untilPensionAge",
  };
}

/**
 * Years from the start of the projection until person `i` retires.
 * Person 0 always uses plan.retirementAge. A partner with an explicit
 * `retirementAge` retires at their own age; without one they default to
 * retiring at the SAME TIME as person 0 — so a plan that never sets a partner
 * retirement age behaves exactly as the old single-retirement-age model.
 * Rounded to whole years to match the yearly simulation grid.
 */
export function personRetirementOffset(plan: RetirementPlan, i: number): number {
  const primary = Math.max(0, Math.round(plan.retirementAge - plan.people[0].currentAge));
  if (i === 0) return primary;
  const ra = plan.people[i]?.retirementAge;
  if (ra == null || !Number.isFinite(ra)) return primary;
  return Math.max(0, Math.round(ra - plan.people[i].currentAge));
}

/** The household enters the retirement (spending) phase when the FIRST person
 *  retires — i.e. the earliest per-person retirement offset. */
export function householdRetirementOffset(plan: RetirementPlan): number {
  return Math.min(...plan.people.map((_, i) => personRetirementOffset(plan, i)));
}

/** The age (their own) at which person `i` retires. */
export function personRetirementAge(plan: RetirementPlan, i: number): number {
  return plan.people[i].currentAge + personRetirementOffset(plan, i);
}

/** True when a couple has partners retiring at genuinely different times. */
export function hasStaggeredRetirement(plan: RetirementPlan): boolean {
  if (plan.people.length < 2) return false;
  const first = personRetirementOffset(plan, 0);
  return plan.people.some((_, i) => personRetirementOffset(plan, i) !== first);
}

/** The oldest member's current age — the projection's timeline is indexed by this,
 *  so `YearRow.age` and every chart's x-axis run in the oldest person's age. */
export function oldestCurrentAge(plan: RetirementPlan): number {
  return Math.max(...plan.people.map((p) => p.currentAge));
}

/** Number of years to simulate: run until the YOUNGEST member reaches life
 *  expectancy, so a couple with an age gap is projected long enough to fund the
 *  longer-lived partner. The timeline is still indexed by the oldest person's age
 *  (which therefore exceeds `lifeExpectancy` in the tail — the survivor's years).
 *  For a single, or a couple of the same age, this equals the old LE − age. */
export function householdHorizon(plan: RetirementPlan): number {
  const youngest = Math.min(...plan.people.map((p) => p.currentAge));
  // A not-yet-built ("start from scratch") plan has unset figures (NaN in memory, null
  // after a JSON round-trip) → guard so the horizon is a valid length (0), never NaN,
  // which would make `new Array(horizon + 1)` throw "Invalid array length" downstream.
  if (!Number.isFinite(youngest) || !Number.isFinite(plan.lifeExpectancy)) return 0;
  return Math.max(0, Math.round(plan.lifeExpectancy - youngest));
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
  otherIncome: number; // total non-deemed assessable income = rentIncome + employmentIncome + streamIncome
  rentIncome: number; // assessable investment-property rent (actual, not deemed)
  employmentIncome: number; // assessable employment (part-time work + a still-working partner's salary), net of the Work Bonus
  streamIncome: number; // assessable income streams (DB / annuity / foreign pension)
  assetsTestAnnual: number; // entitlement under the assets test
  incomeTestAnnual: number; // entitlement under the income test
  bindingTest: "assets" | "income"; // the lower (binding) test
}

export interface YearBreakdown {
  openingSuper: number;
  openingOutside: number;
  closingSuper: number;
  closingOutside: number;
  // Split of the OPENING super between the tax-free account-based PENSION pool (up
  // to the Transfer Balance Cap) and the ACCUMULATION pool (the excess above the
  // cap, or preserved bridge super — its earnings are taxed 15%). Sum = openingSuper,
  // so the balance chart can stack them to the plotted super band.
  pensionSuper: number;
  accumSuper: number;
  // Accumulation (working-year) inflows
  contribGross: number; // gross concessional (SG + salary sacrifice)
  contribTax: number; // 15% contributions tax withheld
  contribNet: number; // net amount added to super (concessional net + non-concessional)
  savings: number; // added to outside-super this year
  salaryIncome: number; // gross household salary this year (accumulation only; 0 in retirement)
  takeHome: number; // net pay after income tax + pre-tax salary sacrifice (working years; 0 in retirement)
  takeHomePer?: number[]; // per-person take-home pay (same order as plan.people) — for the per-person income view
  ttrBenefit: number; // net super gained this year from a Transition-to-Retirement swap (0 normally)
  ttrPension?: number; // tax-free TTR pension drawn from super to hold take-home while sacrificing more (0 normally)
  workIncome: number; // net part-time work income this year (retirement only; after tax)
  incomeStreamNet?: number; // net recurring income-stream income this year (after tax) — funds spending
  incomeStreamGross?: number; // gross recurring income-stream income this year (before tax)
  incomeStreamTax?: number; // income tax on the taxable income streams this year
  incomeStreamNames?: string[]; // labels of the income streams active this year (for display)
  // Investment growth (super growth is net of accumulation earnings tax AND the
  // % investment/admin fee; the fixed $ fees + insurance are the `fees` line)
  superGrowth: number;
  outsideGrowth: number;
  fees: number; // fixed admin + insurance $ deducted from super this year
  earningsTax: number; // approx 15% super earnings tax (accumulation only)
  outsideTax: number; // income tax on outside-super earnings — the dividend/distribution yield each year (both phases) plus realised gains on sale (retirement); super pension earnings are tax-free
  outsideDividend?: number; // the assessable dividend/distribution income that year (the taxable slice of the outside return; capital growth is deferred)
  // Consolidated tax-analysis totals (for the tax chart/modal). These re-slice the
  // same tax the ledger already charges into clean, non-overlapping categories:
  //   incomeTax  = ordinary income tax (salary + net rent + dividends + part-time work), after LITO/SAPTO
  //   medicare   = Medicare levy on employment income
  //   capitalGains = outside realised-gain CGT + property-sale CGT
  //   + contribTax (super contributions) + earningsTax (super earnings) above.
  incomeTax?: number;
  medicare?: number;
  capitalGains?: number;
  taxDetail?: PersonTaxDetail[]; // per-person income-tax reconciliation for the tax modal (gross → LITO → SAPTO → net)
  rentSaved?: number; // accumulation only: positive after-tax net rent reinvested into the outside pool (a geared loss isn't — it's a disposable drain)
  investmentLoan?: number; // debt recycling: the outstanding geared investment-loan balance this year (a liability netted out of the outside pool + net worth); `drInterest` is its deductible interest, `drTaxSaving` the tax it saved
  drInterest?: number; // debt recycling: deductible interest charged on the investment loan this year
  drTaxSaving?: number; // debt recycling: income tax saved by deducting that interest (reinvested into the sleeve)
  careerBreakDraw?: number; // accumulation only: living costs drawn from outside savings during a career break ("gap years"), floored at the balance available
  onBreak?: boolean; // accumulation only: at least one member is on a career break ("gap year") this year — charts shade the span
  eventIncome?: number; // life-event windfall/inheritance received this year (added to outside savings, untaxed)
  eventExpense?: number; // life-event one-off expense paid this year (extra draw; in accumulation, floored at available savings)
  // Aged care (retirement only; present only in care years). agedCareTotal is the
  // charged cost this year (probabilistic framing weights it by the entry probability)
  // and is included in `livingSpend`'s funding via the drawdown; the components split
  // it (residential: basic + hotelling + NCCC + DAP; home care: total only). radDrawn
  // = refundable deposit paid at entry; radHeld = running preserved deposit (refundable
  // to the estate, exempt from the Age Pension assets test — NOT part of the spendable
  // balance).
  agedCareTotal?: number;
  agedCareBasic?: number;
  agedCareHotelling?: number;
  agedCareNCCC?: number;
  agedCareDAP?: number;
  radDrawn?: number;
  radHeld?: number;
  // Retirement income
  agePension: number;
  pension: PensionBreakdown | null; // means-test working behind agePension (null before pension age)
  rentIncome: number; // net cash rent from an investment property (gross of income tax; can be negative)
  rentTax: number; // income tax on the net rent (marginal, stacked on work/salary); NEGATIVE = a negative-gearing tax benefit
  minDrawdown: number; // legislated minimum super drawdown this year (from the PENSION pool, per-person, summed)
  minDrawdownParts: MinDrawdownPart[]; // the per-person split behind minDrawdown
  // The drawdown order for spending beyond the pension minimum: outside first (row
  // .outsideDrawn), then accumulation super, then the tax-free pension above its
  // minimum. superDrawn = minDrawdown + accumDrawn + pensionExtraDrawn.
  accumDrawn: number; // accumulation super drawn above the minimum
  pensionExtraDrawn: number; // tax-free pension drawn above the minimum (only once outside + accum are exhausted)
  // Retirement spending
  livingSpend: number;
  rentCost: number; // rent paid this year after selling up (0 otherwise)
  mortgageCost: number;
  mortgageCleared: number; // one-off super lump sum used to clear the home loan
  superTaxDraw?: number; // super drawn to settle outside-tax when the outside pool was emptied
  lumpSum: number; // one-off tax-free lump sum withdrawn from super this year (spent)
  recontribution: number; // after-tax amount moved from savings into super this year (non-concessional)
  // Investment property sale
  propertyProceeds: number; // net proceeds added to outside super
  propertyCgt: number; // CGT paid on the sale
  propertySales?: PropertySaleDetail[]; // per-property sale working behind propertyCgt (which one, gain, discount, CGT)
  // Home equity freed this year (downsize / sell-up-and-rent). Lands in the
  // opening balance, so it explains a step-up rather than a mid-year inflow.
  homeProceeds: number; // total equity freed (0 normally)
  homeProceedsToSuper: number; // portion contributed to super as a downsizer (rest → savings)
  homeValue: number; // the home's (exempt) market value this year — for the net-worth view
  homeEquity: number; // homeValue less any outstanding mortgage — the net-worth band uses this
}

export interface YearRow {
  age: number; // oldest person's age this year
  totalSuper: number; // combined super balance (today's $)
  outside: number; // outside-super balance
  total: number; // totalSuper + outside
  agePension: number; // Age Pension received this year
  pension: PensionBreakdown | null; // means-test working behind agePension (null before pension age)
  salaryIncome: number; // gross household salary this year (0 once retired)
  takeHome: number; // net pay after income tax + pre-tax salary sacrifice (working years; 0 in retirement)
  workIncome: number; // net part-time work income this year (0 outside the work years)
  incomeStream: number; // net recurring income-stream income (DB/annuity/foreign pension), after tax; 0 outside retirement
  homeValue: number; // the home's (exempt) market value this year — for the net-worth view
  homeEquity: number; // homeValue less any outstanding mortgage — the net-worth band uses this
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
  // A partner who retires at a different time (staggered retirement); null when
  // there's no partner or both retire together. Drives a second chart marker.
  partnerRetirementAge: number | null;
  // The (oldest-person's) age at which a member's preserved super first unlocks and
  // moves into the tax-free pension pool AFTER retirement has begun — an early
  // retiree turning 60. Drives a chart marker explaining the accumulation→pension
  // flip; null when the transfer coincides with retirement.
  superUnlockAge: number | null;
  superUnlockIsPartner: boolean; // the unlocking super is a partner's (not "your" own)
  // Per-person super-unlock age (index-aligned with people): when each member's super
  // flips to pension phase after retirement, or null if it coincided with retirement.
  superUnlockAges: (number | null)[];
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
