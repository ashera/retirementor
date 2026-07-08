// What-If strategies: each is a pure transform (plan, params) => plan, plus an
// applicability guard so the catalog reflects the baseline scenario. The What-If
// board toggles these on a baseline and re-runs the engine on the composed plan.
// Phase 1 covers the levers that already map to the engine; home downsizing,
// sell-&-rent and part-time work land in later phases.

import type { RetirementPlan } from "./types";
import { getInvestmentProperties } from "./types";

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
}

export interface StrategyCard {
  id: string;
  group: StrategyGroup;
  label: string;
  blurb?: string;
  exclusive?: string; // only one active card per exclusivity key (e.g. "home")
  params: StrategyParam[];
  apply: (plan: RetirementPlan, values: Record<string, number>) => RetirementPlan;
}

const maxCurrentAge = (p: RetirementPlan) => Math.max(...p.people.map((x) => x.currentAge));
const primarySpend = (p: RetirementPlan) =>
  p.spendingMode === "stages" ? p.spendingStages.goGo : p.targetSpending;

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
  if (spend > 25_000) {
    cards.push({
      id: "spend-less",
      group: "timing",
      label: "Spend less",
      blurb: "Trim your discretionary spending (staged amounts scale together).",
      params: [
        {
          key: "spend",
          label: "Spend",
          min: 20_000,
          max: spend,
          step: 1_000,
          default: Math.round(spend * 0.9),
          prefix: "$",
          suffix: "/yr",
        },
      ],
      apply: (p, v) => withSpend(p, v.spend),
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
