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

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    slug: "fire-at-45",
    title: "FIRE @45 · 4% · 45-yr horizon",
    blurb:
      "Retire at 45 on 4% of a $1M portfolio, 45-year horizon to 90 — reproducing the r/fiaustralia safe-withdrawal-rate debate.",
    context:
      "Reproduces u/Infinitedmg's claim that 4% ≈ 80% success and the Age Pension barely helps early retirees. We land ~76% at 4% (realistic super/outside split; ~79% fully-accessible), matching his 80.1%. Key divergence: the pension is DECISIVE for us — 76% → 32% without it — vs his ~1pp, because the marginal sequences fall into the means-test taper (pension first pays ~age 69 here). Also surfaces the preservation-age liquidity trap: too much locked in super and the 4% plan fails on the 45→60 bridge.",
    threadUrl: "", // paste the Reddit thread URL
    sortOrder: 10,
    data: fireAt45,
  },
];
