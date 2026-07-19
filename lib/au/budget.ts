// Guided retirement-budget logic. The dollar figures live in the versioned
// EngineConfig (config.asfa.breakdown — auditable reference data); the
// presentation metadata (labels, essential/discretionary, sub-items, input
// affordance) lives here in code and joins to the figures by category `key`.

import type { EngineConfig } from "./config";
import type { BudgetLifestyle, Household, RetirementPlan, SpendingStages } from "./types";

export interface BudgetCategoryMeta {
  key: string;
  label: string;
  hint: string; // short descriptor shown under the label
  essential: boolean; // needs (floor) vs wants (flex)
  input: "stepper" | "slider"; // fixed bills you know → stepper; lifestyle spend → slider
  items: string[]; // sub-items listed when the card is expanded
}

// Order here is the order the cards appear: essentials first, then discretionary.
export const BUDGET_CATEGORY_META: BudgetCategoryMeta[] = [
  {
    key: "housing",
    label: "Housing",
    hint: "Rates, water, insurance, upkeep",
    essential: true,
    input: "stepper",
    items: ["Council rates", "Water", "Home & contents insurance", "Repairs & upkeep"],
  },
  {
    key: "energy",
    label: "Energy",
    hint: "Electricity & gas",
    essential: true,
    input: "stepper",
    items: ["Electricity", "Gas"],
  },
  {
    key: "food",
    label: "Food & groceries",
    hint: "Groceries and fresh food",
    essential: true,
    input: "stepper",
    items: ["Groceries", "Fresh food"],
  },
  {
    key: "health",
    label: "Health",
    hint: "Insurance, chemist, out-of-pocket",
    essential: true,
    input: "stepper",
    items: ["Private health insurance", "Chemist & pharmacy", "Out-of-pocket & co-payments"],
  },
  {
    key: "transport",
    label: "Transport",
    hint: "Car running costs, public transport",
    essential: true,
    input: "stepper",
    items: ["Fuel, rego, servicing & insurance", "Public transport"],
  },
  {
    key: "household",
    label: "Household, comms & clothing",
    hint: "Phone, internet, goods, clothing",
    essential: true,
    input: "stepper",
    items: ["Phone & internet", "Household goods & services", "Clothing & footwear", "Personal care"],
  },
  {
    key: "leisure",
    label: "Leisure & dining out",
    hint: "Eating out, hobbies, subscriptions",
    essential: false,
    input: "slider",
    items: ["Eating out & takeaway", "Alcohol", "Recreation & hobbies", "Streaming & subscriptions"],
  },
  {
    key: "travel",
    label: "Travel & holidays",
    hint: "Domestic and overseas trips",
    essential: false,
    input: "slider",
    items: ["Domestic holidays", "Overseas holidays"],
  },
];

const META_BY_KEY = new Map(BUDGET_CATEGORY_META.map((m) => [m.key, m]));

export function categoryMeta(key: string): BudgetCategoryMeta | undefined {
  return META_BY_KEY.get(key);
}

export function isEssential(key: string): boolean {
  return META_BY_KEY.get(key)?.essential ?? true;
}

const round10 = (x: number) => Math.round(x / 10) * 10;

/**
 * Pre-fill every category for a lifestyle preset. Modest/Comfortable read the
 * ASFA figures directly; Premium uplifts Comfortable (essentials modestly,
 * discretionary more). Renters get the rent figure in place of owner-housing.
 */
export function presetCategories(
  config: EngineConfig,
  household: Household,
  homeowner: boolean,
  lifestyle: BudgetLifestyle,
): Record<string, number> {
  const bd = config.asfa.breakdown;
  const out: Record<string, number> = {};
  for (const c of bd.categories) {
    const essential = isEssential(c.key);
    let value: number;
    if (lifestyle === "modest") value = c.modest[household];
    else if (lifestyle === "comfortable") value = c.comfortable[household];
    else {
      const uplift = essential ? bd.premiumUplift.essential : bd.premiumUplift.discretionary;
      value = round10(c.comfortable[household] * uplift);
    }

    if (c.key === "housing" && !homeowner) {
      const rent =
        lifestyle === "modest"
          ? bd.renterHousing.modest[household]
          : bd.renterHousing.comfortable[household];
      value = lifestyle === "premium" ? round10(rent * bd.premiumUplift.essential) : rent;
    }

    out[c.key] = value;
  }
  return out;
}

