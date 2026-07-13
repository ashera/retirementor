import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG as cfg, minDrawdownRate } from "../lib/au/config";
import {
  PARAM_DESCRIPTORS,
  configToRows,
  getByPath,
  setByPath,
} from "../lib/au/params";
import { SOURCE_SEEDS } from "../lib/au/sources";
import { computeStaleness } from "../lib/au/staleness";

describe("Reference data", () => {
  it("holds the verified FY2026-27 deeming figures (freeze ended)", () => {
    expect(cfg.deeming.lowerRate).toBe(0.0125);
    expect(cfg.deeming.upperRate).toBe(0.0325);
    expect(cfg.deeming.threshold.single).toBe(66_800);
    expect(cfg.deeming.threshold.couple).toBe(110_600);
    expect(cfg.deeming.needsVerification).toBe(false);
  });

  it("has the current Super Guarantee rate and contribution cap", () => {
    expect(cfg.sgRate).toBe(0.12);
    expect(cfg.concessionalCap).toBe(32_500);
  });

  it("applies the correct minimum drawdown rate by age", () => {
    expect(minDrawdownRate(64, cfg)).toBe(0.04);
    expect(minDrawdownRate(65, cfg)).toBe(0.05);
    expect(minDrawdownRate(75, cfg)).toBe(0.06);
    expect(minDrawdownRate(95, cfg)).toBe(0.14);
  });

  it("defines its parameters, each mapped to a seeded source", () => {
    const keys = new Set(SOURCE_SEEDS.map((s) => s.key));
    // 43 core params + the ASFA budget breakdown (4 figures per category).
    const expected = 43 + cfg.asfa.breakdown.categories.length * 4;
    expect(PARAM_DESCRIPTORS).toHaveLength(expected);
    for (const d of PARAM_DESCRIPTORS) expect(keys.has(d.sourceKey)).toBe(true);
  });

  it("keeps parameter keys unique", () => {
    const keys = PARAM_DESCRIPTORS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("reads and immutably writes config values by path", () => {
    expect(getByPath(cfg, "sgRate")).toBe(0.12);
    expect(getByPath(cfg, "agePension.single.assetsFreeArea.homeowner")).toBe(333_000);
    const next = setByPath(cfg, "sgRate", 0.13);
    expect(getByPath(next, "sgRate")).toBe(0.13);
    expect(cfg.sgRate).toBe(0.12); // original untouched
  });

  it("flattens the config to matching values, incl. the budget breakdown", () => {
    const rows = configToRows(cfg);
    expect(rows).toHaveLength(PARAM_DESCRIPTORS.length);
    expect(rows.find((r) => r.key === "sg_rate")!.value).toBe(0.12);
    // A generated breakdown row resolves to the right nested config value.
    expect(rows.find((r) => r.key === "asfa_bd_food_comfortable_couple")!.value).toBe(
      cfg.asfa.breakdown.categories.find((c) => c.key === "food")!.comfortable.couple,
    );
  });

  it("computes source staleness states", () => {
    const now = new Date("2026-07-03T00:00:00Z");
    expect(computeStaleness(null, 365, now).state).toBe("stale"); // never refreshed
    expect(computeStaleness("2026-07-01", null, now).state).toBe("none"); // no schedule
    expect(computeStaleness("2025-01-01", 365, now).state).toBe("stale"); // overdue
    expect(computeStaleness("2025-07-28", 365, now).state).toBe("due"); // within window
    expect(computeStaleness("2026-06-01", 365, now).state).toBe("fresh");
  });
});
