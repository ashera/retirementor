// What-If strategies: each is a pure transform (plan, params) => plan, plus an
// applicability guard so the catalog reflects the baseline scenario. The What-If
// board toggles these on a baseline and re-runs the engine on the composed plan.
// Phase 1 covers the levers that already map to the engine; home downsizing,
// sell-&-rent and part-time work land in later phases.

import type { RetirementPlan } from "./types";
import { getInvestmentProperties } from "./types";
import { fmtCurrency } from "./format";
import { propertyValueAt, capitalGainsTax, netSaleProceeds } from "./property";
import { budgetSplit, presetCategories } from "./budget";
import { incomeTax } from "./tax";
import { simulate } from "./simulate";
import { runMonteCarlo } from "./montecarlo";
import type { EngineConfig } from "./config";

export type StrategyGroup = "home" | "mortgage" | "property" | "timing" | "work";

export const GROUP_LABEL: Record<StrategyGroup, string> = {
  home: "Your home",
  mortgage: "Mortgage",
  property: "Investment property",
  timing: "Timing & contributions",
  work: "Work",
};

export interface StrategyParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  prefix?: string;
  suffix?: string;
  // Optional upper bound derived from the card's other live param values (e.g.
  // the downsizer contribution can't exceed the equity actually freed, which
  // depends on the chosen new-home value and downsize age). The effective slider
  // max is min(max, dynamicMax(values)); returns Infinity to impose no extra cap.
  dynamicMax?: (values: Record<string, number>) => number;
  hint?: string;
}

export interface StrategyCard {
  id: string;
  group: StrategyGroup;
  label: string;
  blurb?: string;
  exclusive?: string; // only one active card per exclusivity key (e.g. "home")
  params: StrategyParam[];
  // Optional live consequence line derived from the card's current param values
  // (e.g. the CGT and net proceeds at the chosen sale age). Shown under the params.
  note?: (values: Record<string, number>) => string;
  apply: (plan: RetirementPlan, values: Record<string, number>) => RetirementPlan;
}

const maxCurrentAge = (p: RetirementPlan) => Math.max(...p.people.map((x) => x.currentAge));
const primarySpend = (p: RetirementPlan) =>
  p.spendingMode === "stages" ? p.spendingStages.goGo : p.targetSpending;

/**
 * The essential ("needs") floor of a plan's spending, held fixed by the Adjust
 * discretionary spending lever. Uses the plan's own guided budget when it has
 * one; otherwise the essential portion of an ASFA 'modest' budget for the
 * household/tenure. Never exceeds current spend (you can't hold more than you spend).
 */
export function essentialsFloor(plan: RetirementPlan, config: EngineConfig): number {
  const cats = plan.budget?.categories ?? presetCategories(config, plan.household, plan.homeowner, "modest");
  const essential = budgetSplit(cats).essential;
  return Math.min(Math.round(essential), Math.round(primarySpend(plan)));
}

/** Set the plan's spend, scaling any staged amounts proportionally to keep shape. */
export function withSpend(p: RetirementPlan, spend: number): RetirementPlan {
  if (p.spendingMode !== "stages") return { ...p, targetSpending: Math.round(spend) };
  const base = p.spendingStages.goGo || spend || 1;
  const f = spend / base;
  return {
    ...p,
    targetSpending: Math.round(spend),
    spendingStages: {
      ...p.spendingStages,
      goGo: Math.round(spend),
      slowGo: Math.round(p.spendingStages.slowGo * f),
      noGo: Math.round(p.spendingStages.noGo * f),
    },
  };
}

/**
 * The highest spend (today's $) at which the plan's money still lasts to life
 * expectancy, found by bisection over withSpend(). Rounded down to $1,000. Used
 * for the "you could spend up to ~$X" read-out on the Adjust spending lever.
 */