/** Total annual spend across all categories. */
export function budgetTotal(categories: Record<string, number>): number {
  return Object.values(categories).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
}

/** Split the total into essential (floor) and discretionary (flex). */
export function budgetSplit(categories: Record<string, number>): {
  essential: number;
  discretionary: number;
} {
  let essential = 0;
  let discretionary = 0;
  for (const [key, amt] of Object.entries(categories)) {
    if (!Number.isFinite(amt)) continue;
    if (isEssential(key)) essential += amt;
    else discretionary += amt;
  }
  return { essential, discretionary };
}

export interface CategorySpendRow {
  key: string;
  label: string;
  hint: string;
  essential: boolean;
  baselineAnnual: number; // household $/yr at full spend (no cut)
  annual: number; // household $/yr at this spend level (essentials held; discretionary scaled)
}

export interface SpendBreakdown {
  rows: CategorySpendRow[];
  fullSpend: number; // the plan's uncut annual spend
  essential: number; // essentials $/yr (held flat through cuts)
  discretionaryFull: number; // discretionary $/yr at full spend
  discretionaryKept: number; // discretionary $/yr remaining at this level
  keptFraction: number; // 0..1 of discretionary retained
  estimated: boolean; // true when derived from ASFA averages (no user budget)
}

/**
 * Decompose a target annual spend into per-category amounts the way the guardrails
 * flex it: essentials are held flat and the cut comes entirely out of discretionary.
 * Uses the user's own budget categories when present, otherwise an ASFA modest mix
 * scaled so essentials match the essentials floor and the rest is discretionary
 * (the same split `essentialsFloor` uses, so it lines up with the flexibility ladder).
 */
export function spendBreakdownAtFloor(plan: RetirementPlan, config: EngineConfig, floor: number): SpendBreakdown {
  const hasBudget = !!plan.budget;
  const baseCats = plan.budget?.categories ?? presetCategories(config, plan.household, plan.homeowner, "modest");
  const { essential: baseEss, discretionary: baseDisc } = budgetSplit(baseCats);
  const fullSpend = Math.round(plan.spendingMode === "stages" ? plan.spendingStages.goGo : plan.targetSpending);
  // Essentials floor never exceeds current spend (matches strategies.essentialsFloor).
  const essential = Math.min(Math.round(baseEss), fullSpend);
  const discretionaryFull = Math.max(0, fullSpend - essential);
  // Scale the base mix so essentials sum to `essential` and discretionary to `discretionaryFull`.
  const essScale = baseEss > 0 ? essential / baseEss : 0;
  const discScale = baseDisc > 0 ? discretionaryFull / baseDisc : 0;
  const keptFraction = discretionaryFull > 0 ? Math.min(1, Math.max(0, (floor - essential) / discretionaryFull)) : 0;
  const rows: CategorySpendRow[] = BUDGET_CATEGORY_META.filter((m) => (baseCats[m.key] ?? 0) > 0).map((m) => {
    const scaled = (baseCats[m.key] ?? 0) * (m.essential ? essScale : discScale);
    const baselineAnnual = Math.round(scaled);
    const annual = m.essential ? baselineAnnual : Math.round(scaled * keptFraction);
    return { key: m.key, label: m.label, hint: m.hint, essential: m.essential, baselineAnnual, annual };
  });
  return {
    rows,
    fullSpend,
    essential,
    discretionaryFull,
    discretionaryKept: Math.round(discretionaryFull * keptFraction),
    keptFraction,
    estimated: !hasBudget,
  };
}

const round100 = (x: number) => Math.round(x / 100) * 100;

/**
 * Seed go-go / slow-go / no-go stages from a budget using the retirement
 * "spending smile": essentials stay flat in real terms while the discretionary
 * portion declines through the later phases.
 */
export function budgetToStages(
  config: EngineConfig,
  categories: Record<string, number>,
): SpendingStages {
  const { essential, discretionary } = budgetSplit(categories);
  const s = config.asfa.breakdown.smile;
  return {
    goGo: round100(essential + discretionary),
    slowGo: round100(essential + discretionary * s.slowGoDiscretionary),
    noGo: round100(essential + discretionary * s.noGoDiscretionary),
    slowGoAge: s.slowGoAge,
    noGoAge: s.noGoAge,
  };
}
