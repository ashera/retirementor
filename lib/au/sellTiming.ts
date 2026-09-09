// Solver: the AGE to sell an investment property that most lifts what you can SPEND.
//
// Objective = the highest yearly spend the plan can sustain to life expectancy if the
// property is sold at a given age (a finer, unrounded twin of maxSustainableSpend).
// Selling converts an illiquid, appreciating asset into spendable savings: sell too
// early and you forgo growth + rent; sell too late and there are fewer years left to
// draw the freed proceeds — so the spend you can sustain typically PEAKS at a mid-range
// age, then falls. We scan every candidate age (the outcome isn't monotone), evaluate
// each ON TOP of the other active levers, and also measure holding for life. Uses only
// deterministic simulate() runs (no Monte Carlo), so it's fast enough to run on click.
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan } from "@/lib/au/types";
import { composeScenario, type StrategyLayer } from "@/lib/au/scenario";
import { buildStrategyCatalog, withSpend } from "@/lib/au/strategies";
import { simulate } from "@/lib/au/simulate";

export interface SellYearPoint {
  age: number;
  spend: number; // highest sustainable yearly spend if the property is sold at this age
}

export interface SellYearResult {
  propertyIndex: number;
  bestAge: number; // the spend-maximising sell age (oldest-person axis)
  bestSpend: number; // sustainable yearly spend at bestAge (raw, unrounded)
  currentAge: number | null; // the age currently set on the lever (null if not active yet)
  currentSpend: number | null;
  holdSpend: number; // sustainable spend if the property is never sold
  sellBeatsHold: boolean; // does selling at the best age beat keeping it for life?
  gainVsCurrent: number; // bestSpend − currentSpend (0 if no current age)
  range: { min: number; max: number };
  curve: SellYearPoint[]; // sustainable spend by sell age — for a "why" readout / sparkline
}

/** Highest spend that still lasts to life expectancy — a finer, unrounded bisection
 *  (maxSustainableSpend rounds to $1,000, which would flatten the peak into ties). */
function sustainableSpend(plan: RetirementPlan, config: EngineConfig): number {
  const lasts = (s: number) => simulate(withSpend(plan, s), config).lastsToLifeExpectancy;
  const lo0 = 10_000;
  const hi0 = 400_000;
  if (!lasts(lo0)) return lo0; // can't sustain even a minimal spend
  if (lasts(hi0)) return hi0; // sustains beyond the search ceiling
  let lo = lo0;
  let hi = hi0;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (lasts(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Find the sell age that most lifts sustainable spending for property `cardId`
 * ("sell-prop-{i}"), evaluated on top of the currently-active strategy layer.
 * Returns null if the card/param can't be resolved (e.g. no such held property).
 */
export function bestSellYear(
  base: RetirementPlan,
  strategies: StrategyLayer,
  config: EngineConfig,
  cardId: string,
): SellYearResult | null {
  const m = /^sell-prop-(\d+)$/.exec(cardId);
  if (!m) return null;
  const propertyIndex = Number(m[1]);

  // Use the card's own declared range so the solver matches the slider exactly.
  const card = buildStrategyCatalog(base, { config }).find((c) => c.id === cardId);
  const param = card?.params.find((p) => p.key === "age");
  if (!card || !param) return null;
  const min = Math.round(param.min);
  const max = Math.round(param.max);
  if (max < min) return null;

  const otherActive = strategies.active.filter((id) => id !== cardId);
  const curve: SellYearPoint[] = [];
  let bestAge = min;
  let bestSpend = -Infinity;
  for (let age = min; age <= max; age++) {
    const layer: StrategyLayer = {
      active: [...otherActive, cardId],
      values: { ...strategies.values, [cardId]: { ...strategies.values[cardId], age } },
    };
    const spend = sustainableSpend(composeScenario(base, layer, config), config);
    curve.push({ age, spend });
    if (spend > bestSpend) {
      bestSpend = spend;
      bestAge = age;
    }
  }

  // Hold baseline: the same layer with the sell lever off (property kept for life).
  const holdSpend = sustainableSpend(
    composeScenario(base, { active: otherActive, values: strategies.values }, config),
    config,
  );

  const wasActive = strategies.active.includes(cardId);
  const currentAge = wasActive ? Math.round(strategies.values[cardId]?.age ?? param.default) : null;
  const currentSpend =
    currentAge != null ? curve.find((p) => p.age === currentAge)?.spend ?? null : null;

  return {
    propertyIndex,
    bestAge,
    bestSpend,
    currentAge,
    currentSpend,
    holdSpend,
    sellBeatsHold: bestSpend >= holdSpend,
    gainVsCurrent: currentSpend != null ? bestSpend - currentSpend : 0,
    range: { min, max },
    curve,
  };
}