export function maxSustainableSpend(plan: RetirementPlan, config: EngineConfig): number {
  const lasts = (s: number) => simulate(withSpend(plan, s), config).lastsToLifeExpectancy;
  const lo0 = 10_000;
  const hi0 = 400_000;
  if (!lasts(lo0)) return lo0; // can't sustain even a minimal spend
  if (lasts(hi0)) return hi0; // sustains beyond the search ceiling
  let lo = lo0;
  let hi = hi0;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (lasts(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo / 1_000) * 1_000;
}

/**
 * The highest spend (today's $) whose Monte Carlo success rate still meets
 * `targetSuccess` (e.g. 0.85) — a *prudent* safe-spend that accounts for
 * sequence-of-returns risk, unlike {@link maxSustainableSpend} which only uses
 * the assumed average return. Bisection; success falls monotonically with spend.
 * ~12 MC runs, so callers should debounce it off the interaction path.
 */
export function maxSpendForConfidence(
  plan: RetirementPlan,
  config: EngineConfig,
  targetSuccess: number,
  mc: { iterations: number; seed: number },
): number {
  const success = (s: number) => runMonteCarlo(withSpend(plan, s), config, mc).successRate;
  const lo0 = 10_000;
  const hi0 = 300_000;
  if (success(lo0) < targetSuccess) return lo0; // can't hit the target even minimally
  if (success(hi0) >= targetSuccess) return hi0; // comfortably funded beyond the ceiling
  let lo = lo0;
  let hi = hi0;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (success(mid) >= targetSuccess) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo / 1_000) * 1_000;
}

/** The default value each param takes for a plan (used when a card is toggled on
 *  before the user tweaks anything). */
export function defaultValues(card: StrategyCard): Record<string, number> {
  return Object.fromEntries(card.params.map((pm) => [pm.key, pm.default]));
}

/** Resolve a card's values: its defaults, overridden by any user edits. */
export function resolveValues(card: StrategyCard, overrides?: Record<string, number>): Record<string, number> {
  return { ...defaultValues(card), ...(overrides ?? {}) };
}

