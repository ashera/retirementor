// The scenario model.
//
// A scenario is a BASE plan (raw inputs) plus an explicit STRATEGY LAYER (which
// What-If strategies are on + their param values). The COMPOSED plan — what the
// engine simulates and every surface (dashboard chart, report, share, compare)
// displays — is always DERIVED from the two via `composeScenario`, never stored
// as an independently-editable thing. That single rule removes the old
// baked-in-vs-editable duality: the strategy layer is always present and always
// editable.
//
// Overlap rule: strategies win. Where a strategy and a base input touch the same
// field (e.g. "Retire later" vs the retirement-age input), the composed plan takes
// the strategy's value — the base edit is shadowed while the strategy is on.

import type { RetirementPlan } from "./types";
import type { EngineConfig } from "./config";
import { buildStrategyCatalog, applyStrategies, stripStrategyFields } from "./strategies";

/** The What-If overlay: enabled strategy ids + per-card param overrides. */
export interface StrategyLayer {
  active: string[];
  values: Record<string, Record<string, number>>;
}

export const EMPTY_LAYER: StrategyLayer = { active: [], values: {} };

/** The one thing you're working on, shared by the dashboard and What-If. Either a
 *  saved scenario (name + savedId set) or an unsaved "Working scenario". */
export interface ActiveScenario {
  base: RetirementPlan; // raw inputs, strategy footprints OFF
  strategies: StrategyLayer; // the overlay applied on top
  name: string | null; // null → unsaved "Working scenario"
  savedId: string | null; // set when it maps to a saved `plans` row
  dirty: boolean; // unsaved changes since the last save/load
}

/** Derive the composed plan (what the engine runs and every surface shows) from a
 *  base plan and its strategy layer. Pure: same inputs → same output. */
export function composeScenario(
  base: RetirementPlan,
  strategies: StrategyLayer,
  config: EngineConfig,
): RetirementPlan {
  const catalog = buildStrategyCatalog(base, { config });
  const composed = applyStrategies(base, catalog, new Set(strategies.active), strategies.values);
  return { ...composed, whatIf: undefined }; // composed never carries a bookmark of its own
}

/** Read a stored plan into the active-scenario model.
 *
 *  New-model saves carry the exact base in `whatIf.baselinePlan`, so the split is
 *  lossless. Older saves (composed + bookmark, no baselinePlan) are reconstructed
 *  best-effort by stripping the active strategies' field footprints — re-composing
 *  then reproduces the same numbers. A plain plan (no bookmark) is all base. */
export function toActiveScenario(
  stored: RetirementPlan,
  opts: { name?: string | null; savedId?: string | null } = {},
): ActiveScenario {
  const wf = stored.whatIf;
  const active = wf?.active ?? [];
  let base: RetirementPlan;
  if (wf?.baselinePlan) {
    base = { ...wf.baselinePlan, whatIf: undefined }; // exact (new model)
  } else if (active.length > 0) {
    base = stripStrategyFields(stored, active); // best-effort (pre-baselinePlan saves)
  } else {
    base = { ...stored, whatIf: undefined }; // plain plan
  }
  return {
    base,
    strategies: { active: [...active], values: wf?.values ?? {} },
    name: opts.name ?? null,
    savedId: opts.savedId ?? null,
    dirty: false,
  };
}

/** Produce the RetirementPlan to persist/display for a scenario: the composed plan
 *  (so every consumer that reads a saved plan keeps working) plus — when there ARE
 *  strategies — a complete bookmark carrying the base + layer, so `toActiveScenario`
 *  round-trips it exactly. Strategy-free scenarios store plain (no bookmark), which
 *  is smaller and byte-compatible with plans saved before this model. */
export function fromActiveScenario(scenario: ActiveScenario, config: EngineConfig): RetirementPlan {
  const composed = composeScenario(scenario.base, scenario.strategies, config);
  if (scenario.strategies.active.length === 0) return composed; // already whatIf-free
  return {
    ...composed,
    whatIf: {
      active: [...scenario.strategies.active],
      values: scenario.strategies.values,
      baselineId: "current", // vestigial (no baseline picker); base carried explicitly below
      baselinePlan: { ...scenario.base, whatIf: undefined },
    },
  };
}
