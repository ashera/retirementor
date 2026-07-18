import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN } from "../lib/au/types";
import type { RetirementPlan } from "../lib/au/types";
import { simulate } from "../lib/au/simulate";
import {
  composeScenario,
  toActiveScenario,
  fromActiveScenario,
  type StrategyLayer,
  type ActiveScenario,
} from "../lib/au/scenario";

// A realistic base plan: homeowner couple with a mortgage, some outside savings.
const base: RetirementPlan = {
  ...DEFAULT_PLAN,
  homeowner: true,
  home: { value: 900_000, growthReal: 2 },
  mortgage: { balance: 200_000, interestRate: 6, type: "principal_interest", annualRepayment: 24_000, payoffAge: 75, strategy: "carry" },
  outsideSuper: 150_000,
  annualOutsideSavings: 10_000,
  retirementAge: 65,
  targetSpending: 60_000,
};

const fp = (p: RetirementPlan) => {
  const r = simulate(p, cfg);
  return `${Math.round(r.superAtRetirement)}|${r.lastsToLifeExpectancy}|${r.depletedAge ?? ""}|${Math.round(r.rows.at(-1)?.total ?? 0)}`;
};

describe("scenario model", () => {
  const layer: StrategyLayer = {
    active: ["guardrails", "retire-later", "clear-mortgage"],
    values: { "retire-later": { age: 68 } },
  };

  it("composeScenario applies the layer (strategies win over base inputs)", () => {
    const composed = composeScenario(base, layer, cfg);
    expect(composed.guardrails).toBeTruthy();
    expect(composed.retirementAge).toBe(68); // strategy wins over base's 65
    expect(composed.mortgage?.strategy).toBe("clear_at_retirement");
    expect(composed.whatIf).toBeUndefined(); // composed carries no bookmark of its own
  });

  it("from → to round-trips base + layer losslessly (new-model save)", () => {
    const scenario: ActiveScenario = { base, strategies: layer, name: "Plan A", savedId: "abc", dirty: false };
    const stored = fromActiveScenario(scenario, cfg);

    // Stored plan is the composed plan (consumers read it directly) + a full bookmark.
    expect(fp(stored)).toBe(fp(composeScenario(base, layer, cfg)));
    expect(stored.whatIf?.baselinePlan).toBeTruthy();

    const back = toActiveScenario(stored, { name: "Plan A", savedId: "abc" });
    expect(back.strategies.active.sort()).toEqual([...layer.active].sort());
    expect(back.strategies.values).toEqual(layer.values);
    // Re-composing the recovered scenario reproduces the exact same simulation.
    expect(fp(composeScenario(back.base, back.strategies, cfg))).toBe(fp(stored));
  });

  it("migrates an old save (bookmark, no baselinePlan) preserving the numbers", () => {
    // Simulate a pre-baselinePlan save: composed plan + a bookmark with no baselinePlan.
    const composed = composeScenario(base, layer, cfg);
    const oldStored: RetirementPlan = {
      ...composed,
      whatIf: { active: layer.active, values: layer.values, baselineId: "current" },
    };
    const back = toActiveScenario(oldStored);
    // The reconstructed base + layer re-composes to the same numbers as the old save.
    expect(fp(composeScenario(back.base, back.strategies, cfg))).toBe(fp(oldStored));
  });

  it("treats a plain plan (no bookmark) as all base, empty layer", () => {
    const back = toActiveScenario(base);
    expect(back.strategies.active).toEqual([]);
    expect(fp(composeScenario(back.base, back.strategies, cfg))).toBe(fp(base));
  });

  it("an empty layer composes to the base plan unchanged", () => {
    expect(fp(composeScenario(base, { active: [], values: {} }, cfg))).toBe(fp(base));
  });
});
