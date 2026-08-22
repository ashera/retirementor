import { describe, it, expect } from "vitest";
import { strategyEventPins, strategyEventBands } from "../lib/au/chartEvents";
import { clusterPins } from "../components/markerPlacement";
import type { RetirementPlan } from "../lib/au/types";

// strategyEventPins only reads a handful of optional fields, so a partial plan is enough.
const plan = (over: Partial<RetirementPlan>): RetirementPlan => ({ ...over }) as RetirementPlan;

describe("chartEvents — strategy pins", () => {
  it("emits an age-pinned pin for each discrete strategy", () => {
    const p = plan({
      retirementAge: 65,
      home: { value: 900_000, growthReal: 0, downsize: { atAge: 72, newValue: 500_000, toSuper: 0 } } as RetirementPlan["home"],
      lumpSum: { atAge: 68, amount: 50_000 },
      mortgage: { strategy: "clear_at_retirement" } as RetirementPlan["mortgage"],
    });
    const byKey = Object.fromEntries(strategyEventPins(p).map((x) => [x.key, x]));
    expect(byKey["downsize"].age).toBe(72);
    expect(byKey["lump-sum"].age).toBe(68);
    expect(byKey["clear-mortgage"].age).toBe(65); // happens at retirement
    expect(byKey["downsize"].detail).toMatch(/500/); // shows the new home value
    expect(byKey["lump-sum"].detail).toMatch(/50/); // shows the withdrawn amount
  });

  it("a scheduled property sale becomes a pin at its sale age", () => {
    const p = {
      investmentProperties: [{ name: "Pimpama", strategy: "sell", sellAtAge: 70 }],
    } as unknown as RetirementPlan;
    const pins = strategyEventPins(p);
    expect(pins.find((x) => x.key === "sell-prop-0")).toMatchObject({ age: 70, label: "Sell Pimpama" });
  });

  it("no strategies → no pins", () => {
    expect(strategyEventPins(plan({}))).toEqual([]);
  });
});

describe("chartEvents — strategy bands", () => {
  it("a multi-year recontribution window is a band; a one-off is not", () => {
    expect(strategyEventBands(plan({ recontribute: { perYear: 1, fromAge: 62, untilAge: 70 } }))).toHaveLength(1);
    expect(strategyEventBands(plan({ recontribute: { perYear: 1, fromAge: 62, untilAge: 62 } }))).toHaveLength(0);
    expect(strategyEventBands(plan({}))).toEqual([]);
  });
});

describe("clusterPins", () => {
  const pin = (age: number, key: string) => ({ key, age, icon: "x", label: key, color: "#000" });
  const xOf = (age: number) => age * 10; // 10px per year of age

  it("merges chips that would overlap, keeps far-apart ones separate", () => {
    const clusters = clusterPins([pin(60, "a"), pin(61, "b"), pin(75, "c")], xOf, 20);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].members.map((m) => m.key)).toEqual(["a", "b"]); // 10px apart → merged
    expect(clusters[1].members.map((m) => m.key)).toEqual(["c"]); // far → its own chip
  });

  it("chains merges by the previous chip, not the first (no overlap down a run)", () => {
    // 60,61,62 each 10px from the previous (<20) → one cluster of three.
    const clusters = clusterPins([pin(60, "a"), pin(61, "b"), pin(62, "c")], xOf, 20);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toHaveLength(3);
  });
});
