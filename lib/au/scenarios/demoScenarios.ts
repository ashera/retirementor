// Curated, code-authored demo scenarios shared publicly at /scenario/<slug>.
// These are our reproductions of public discussions (e.g. Reddit FIRE threads) —
// we build the scenario here, it seeds into the DB on deploy (seedDemoScenarios),
// and the backoffice surfaces the shareable link. Code is the source of truth:
// each is upserted by `slug`, so editing here and deploying updates the live one.

import { DEFAULT_PLAN, type RetirementPlan } from "../types";

export interface DemoScenario {
  slug: string; // stable key + public URL segment (/scenario/<slug>)
  title: string; // shown as the scenario name in the shared dashboard
  blurb?: string; // short public-facing description
  context?: string; // admin-only: which discussion, the claim, our finding
  threadUrl?: string; // admin-only: link back to the source thread
  sortOrder?: number;
  published?: boolean; // false → hidden from the public route
  data: RetirementPlan;
}

// r/fiaustralia SWR debate — u/Infinitedmg's "4% ≈ 80% success, pension barely
// matters for early retirees" claim. Retire at 45, $1M split $400k super / $600k
// outside (realistic: super is locked until 60), 4% ($40k) fixed real, to age 90.
const fireAt45: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "single",
  people: [
    { ...DEFAULT_PLAN.people[0], currentAge: 45, superBalance: 400_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
  ],
  superMode: "individual",
  homeowner: true,
  outsideSuper: 600_000,
  annualOutsideSavings: 0,
  retirementAge: 45,
  spendingMode: "flat",
  targetSpending: 40_000,
  investmentReturn: 7,
  returnVolatility: 11,
  inflation: 2.5,
  lifeExpectancy: 90,
};

// The high-expense counterpart. Same retire-at-45, 45-yr horizon, but $2M all
// equity ($500k super / $1.5M outside) spending $80k (4%). At this expense the Age
// Pension barely moves the odds (the means test tapers it away), so u/Infinitedmg's
// "pension barely matters" holds HERE — the opposite of the $40k case. The big
// outside pool also makes the outside-super tax treatment decisive (now modelled
// with deferred, 50%-discounted CGT rather than taxing the whole return as income).
const fireAt45HighSpend: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "single",
  people: [
    { ...DEFAULT_PLAN.people[0], currentAge: 45, superBalance: 500_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
  ],
  superMode: "individual",
  homeowner: true,
  outsideSuper: 1_500_000,
  annualOutsideSavings: 0,
  retirementAge: 45,
  spendingMode: "flat",
  targetSpending: 80_000,
  investmentReturn: 7,
  returnVolatility: 11,
  inflation: 2.5,
  lifeExpectancy: 90,
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    slug: "fire-at-45",
    title: "FIRE @45 · $40k · pension decisive",
    blurb:
      "Retire at 45 on 4% ($40k) of a $1M portfolio, 45-year horizon to 90 — the low-expense end of the r/fiaustralia safe-withdrawal-rate debate.",
    context:
      "Reproduces u/Infinitedmg's claim that 4% ≈ 80% success and the Age Pension barely helps early retirees. We land ~82% at 4% (realistic $400k super / $600k outside split), in his ~80% ballpark. Key divergence: at THIS expense the pension is DECISIVE — 82% → 44% without it (+38pp) — vs his ~1pp, because the marginal sequences fall into the means-test taper. Contrast the $80k high-spend scenario where the pension IS marginal (his point holds there): the disagreement was expense-dependence all along. (Numbers reflect the deferred-CGT outside-super tax fix — up from ~76% under the old over-taxing model.)",
    threadUrl: "", // paste the Reddit thread URL
    sortOrder: 10,
    data: fireAt45,
  },
  {
    slug: "fire-at-45-high-spend",
    title: "FIRE @45 · $80k · pension marginal",
    blurb:
      "Retire at 45 on 4% ($80k) of a $2M all-equity portfolio, 45-year horizon to 90 — the high-expense end, where the Age Pension barely moves the odds.",
    context:
      "The high-expense counterpart to the $40k FIRE case. $2M ($500k super / $1.5M outside), $80k/yr (4%) to 90. Success ~55%, and the Age Pension adds only ~6pp (55% → 49% without) — the means test tapers it away at this spend, so u/Infinitedmg's 'pension barely matters for early retirees' HOLDS here. The pair proves the debate was expense-dependence: pension decisive at $40k (+38pp), marginal at $80k (+6pp). The large $1.5M outside pool also makes the outside-super tax treatment first-order — now deferred, 50%-discounted CGT rather than taxing the whole return as income.",
    threadUrl: "", // paste the Reddit thread URL
    sortOrder: 20,
    data: fireAt45HighSpend,
  },
];
