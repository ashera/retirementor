import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import {
  BUDGET_CATEGORY_META,
  presetCategories,
  budgetTotal,
  budgetSplit,
  budgetToStages,
  isEssential,
  spendBreakdownAtFloor,
} from "../lib/au/budget";
import { DEFAULT_PLAN } from "../lib/au/types";

describe("Budget planner", () => {
  it("has metadata for every configured category (and vice-versa)", () => {
    const metaKeys = new Set(BUDGET_CATEGORY_META.map((m) => m.key));
    const cfgKeys = new Set(cfg.asfa.breakdown.categories.map((c) => c.key));
    expect(metaKeys).toEqual(cfgKeys);
  });

  it("pre-fills a comfortable single budget that sums near the ASFA headline", () => {
    const cats = presetCategories(cfg, "single", true, "comfortable");
    const total = budgetTotal(cats);
    // Within 1% of the published ASFA Comfortable single figure.
    expect(Math.abs(total - cfg.asfa.comfortable.single)).toBeLessThan(
      cfg.asfa.comfortable.single * 0.01,
    );
  });

  it("makes modest cheaper than comfortable, and premium dearer", () => {
    const modest = budgetTotal(presetCategories(cfg, "couple", true, "modest"));
    const comf = budgetTotal(presetCategories(cfg, "couple", true, "comfortable"));
    const premium = budgetTotal(presetCategories(cfg, "couple", true, "premium"));
    expect(modest).toBeLessThan(comf);
    expect(premium).toBeGreaterThan(comf);
  });

  it("gives renters a higher housing default than homeowners", () => {
    const owner = presetCategories(cfg, "single", true, "comfortable");
    const renter = presetCategories(cfg, "single", false, "comfortable");
    expect(renter.housing).toBeGreaterThan(owner.housing);
    // Only housing changes for a renter.
    for (const k of Object.keys(owner)) {
      if (k !== "housing") expect(renter[k]).toBe(owner[k]);
    }
  });

  it("splits essentials from discretionary", () => {
    const cats = presetCategories(cfg, "couple", true, "comfortable");
    const { essential, discretionary } = budgetSplit(cats);
    expect(essential + discretionary).toBe(budgetTotal(cats));
    expect(isEssential("housing")).toBe(true);
    expect(isEssential("travel")).toBe(false);
  });

  it("decomposes a target spend: essentials held, cut falls on discretionary", () => {
    // No-budget plan → ASFA-estimated split. $50k flat, single homeowner.
    const plan = { ...DEFAULT_PLAN, household: "single" as const, homeowner: true, spendingMode: "flat" as const, targetSpending: 50_000 };
    const full = spendBreakdownAtFloor(plan, cfg, 50_000);
    expect(full.estimated).toBe(true);
    expect(full.keptFraction).toBeCloseTo(1, 5);
    // At full spend, every category is at its baseline.
    for (const r of full.rows) expect(r.annual).toBe(r.baselineAnnual);

    const ess = full.essential;
    // Cutting to the essentials floor zeroes all discretionary, holds essentials.
    const bone = spendBreakdownAtFloor(plan, cfg, ess);
    expect(bone.keptFraction).toBeCloseTo(0, 5);
    for (const r of bone.rows) {
      if (r.essential) expect(r.annual).toBe(r.baselineAnnual);
      else expect(r.annual).toBe(0);
    }
    // A 10% total cut is a larger cut to discretionary alone.
    const floor = 45_000;
    const cut = spendBreakdownAtFloor(plan, cfg, floor);
    const discCutPct = 1 - cut.discretionaryKept / cut.discretionaryFull;
    expect(discCutPct).toBeGreaterThan(0.1); // discretionary bears more than the 10% headline
    // Rows sum to the target (within rounding).
    const sum = cut.rows.reduce((s, r) => s + r.annual, 0);
    expect(Math.abs(sum - floor)).toBeLessThan(20);
  });

  it("seeds stages via the smile — essentials flat, discretionary declining", () => {
    const cats = presetCategories(cfg, "couple", true, "comfortable");
    const { essential, discretionary } = budgetSplit(cats);
    const stages = budgetToStages(cfg, cats);
    // Go-go equals the full budget; later phases only trim discretionary.
    expect(stages.goGo).toBe(Math.round((essential + discretionary) / 100) * 100);
    expect(stages.slowGo).toBeLessThan(stages.goGo);
    expect(stages.noGo).toBeLessThan(stages.slowGo);
    // No-go never drops below the essential floor.
    expect(stages.noGo).toBeGreaterThanOrEqual(Math.round(essential / 100) * 100 - 100);
    expect(stages.slowGoAge).toBe(cfg.asfa.breakdown.smile.slowGoAge);
  });
});
