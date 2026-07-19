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

// The everyday counterpart to the FIRE pair: a "good saver" single retiring at 55.
// Only a 5-year bridge to preservation age (60), so relatable balances work. The
// means-tested Age Pension (from 67) does the heavy lifting — strip it out and the
// plan collapses, the mirror image of the high-net-worth FIRE cases.
const retire55Single: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "single",
  people: [
    { ...DEFAULT_PLAN.people[0], currentAge: 55, superBalance: 500_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
  ],
  superMode: "individual",
  homeowner: true,
  outsideSuper: 250_000,
  annualOutsideSavings: 0,
  retirementAge: 55,
  spendingMode: "flat",
  targetSpending: 42_000,
  investmentReturn: 7,
  returnVolatility: 11,
  inflation: 2.5,
  lifeExpectancy: 90,
};

// A homeowner couple retiring at 55 on ~$1.1M combined. Again the Age Pension is
// decisive: comfortable with it, precarious without.
const retire55Couple: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "couple",
  people: [
    { ...DEFAULT_PLAN.people[0], currentAge: 55, superBalance: 375_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
    { ...DEFAULT_PLAN.people[0], currentAge: 55, superBalance: 375_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
  ],
  superMode: "individual",
  homeowner: true,
  outsideSuper: 350_000,
  annualOutsideSavings: 0,
  retirementAge: 55,
  spendingMode: "flat",
  targetSpending: 60_000,
  investmentReturn: 7,
  returnVolatility: 11,
  inflation: 2.5,
  lifeExpectancy: 90,
};

// Fixed vs flexible (Guyton-Klinger guardrails) safe withdrawal rate. A relatable
// "good saver" single retiring at 60 on $1.2M ($900k super + $300k outside),
// homeowner, spending $55k. The point isn't the plan — it's the two SWR markers the
// dashboard now draws: a STEADY (fixed-spending) SWR ~5.1% and a FLEXIBLE (guardrails)
// SWR ~6.8% — the ~1.7pp uplift dynamic spending buys, and the honest trade-off (a
// rough run trims the flexible plan to ~$57k for ~28 years, below the steady level).
const swrGuardrails: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "single",
  people: [
    { ...DEFAULT_PLAN.people[0], currentAge: 60, superBalance: 900_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
  ],
  superMode: "individual",
  homeowner: true,
  outsideSuper: 300_000,
  annualOutsideSavings: 0,
  retirementAge: 60,
  spendingMode: "flat",
  targetSpending: 55_000,
  investmentReturn: 7,
  returnVolatility: 11,
  inflation: 2.5,
  lifeExpectancy: 90,
};

// The leaner "good saver" counterpart to the $1.2M SWR-vs-guardrails scenario: a
// single homeowner retiring at 60 on $650k ($500k super + $150k outside), spending
// $46k (right at their steady SWR). Same guardrails uplift (~1.8pp), but the rates
// sit HIGHER — steady SWR ~7.1%, flexible ~8.9% — because a leaner portfolio leans
// harder on the means-tested Age Pension backstop. The pair shows the uplift is
// consistent across wealth levels while the absolute rate reflects pension reliance.
const swrGuardrailsGoodSaver: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "single",
  people: [
    { ...DEFAULT_PLAN.people[0], currentAge: 60, superBalance: 500_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
  ],
  superMode: "individual",
  homeowner: true,
  outsideSuper: 150_000,
  annualOutsideSavings: 0,
  retirementAge: 60,
  spendingMode: "flat",
  targetSpending: 46_000,
  investmentReturn: 7,
  returnVolatility: 11,
  inflation: 2.5,
  lifeExpectancy: 90,
};

// A stretched early retiree for the historical stress test: retire at 52 on $1.05M
// ($600k super + $450k outside), $50k/yr (4.8%). The smooth projection LASTS — so it
// looks fine — but replaying ACTUAL historical returns, retiring straight into most
// major downturns on FIXED spending fails (only 2/7 eras survive); flexible spending
// rescues it to 5/7, and the flexibility ladder shows the cliff (6/3/3/2 as you go
// from cutting to the bone to refusing to cut). The point is sequence risk + how
// flexible you'd really be — which a single Monte Carlo number hides. 38-yr horizon
// to 90, 8-year bridge to preservation age 60.
const retire52SequenceRisk: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "single",
  people: [
    { ...DEFAULT_PLAN.people[0], currentAge: 52, superBalance: 600_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
  ],
  superMode: "individual",
  homeowner: true,
  outsideSuper: 450_000,
  annualOutsideSavings: 0,
  retirementAge: 52,
  spendingMode: "flat",
  targetSpending: 50_000,
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
  {
    slug: "retire-55-single",
    title: "Retire @55 · single · $42k",
    blurb:
      "A single homeowner retiring at 55 with $750k ($500k super + $250k outside), spending $42k/yr — a realistic 'good saver' early retirement where the Age Pension does the heavy lifting.",
    context:
      "The everyday counterpart to the FIRE millionaires. Retire at 55 is only a 5-year bridge to preservation age (60), so relatable balances work. Success ~88% — but strip out the Age Pension and it collapses to ~12% (+76pp). For an ordinary early retiree the means-tested pension isn't a rounding error, it's the backbone. The $250k outside funds the 55→60 bridge; the pension starts at 67. Contrast the $1–2M FIRE cases where the pension barely moves the needle.",
    threadUrl: "",
    sortOrder: 30,
    data: retire55Single,
  },
  {
    slug: "retire-55-couple",
    title: "Retire @55 · couple · $60k",
    blurb:
      "A homeowner couple retiring at 55 with ~$1.1M combined ($750k super + $350k outside), spending $60k/yr — the Age Pension turns a shaky plan into a comfortable one.",
    context:
      "$375k super each + $350k outside, $60k/yr to 90. Success ~93% with the Age Pension, ~16% without (+77pp). As with the single, the means-tested pension is decisive for ordinary retirees — the mirror image of the high-net-worth FIRE scenarios. Together the four scenarios show the pension's importance is driven by wealth/expense: decisive for normal retirees and low-spend early retirees, marginal only for high-spend millionaires.",
    threadUrl: "",
    sortOrder: 40,
    data: retire55Couple,
  },
  {
    slug: "swr-vs-guardrails",
    title: "Fixed vs flexible SWR · guardrails",
    blurb:
      "Retire at 60 on $1.2M ($900k super + $300k outside), homeowner single. Two safe-withdrawal-rate markers: a steady ~5.1% and a flexible (Guyton-Klinger guardrails) ~6.8% — the uplift dynamic spending buys, with the honest trade-off.",
    context:
      "Demonstrates the SWR + guardrails combo for a Reddit methodology discussion. The dashboard withdrawal-rate bar draws TWO markers: steady SWR ~5.1% ($61k/yr fixed) and flexible SWR ~6.8% ($82k/yr guardrails start) — a +1.7pp uplift, consistent with Guyton-Klinger. The honest counterweight: in a p10 rough run the flexible plan trims to ~$57k (−30%) for ~28 years, BELOW the steady $61k, because 'lasting' is achieved by cutting. Open What-If → Flexible spending (guardrails) to see the uplift line + trade-off. Ask r/fiaustralia: is the 'flexible SWR' framing fair, are the guardrail params (±20% rails, ±10% steps, essentials floor) sensible, and would bootstrapped historical sequences change the advantage?",
    threadUrl: "", // paste the Reddit thread URL once posted
    sortOrder: 50,
    data: swrGuardrails,
  },
  {
    slug: "swr-guardrails-good-saver",
    title: "Good saver · fixed vs flexible SWR",
    blurb:
      "The leaner counterpart: retire at 60 on $650k ($500k super + $150k outside), homeowner single, $46k/yr. Steady SWR ~7.1% vs flexible (guardrails) ~8.9% — same ~1.8pp uplift, higher rates because a modest portfolio leans on the Age Pension.",
    context:
      "The 'good saver' pair to swr-vs-guardrails. $650k, retire 60, $46k (right at the steady SWR). Steady SWR ~7.1% ($46k) vs flexible SWR ~8.9% ($58k) — a +1.8pp uplift, same magnitude as the $1.2M case, but the absolute rates sit HIGHER because the means-tested Age Pension backstop does more work for a leaner portfolio (this is the AU twist on the US 4% rule). Honest trade-off: a p10 rough run trims the flexible plan to ~$41k (−30%) for ~29 years. Together the pair shows the guardrails uplift is consistent across wealth levels while the safe rate itself reflects pension reliance. Same Reddit methodology questions as swr-vs-guardrails.",
    threadUrl: "",
    sortOrder: 60,
    data: swrGuardrailsGoodSaver,
  },
  {
    slug: "retire-52-sequence-risk",
    title: "Retire @52 · $50k · sequence risk",
    blurb:
      "Retire at 52 on $1.05M ($600k super + $450k outside), $50k/yr (4.8%). The smooth projection lasts — but retire straight into most historical downturns on fixed spending and it fails. Run the stress test: how many you survive depends on how far you'd actually cut.",
    context:
      "Stress-test demo for the flexible-spending / sequence-risk Reddit thread. Retire 52, $1.05M ($600k super + $450k outside), $50k (4.8%), 38-yr horizon to 90. The central projection LASTS, so a single 'you're fine' number hides the risk. Historical stress test (ACTUAL 1928–2025 US returns as a proxy): FIXED spending survives only 2/7 eras; FLEXIBLE (guardrails) rescues to 5/7; and the flexibility ladder shows the cliff — 6/7 cutting to the bone, 3/7 at −10%, 2/7 if you won't cut. Directly answers the 'flexibility is easier said than done' point: your safety rests on how deep a cut you'd actually accept, which the MC just assumes. Open 'Stress-test against history' → Flexible.",
    threadUrl: "",
    sortOrder: 70,
    data: retire52SequenceRisk,
  },
];