/** Build the strategy catalog applicable to a baseline plan. */
export function buildStrategyCatalog(plan: RetirementPlan): StrategyCard[] {
  const cards: StrategyCard[] = [];
  const oldest = maxCurrentAge(plan);
  const working = oldest < plan.retirementAge;
  const props = getInvestmentProperties(plan);

  // --- Your home ---
  if (plan.homeowner) {
    const homeVal = Math.max(300_000, Math.round(plan.home?.value ?? 900_000));
    const loan = plan.mortgage?.balance ?? 0;
    const people = plan.people.length;
    const superCap = 300_000 * people; // downsizer contribution cap ($300k/person)
    const oldestNow = Math.max(...plan.people.map((pp) => pp.currentAge));
    const homeGrowth = (plan.home?.growthReal ?? 2) / 100;
    // Equity freed by a downsize to `newValue` at `age`: the home appreciates in
    // real terms until then, net of the new home and any loan. The downsizer
    // contribution can't exceed this — so it bounds the "into super" slider.
    const freedEquity = (v: Record<string, number>) => {
      const yrs = Math.max(0, (v.age ?? oldestNow) - oldestNow);
      const grown = homeVal * Math.pow(1 + homeGrowth, yrs);
      return Math.max(0, grown - (v.newValue ?? homeVal) - loan);
    };
    cards.push({
      id: "downsize",
      group: "home",
      exclusive: "home",
      label: "Downsize your home",
      blurb: `Move from your ${fmtCurrency(homeVal)} home to a cheaper one — the difference${loan ? ", after discharging your mortgage," : ""} is freed into savings, with up to $300k per person able to go into super as a downsizer contribution. Your new (smaller) home stays exempt from the Age Pension, so your net worth carries over — it's just reallocated.`,
      params: [
        {
          key: "age",
          label: "Downsize at age",
          min: Math.max(60, plan.retirementAge),
          max: plan.lifeExpectancy,
          step: 1,
          default: Math.min(plan.lifeExpectancy, Math.max(plan.retirementAge, 66)),
          suffix: "yrs",
        },
        {
          key: "newValue",
          label: "Downsize to a home worth",
          min: 100_000,
          max: homeVal,
          step: 25_000,
          default: Math.round(homeVal * 0.6),
          prefix: "$",
        },
        {
          key: "toSuper",
          label: "Into super (downsizer)",
          min: 0,
          max: superCap,
          step: 10_000,
          default: 0,
          prefix: "$",
          // Can't put more into super than the downsize actually frees.
          dynamicMax: freedEquity,
        },
      ],
      apply: (p, v) => ({
        ...p,
        // Keep the ORIGINAL home value; the new (smaller) value lives on the
        // downsize event, so the engine can grow the home and track it from big →
        // small, computing the freed equity from the grown value at the downsize
        // age so net worth carries across, just reallocated.
        home: {
          value: Math.max(0, p.home?.value ?? 900_000),
          growthReal: p.home?.growthReal ?? 2,
          downsize: { atAge: v.age, newValue: v.newValue, toSuper: v.toSuper },
        },
      }),
    });

    cards.push({
      id: "sell-and-rent",
      group: "home",
      exclusive: "home",
      label: "Sell up and rent",
      blurb: `Sell your ${fmtCurrency(homeVal)} home at the chosen age, freeing all your equity${loan ? " (net of the mortgage)" : ""} into savings, then rent. You move to the higher non-homeowner Age Pension asset thresholds, but pay rent for life (and lose the exempt home).`,
      params: [
        {
          key: "age",
          label: "Sell at age",
          min: Math.max(60, plan.retirementAge),
          max: plan.lifeExpectancy,
          step: 1,
          default: Math.min(plan.lifeExpectancy, Math.max(plan.retirementAge, 70)),
          suffix: "yrs",
        },
        { key: "rent", label: "Rent", min: 0, max: 80_000, step: 1_000, default: 30_000, prefix: "$", suffix: "/yr" },
      ],
      apply: (p, v) => ({
        ...p,
        home: {
          value: Math.max(0, p.home?.value ?? 900_000),
          growthReal: p.home?.growthReal ?? 2,
          sellAndRent: { atAge: v.age, rentPerYear: v.rent },
        },
      }),
    });
  }

  // --- Mortgage ---
  if (plan.mortgage && plan.mortgage.strategy !== "clear_at_retirement") {
    cards.push({
      id: "clear-mortgage",
      group: "mortgage",
      label: "Clear the mortgage with super",
      blurb: "Repay the balance with a tax-free super lump sum at retirement — lowers your assessable assets, which can lift the Age Pension.",
      params: [],
      apply: (p) => (p.mortgage ? { ...p, mortgage: { ...p.mortgage, strategy: "clear_at_retirement" } } : p),
    });
  }

  // --- Investment properties (one card each, when currently held) ---
  props.forEach((pr, i) => {
    if (pr.strategy === "sell") return; // already selling in the baseline
    const name = pr.name?.trim() || (props.length > 1 ? `property ${i + 1}` : "the property");
    cards.push({
      id: `sell-prop-${i}`,
      group: "property",
      label: `Sell ${name}`,
      blurb: "Net proceeds (after CGT and the loan) move into your savings.",
      params: [
        {
          key: "age",
          label: "Sell at age",
          min: plan.retirementAge,
          max: plan.lifeExpectancy,
          step: 1,
          default: Math.min(plan.lifeExpectancy, plan.retirementAge + 5),
          suffix: "yrs",
        },
      ],
      // Live tax read-out at the chosen sale age: sale price, CGT and what's left.
      note: (v) => {
        const value = propertyValueAt(pr, Math.max(0, v.age - oldest));
        const cgt = capitalGainsTax(pr, value);
        const loan = pr.loanBalance ?? 0;
        const net = netSaleProceeds(pr, value);
        return `At age ${v.age}: sells for ~${fmtCurrency(value)}${loan ? `, less the ${fmtCurrency(loan)} loan` : ""}, less ~${fmtCurrency(cgt)} CGT → ~${fmtCurrency(net)} into savings.`;
      },
      apply: (p, v) => {
        const arr = getInvestmentProperties(p).map((q, qi) =>
          qi === i ? { ...q, strategy: "sell" as const, sellAtAge: v.age } : q,
        );
        return { ...p, investmentProperties: arr, investmentProperty: undefined };
      },
    });
  });

  // --- Timing & contributions ---
  if (oldest < 75) {
    cards.push({
      id: "retire-later",
      group: "timing",
      label: "Retire later",
      blurb: "More years of contributions and fewer to fund.",
      params: [
        {
          key: "age",
          label: "Retire at",
          min: Math.max(55, oldest),
          max: 75,
          step: 1,
          default: Math.min(75, plan.retirementAge + 3),
          suffix: "yrs",
        },
      ],
      apply: (p, v) => ({ ...p, retirementAge: v.age }),
    });
  }

  const spend = Math.round(primarySpend(plan));
  if (spend > 0) {
    cards.push({
      id: "adjust-spending",
      group: "timing",
      label: "Adjust discretionary spending",
      blurb: "Your essentials stay fixed — this flexes only the discretionary spending on top. Drag down to trim it or up to live it up, and watch how long your money lasts and your net worth respond.",
      params: [
        {
          key: "spend",
          label: "Total spend",
          // Floor is raised to the essentials level in the board (needs config); the
          // draggable range above it is the discretionary portion.
          min: Math.min(15_000, Math.round(spend * 0.6)),
          max: Math.min(400_000, Math.max(Math.round(spend * 2), spend + 60_000)),
          step: 1_000,
          default: spend,
          prefix: "$",
          suffix: "/yr",
        },
      ],
      apply: (p, v) => withSpend(p, v.spend),
    });
  }

  // --- Work ---
  if (oldest < 75) {
    cards.push({
      id: "part-time-work",
      group: "work",
      label: "Work part-time in early retirement",
      blurb: "Earn some income in your first retirement years — it offsets what you draw down. Assessable under the Age Pension income test, but the Work Bonus exempts the first $7,800/yr each.",
      params: [
        { key: "perYear", label: "Earn per year", min: 0, max: 60_000, step: 1_000, default: 20_000, prefix: "$", suffix: "/yr" },
        {
          key: "untilAge",
          label: "Until age",
          min: plan.retirementAge + 1,
          max: Math.min(80, plan.lifeExpectancy),
          step: 1,
          default: Math.min(plan.lifeExpectancy, plan.retirementAge + 5),
          suffix: "yrs",
        },
      ],
      apply: (p, v) => ({ ...p, workIncome: { perYear: v.perYear, untilAge: v.untilAge } }),
    });
  }

  if (working && plan.people[0]?.salary > 0) {
    cards.push({
      id: "salary-sacrifice",
      group: "timing",
      label: "Salary-sacrifice more",
      blurb: "Extra pre-tax super each year while you're still working.",
      params: [
        { key: "extra", label: "Extra per year", min: 0, max: 30_000, step: 1_000, default: 10_000, prefix: "$", suffix: "/yr" },
      ],
      apply: (p, v) => ({
        ...p,
        people: p.people.map((pp, i) =>
          i === 0 ? { ...pp, voluntaryConcessional: pp.voluntaryConcessional + v.extra } : pp,
        ),
      }),
    });
  }

  // Transition to Retirement — only when there's a window to run it in: from
  // preservation age (60) up to retirement, while still working.
  if (working && plan.people[0]?.salary > 0 && plan.retirementAge > 60) {
    const p0 = plan.people[0];
    const startAge = Math.max(60, oldest);
    const windowYears = Math.max(0, plan.retirementAge - startAge);
    cards.push({
      id: "ttr",
      group: "timing",
      label: "Transition to Retirement",
      blurb: "From age 60 you can salary-sacrifice more and draw a tax-free TTR pension to replace the pay you give up — shifting income from your marginal rate down to 15% tax. Your take-home holds; the tax saved builds your super.",
      params: [
        { key: "extra", label: "Extra sacrifice via TTR", min: 0, max: 30_000, step: 1_000, default: 15_000, prefix: "$", suffix: "/yr" },
      ],
      note: (v) => {
        const taxable = Math.max(0, p0.salary - p0.voluntaryConcessional);
        const taxSaved = incomeTax(taxable) - incomeTax(Math.max(0, taxable - v.extra));
        const benefit = Math.max(0, taxSaved - v.extra * 0.15);
        return `Ages ${startAge}–${plan.retirementAge} (${windowYears} yr${windowYears === 1 ? "" : "s"}): take-home unchanged, about ${fmtCurrency(benefit)}/yr of tax saving into super (capped at the concessional limit).`;
      },
      apply: (p, v) => ({ ...p, ttr: { extraSacrifice: v.extra } }),
    });
  }

  return cards;
}

/** Compose the active strategies onto the baseline plan. `active` holds enabled
 *  card ids; `values` holds any per-card param overrides. Exclusive groups keep
 *  only the first active card. */
export function applyStrategies(
  plan: RetirementPlan,
  cards: StrategyCard[],
  active: Set<string>,
  values: Record<string, Record<string, number>>,
): RetirementPlan {
  const seenExclusive = new Set<string>();
  let p = plan;
  for (const card of cards) {
    if (!active.has(card.id)) continue;
    if (card.exclusive) {
      if (seenExclusive.has(card.exclusive)) continue;
      seenExclusive.add(card.exclusive);
    }
    p = card.apply(p, resolveValues(card, values[card.id]));
  }
  return p;
}
