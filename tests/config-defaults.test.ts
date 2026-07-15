import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, withDefaults, type EngineConfig } from "../lib/au/config";

// withDefaults backfills fields added to the code AFTER a DB config version was
// seeded, so an older active version keeps running the current engine. The most
// dangerous omission is outsideTax: without it the engine taxes outside-super gains
// with NO CGT discount (see lib/au/simulate.ts fallback), silently over-taxing.

// A "legacy" config: the current default minus the fields added this session.
function legacyConfig(): Partial<EngineConfig> {
  const c: Record<string, unknown> = { ...DEFAULT_CONFIG };
  delete c.outsideTax;
  delete c.returnModel;
  delete c.bootstrapBlockYears;
  return c as Partial<EngineConfig>;
}

describe("withDefaults config backfill", () => {
  it("backfills outsideTax on a version that predates the CGT model", () => {
    const filled = withDefaults(legacyConfig() as EngineConfig);
    expect(filled.outsideTax).toEqual(DEFAULT_CONFIG.outsideTax);
    expect(filled.outsideTax.cgtDiscountPct).toBe(50);
    expect(filled.outsideTax.incomeYieldPct).toBeGreaterThan(0);
  });

  it("backfills the return model + block length", () => {
    const filled = withDefaults(legacyConfig() as EngineConfig);
    expect(filled.returnModel).toBe(DEFAULT_CONFIG.returnModel);
    expect(filled.bootstrapBlockYears).toBe(DEFAULT_CONFIG.bootstrapBlockYears);
  });

  it("NEVER overrides values already stored", () => {
    const custom: EngineConfig = {
      ...DEFAULT_CONFIG,
      outsideTax: { incomeYieldPct: 4, cgtDiscountPct: 0, cgtRegime: "discount", cgtMinRatePct: 30 },
      returnModel: "gaussian",
      bootstrapBlockYears: 5,
    };
    const filled = withDefaults(custom);
    expect(filled.outsideTax).toEqual({ incomeYieldPct: 4, cgtDiscountPct: 0, cgtRegime: "discount", cgtMinRatePct: 30 });
    expect(filled.returnModel).toBe("gaussian");
    expect(filled.bootstrapBlockYears).toBe(5);
  });

  it("is idempotent and leaves a complete config untouched", () => {
    expect(withDefaults(DEFAULT_CONFIG)).toEqual(DEFAULT_CONFIG);
  });

  it("also still backfills the older fields (fees, Div293, living standards)", () => {
    const c: Record<string, unknown> = { ...DEFAULT_CONFIG };
    delete c.fees;
    delete c.div293Threshold;
    delete c.livingStandardsGrowthPct;
    const filled = withDefaults(c as unknown as EngineConfig);
    expect(filled.fees).toEqual(DEFAULT_CONFIG.fees);
    expect(filled.div293Threshold).toBe(DEFAULT_CONFIG.div293Threshold);
    expect(filled.livingStandardsGrowthPct).toBe(DEFAULT_CONFIG.livingStandardsGrowthPct);
  });
});
