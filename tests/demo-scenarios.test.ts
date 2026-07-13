import { describe, it, expect } from "vitest";
import { DEMO_SCENARIOS } from "../lib/au/scenarios/demoScenarios";
import { simulate } from "../lib/au/simulate";
import { runMonteCarlo } from "../lib/au/montecarlo";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";

// The demo scenarios are shared publicly at /scenario/<slug> and are the basis of
// the Case Studies article + marketing posts — a broken one ships to a live link.
// These guard their structural validity and that they still run sensibly.

const plans = DEMO_SCENARIOS.map((s) => ({ s, plan: { ...DEFAULT_PLAN, ...s.data } as RetirementPlan }));

describe("Demo scenarios", () => {
  it("has unique, URL-safe slugs and required copy", () => {
    const slugs = DEMO_SCENARIOS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of DEMO_SCENARIOS) {
      expect(s.slug).toMatch(/^[a-z0-9-]+$/);
      expect(s.title.length).toBeGreaterThan(0);
      expect((s.blurb ?? "").length).toBeGreaterThan(0);
    }
  });

  it("expects the four curated scenarios (FIRE pair + retire-55 pair)", () => {
    const slugs = new Set(DEMO_SCENARIOS.map((s) => s.slug));
    for (const want of ["fire-at-45", "fire-at-45-high-spend", "retire-55-single", "retire-55-couple"]) {
      expect(slugs.has(want)).toBe(true);
    }
  });

  it.each(plans)("$s.slug simulates to a full row set with valid phases", ({ plan }) => {
    const res = simulate(plan, cfg);
    expect(res.rows.length).toBeGreaterThan(0);
    const lastAge = res.rows[res.rows.length - 1].age;
    expect(lastAge).toBe(plan.lifeExpectancy);
    for (const r of res.rows) {
      expect(Number.isFinite(r.total)).toBe(true);
      expect(r.total).toBeGreaterThanOrEqual(-1);
    }
  });

  it.each(plans)("$s.slug produces a Monte Carlo success rate in [0,1]", ({ plan }) => {
    const mc = runMonteCarlo(plan, cfg, { iterations: 200 });
    expect(mc.successRate).toBeGreaterThanOrEqual(0);
    expect(mc.successRate).toBeLessThanOrEqual(1);
  });

  it("keeps the FIRE contrast (low-spend pension-decisive vs high-spend marginal)", () => {
    const noPension = { ...cfg, agePension: { ...cfg.agePension, single: { ...cfg.agePension.single, maxAnnual: 0 } } };
    const bySlug = (slug: string) => plans.find((p) => p.s.slug === slug)!.plan;
    const uplift = (plan: RetirementPlan) =>
      runMonteCarlo(plan, cfg, { iterations: 600 }).successRate -
      runMonteCarlo(plan, noPension, { iterations: 600 }).successRate;
    // pension is far more decisive at $40k than at $80k
    expect(uplift(bySlug("fire-at-45"))).toBeGreaterThan(uplift(bySlug("fire-at-45-high-spend")) + 0.1);
  });
});
