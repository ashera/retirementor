import { describe, it, expect } from "vitest";
import { agePension, deemedIncome } from "../lib/au/agePension";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";

describe("Age Pension", () => {
  it("deems financial assets at the lower rate below the threshold", () => {
    // $50k single is under the $66,800 threshold → all at 1.25%
    expect(deemedIncome(50_000, "single", cfg)).toBeCloseTo(625, 2);
  });

  it("deems the excess at the upper rate above the threshold", () => {
    // 66,800 * 1.25% + 33,200 * 3.25%
    expect(deemedIncome(100_000, "single", cfg)).toBeCloseTo(835 + 1079, 0);
  });

  it("pays the full pension when assets and income are below the free areas", () => {
    const r = agePension(
      { household: "single", homeowner: true, assessableAssets: 200_000, financialAssets: 200_000 },
      cfg,
    );
    expect(Math.round(r.annual)).toBe(Math.round(cfg.agePension.single.maxAnnual));
  });

  it("reduces the pension under the binding (lower) test", () => {
    const r = agePension(
      { household: "single", homeowner: true, assessableAssets: 400_000, financialAssets: 400_000 },
      cfg,
    );
    // assets test: (400k-333k)*0.078 = 5226 off the max
    expect(Math.round(r.annual)).toBe(Math.round(cfg.agePension.single.maxAnnual - 67_000 * cfg.agePension.assetsTaperPerDollar));
    expect(r.bindingTest).toBe("assets");
  });

  it("pays nothing once assets are well past the cut-off", () => {
    const r = agePension(
      { household: "single", homeowner: true, assessableAssets: 2_000_000, financialAssets: 2_000_000 },
      cfg,
    );
    expect(r.annual).toBe(0);
  });

  it("gives couples a higher maximum than singles", () => {
    expect(cfg.agePension.couple.maxAnnual).toBeGreaterThan(cfg.agePension.single.maxAnnual);
  });

  it("gives renters a higher assets free area than homeowners", () => {
    expect(cfg.agePension.single.assetsFreeArea.nonHomeowner).toBeGreaterThan(
      cfg.agePension.single.assetsFreeArea.homeowner,
    );
  });
});
