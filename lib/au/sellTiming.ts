// Solver: the best AGE to sell an investment property to leave the most wealth.
//
// Objective = net worth at the projection horizon (rowNetWorth of the last row) —
// which counts a STILL-HELD property's equity, so "hold" is compared fairly against
// each sell year (estateValue would undercount a held property). Holding longer keeps
// capital growth + net rent but a bigger nominal gain means more CGT, fewer years to
// draw the freed proceeds, and a means-test shift (an actual-rent asset becomes a
// deemed one) — so the wealth-max sell year is typically interior, not "as late as
// possible". The outcome isn't monotone, so we scan every candidate age rather than
// bisect, and evaluate each ON TOP of the other active levers (the optimum shifts once
// Retire-later / lump-sum etc. are on). One deterministic simulate() per age (cheap).
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan } from "@/lib/au/types";
import { composeScenario, type StrategyLayer } from "@/lib/au/scenario";
import { buildStrategyCatalog } from "@/lib/au/strategies";
import { simulate } from "@/lib/au/simulate";
import { rowNetWorth } from "@/lib/au/networth";

export interface SellYearPoint {
  age: number;
  netWorth: number; // net worth at the horizon if the property is sold at this age
}

export interface SellYearResult {
  propertyIndex: number;
  bestAge: number; // the wealth-maximising sell age (oldest-person axis)
  bestNetWorth: number; // horizon net worth at bestAge
  currentAge: number | null; // the age currently set on the lever (null if not active yet)
  currentNetWorth: number | null;
  holdNetWorth: number; // horizon net worth if the property is never sold
  sellBeatsHold: boolean; // does selling at the best age beat holding to the end?
  gainVsCurrent: number; // bestNetWorth − currentNetWorth (0 if no current age)
  range: { min: number; max: number };
  curve: SellYearPoint[]; // net worth by sell age — for a sparkline / "why" readout
}

/**
 * Find the sell age that maximises horizon net worth for property `cardId`
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

  const horizonNetWorth = (plan: RetirementPlan): number => {
    const res = simulate(plan, config);
    const last = res.rows[res.rows.length - 1];
    return last ? rowNetWorth(last) : 0;
  };

  const otherActive = strategies.active.filter((id) => id !== cardId);
  const curve: SellYearPoint[] = [];
  let bestAge = min;
  let bestNetWorth = -Infinity;
  for (let age = min; age <= max; age++) {
    const layer: StrategyLayer = {
      active: [...otherActive, cardId],
      values: { ...strategies.values, [cardId]: { ...strategies.values[cardId], age } },
    };
    const nw = horizonNetWorth(composeScenario(base, layer, config));
    curve.push({ age, netWorth: nw });
    if (nw > bestNetWorth) {
      bestNetWorth = nw;
      bestAge = age;
    }
  }

  // Hold baseline: the same layer with the sell lever off (property kept for life).
  const holdNetWorth = horizonNetWorth(
    composeScenario(base, { active: otherActive, values: strategies.values }, config),
  );

  const wasActive = strategies.active.includes(cardId);
  const currentAge = wasActive ? Math.round(strategies.values[cardId]?.age ?? param.default) : null;
  const currentNetWorth =
    currentAge != null ? curve.find((p) => p.age === currentAge)?.netWorth ?? null : null;

  return {
    propertyIndex,
    bestAge,
    bestNetWorth,
    currentAge,
    currentNetWorth,
    holdNetWorth,
    sellBeatsHold: bestNetWorth >= holdNetWorth,
    gainVsCurrent: currentNetWorth != null ? bestNetWorth - currentNetWorth : 0,
    range: { min, max },
    curve,
  };
}
