import { describe, it, expect } from "vitest";
import { DEFAULT_PLAN, type RetirementPlan } from "@/lib/au/types";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { simulate } from "@/lib/au/simulate";
import { buildTimeline } from "@/lib/au/timeline";

const NOW = new Date("2026-01-01T00:00:00Z");

function story(plan: RetirementPlan, mcPct: number | null) {
  const result = simulate(plan, DEFAULT_CONFIG);
  return { result, tl: buildTimeline(plan, result, DEFAULT_CONFIG, { mcPct, now: NOW }) };
}

// A clearly well-funded single, already at retirement age.
const GOOD: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ ...DEFAULT_PLAN.people[0], currentAge: 60, salary: 0, superBalance: 1_400_000 }],
  superMode: "individual",
  homeowner: true,
  outsideSuper: 300_000,
  annualOutsideSavings: 0,
  retirementAge: 60,
  spendingMode: "flat",
  targetSpending: 45_000,
  lifeExpectancy: 90,
};

// A clearly underfunded single: retire now on a big spend with little saved.
const SHORT: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ ...DEFAULT_PLAN.people[0], currentAge: 60, salary: 0, superBalance: 120_000 }],
  superMode: "individual",
  homeowner: true,
  outsideSuper: 10_000,
  annualOutsideSavings: 0,
  retirementAge: 60,
  spendingMode: "flat",
  targetSpending: 90_000,
  lifeExpectancy: 95,
};

describe("buildTimeline — structure & invariants", () => {
  it("produces an ordered, fully-narrated story for a healthy plan", () => {
    const { tl } = story(GOOD, 99);
    expect(tl.beats.length).toBeGreaterThan(1);
    // Ordered on the age axis.
    for (let i = 1; i < tl.beats.length; i++) {
      expect(tl.beats[i].age).toBeGreaterThanOrEqual(tl.beats[i - 1].age);
    }
    // Every beat has a fact; single → "My".
    expect(tl.beats.every((b) => b.fact.trim().length > 0)).toBe(true);
    expect(tl.title).toBe("My retirement timeline");
    // Opens on the start beat and closes on the horizon.
    expect(tl.beats[0].kind).toBe("start");
    const last = tl.beats[tl.beats.length - 1];
    expect(last.phase).toBe("horizon");
    expect(last.kind).toBe("horizon");
    expect(tl.mood).toBe("strong");
    // Illustrative colour appears on at least one beat when the plan is healthy.
    expect(tl.beats.some((b) => b.vignette)).toBe(true);
    // Calendar years are derived (retire at 60 = this year for a 60-yo).
    expect(tl.beats.find((b) => b.kind === "retire")?.year).toBe(2026);
  });

  it("couple framing + a real 'lasts to' headline", () => {
    const couple: RetirementPlan = {
      ...GOOD,
      household: "couple",
      people: [
        { ...DEFAULT_PLAN.people[0], currentAge: 60, salary: 0, superBalance: 900_000 },
        { ...DEFAULT_PLAN.people[0], currentAge: 58, salary: 0, superBalance: 700_000 },
      ],
    };
    const { tl } = story(couple, 96);
    expect(tl.title).toBe("Our retirement timeline");
    expect(tl.headline).toContain("lasts to 90");
  });

  it("stays honest when the plan runs short — no beats past the shortfall, no vignettes", () => {
    const { result, tl } = story(SHORT, 20);
    expect(result.lastsToLifeExpectancy).toBe(false);
    expect(tl.mood).toBe("short");
    const last = tl.beats[tl.beats.length - 1];
    expect(last.kind).toBe("horizon-short");
    // Nothing is narrated after the money runs out.
    if (result.depletedAge != null) {
      expect(tl.beats.every((b) => b.age <= result.depletedAge!)).toBe(true);
    }
    // A short story doesn't dress itself in celebratory colour.
    expect(tl.beats.some((b) => b.vignette)).toBe(false);
    expect(tl.headline).toContain("gap to close");
  });
});
