import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { runMonteCarlo } from "../lib/au/montecarlo";
import { guardrailsOutlook, guardrailsTimeline, guardrailsStoryMode, yearsBelowStart } from "../lib/au/guardrails";
import { buildStrategyCatalog } from "../lib/au/strategies";
import { DEMO_SCENARIOS } from "../lib/au/scenarios/demoScenarios";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";

const base: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ ...DEFAULT_PLAN.people[0], currentAge: 60, superBalance: 500_000, salary: 0 }],
  superMode: "individual",
  homeowner: true,
  outsideSuper: 500_000,
  annualOutsideSavings: 0,
  retirementAge: 60,
  spendingMode: "flat",
  targetSpending: 55_000,
  investmentReturn: 7,
  returnVolatility: 11,
  inflation: 2.5,
  lifeExpectancy: 90,
};

const H = 31;
const livingPath = (p: RetirementPlan, seq?: number[]) =>
  simulate(p, cfg, seq).rows.filter((r) => r.phase !== "accumulation").map((r) => r.breakdown.livingSpend);

describe("Guyton-Klinger guardrails", () => {
  it("cuts spending after a market fall (upper rail)", () => {
    const crash = Array.from({ length: H }, (_, t) => (t < 3 ? -20 : 7));
    const path = livingPath({ ...base, guardrails: {} }, crash);
    expect(path[0]).toBe(55_000); // starts at the plan's spend
    expect(Math.min(...path)).toBeLessThan(50_000); // it trimmed
  });

  it("raises spending after strong returns (lower rail)", () => {
    const boom = Array.from({ length: H }, () => 15);
    const path = livingPath({ ...base, guardrails: {} }, boom);
    expect(Math.max(...path)).toBeGreaterThan(60_000); // it gave itself a raise
  });

  it("never cuts below the floor (max of essentials, 70% of initial)", () => {
    const deep = Array.from({ length: H }, () => -8);
    const path = livingPath({ ...base, guardrails: {} }, deep);
    // Floor is 70% of the $55k start (essentials are lower), so ~$38,500.
    expect(Math.min(...path)).toBeGreaterThanOrEqual(0.7 * 55_000 - 1);
    expect(Math.min(...path)).toBeLessThan(55_000); // it did cut toward the floor
  });

  it("lifts Monte Carlo success at an aggressive spend (the whole point)", () => {
    const aggressive: RetirementPlan = { ...base, targetSpending: 62_000 };
    const fixed = runMonteCarlo(aggressive, cfg).successRate;
    const flexible = runMonteCarlo({ ...aggressive, guardrails: {} }, cfg).successRate;
    expect(flexible).toBeGreaterThan(fixed + 0.1);
  });

  it("is off by default — unset behaves byte-identically to a fixed withdrawal", () => {
    const a = JSON.stringify(simulate(base, cfg).rows);
    const b = JSON.stringify(simulate({ ...base, guardrails: undefined }, cfg).rows);
    expect(a).toBe(b);
  });

  it("outlook: reports a bounded worst-case cut and the central spend path", () => {
    const o = guardrailsOutlook({ ...base, targetSpending: 62_000, guardrails: {} }, cfg, { iterations: 80 });
    expect(o.startSpend).toBe(62_000);
    expect(o.centralPath.length).toBeGreaterThan(10);
    expect(o.centralPath[0].spend).toBe(62_000);
    // Cuts can't breach the floor (70% of the start here), so worst-case ≤ 30%.
    expect(o.worstCutPct).toBeGreaterThan(0); // an aggressive spend does trigger cuts
    expect(o.worstCutPct).toBeLessThanOrEqual(0.301);
    expect(o.worstCutSpend).toBeGreaterThanOrEqual(0.7 * 62_000 - 1);
    expect(o.yearsBelowBad).toBeGreaterThan(0);
  });

  it("outlook: a comfortably-funded plan mostly raises, not cuts", () => {
    const o = guardrailsOutlook({ ...base, targetSpending: 30_000, guardrails: {} }, cfg, { iterations: 80 });
    expect(o.everRaises).toBe(true); // plenty of headroom → the central path lifts spending
    expect(o.worstCutPct).toBeLessThan(0.2); // rarely, if ever, forced to cut deeply
  });

  it("timeline: retire-into-downturn cuts to the floor, then a pension-driven recovery plateaus below the start", () => {
    const tl = guardrailsTimeline({ ...base, targetSpending: 62_000, guardrails: {} }, cfg);
    expect(tl.start).toBe(62_000);
    expect(tl.points.some((p) => p.action === "cut")).toBe(true); // cuts cascade
    expect(Math.min(...tl.points.map((p) => p.spend))).toBeLessThanOrEqual(tl.floor + 1); // reaches the floor
    expect(tl.points.some((p) => p.action === "raise")).toBe(true); // then recovers a step
    expect(tl.pensionAge).not.toBeNull(); // the Age Pension is what drives it
    expect(tl.plateauSpend).toBeLessThan(tl.start); // but settles below where it started
    expect(tl.lowerRail).toBeLessThan(tl.wr0); // rails straddle the initial rate
    expect(tl.upperRail).toBeGreaterThan(tl.wr0);
  });

  it("a depleting plan holds at the floor — a $0 portfolio never reads as a prosperity 'raise'", () => {
    // Small portfolio, high spend → it fails. The bug was: once the portfolio hit
    // $0 the rate computed as 0% (below the lower rail) and spending kept RAISING.
    const failing: RetirementPlan = {
      ...base,
      people: [{ ...base.people[0], superBalance: 200_000 }],
      outsideSuper: 100_000,
      targetSpending: 60_000,
      guardrails: {},
    };
    const res = simulate(failing, cfg);
    expect(res.lastsToLifeExpectancy).toBe(false); // it genuinely runs short
    const spends = res.rows.filter((r) => r.phase !== "accumulation").map((r) => r.breakdown.livingSpend);
    expect(Math.max(...spends)).toBeLessThanOrEqual(60_000 + 1); // never raised above the start
  });

  it("the cut floor is never above the starting spend (all-essentials plans have no room to trim)", () => {
    // A budget whose essentials exceed the spend used to push the floor ABOVE the
    // start — nonsensical. It must cap at the start.
    const allEssentials: RetirementPlan = {
      ...base,
      targetSpending: 60_000,
      budget: { tenure: "own", lifestyle: "premium", applyPhases: false, categories: { housing: 30_000, food: 20_000, health: 15_000, leisure: 3_000 } },
      guardrails: {},
    };
    const tl = guardrailsTimeline(allEssentials, cfg);
    expect(tl.floor).toBeLessThanOrEqual(tl.start); // capped at the start
    expect(tl.didCut).toBe(false); // nothing discretionary to trim
  });

  it("the timeline rate includes the PPOR home loan (matches the engine's draw)", () => {
    const noLoan = guardrailsTimeline({ ...base, targetSpending: 55_000, guardrails: {} }, cfg);
    const withLoan = guardrailsTimeline(
      {
        ...base,
        targetSpending: 55_000,
        guardrails: {},
        mortgage: { type: "principal_interest", balance: 300_000, interestRate: 6, annualRepayment: 24_000, payoffAge: 75, strategy: "carry" },
      },
      cfg,
    );
    // The loan is part of the portfolio draw, so it lifts the initial withdrawal
    // rate (and thus the rails) — it isn't ignored.
    expect(withLoan.wr0).toBeGreaterThan(noLoan.wr0 + 0.005);
  });

  it("anchors the illustrative downturn at retirement (bites even with accumulation years left)", () => {
    const preRetire: RetirementPlan = {
      ...base,
      people: [{ ...base.people[0], currentAge: 55, superBalance: 500_000, salary: 90_000 }],
      retirementAge: 65,
      annualOutsideSavings: 10_000,
      targetSpending: 55_000,
      guardrails: {},
    };
    const tl = guardrailsTimeline(preRetire, cfg);
    expect(tl.dip).toBeLessThan(0);
    expect(tl.meanReturn).toBe(preRetire.investmentReturn);
    // The crash must land in the FIRST retirement years, so a cut appears soon
    // after retirement — not "never" (which is what happened when it was anchored
    // to the sim start and fell entirely inside the accumulation years).
    const firstCut = tl.points.find((p) => p.action === "cut");
    expect(firstCut).toBeTruthy();
    expect(firstCut!.age).toBeLessThanOrEqual(tl.points[0].age + 6);
  });

  it("staggered retirement: doesn't anchor the rate on a still-working partner's masked draw", () => {
    // The household 'retires' when the younger partner stops at 60, but the older
    // partner keeps earning to 65. The bug anchored guardWr0 during those working
    // years — where the salary covers most of the spend, so the portfolio's apparent
    // draw is a fraction of the real one (~1% vs ~4%). That pegged the rails far too
    // low, so once BOTH retired the true rate read as way above the upper rail and
    // spending was cut to the floor and stranded there for decades — even though
    // FIXED spending comfortably lasts. The anchor must wait for the first fully
    // retired year.
    const staggered: RetirementPlan = {
      ...base,
      household: "couple",
      // Person 0 works to 65 (plan.retirementAge); person 1 retires at 60, so the
      // household enters retirement at 60 with person 0's salary still coming in.
      people: [
        { ...DEFAULT_PLAN.people[0], currentAge: 60, superBalance: 1_200_000, salary: 120_000 },
        { ...DEFAULT_PLAN.people[1], currentAge: 60, superBalance: 1_200_000, salary: 0, retirementAge: 60 },
      ],
      superMode: "individual",
      outsideSuper: 0,
      retirementAge: 65,
      spendingMode: "flat",
      targetSpending: 110_000,
      guardrails: {},
    };
    // Premise: fixed spending comfortably lasts, so flexing shouldn't need to cut.
    expect(simulate({ ...staggered, guardrails: undefined }, cfg).lastsToLifeExpectancy).toBe(true);
    const path = livingPath(staggered); // steady 7% returns
    // With the fix, spending holds at (or rises above) plan; the bug stranded it near
    // the 70% floor (~$77k) for most of retirement.
    const late = path.slice(-8);
    expect(Math.min(...late)).toBeGreaterThanOrEqual(110_000 - 1);
  });

  it("offers a What-If lever that enables guardrails, once", () => {
    const card = buildStrategyCatalog(base).find((c) => c.id === "guardrails");
    expect(card).toBeTruthy();
    expect(card!.apply(base, {}).guardrails).toBeTruthy();
    // Not offered again once the baseline already uses guardrails.
    expect(buildStrategyCatalog({ ...base, guardrails: {} }).some((c) => c.id === "guardrails")).toBe(false);
  });
});

// The explainer's narrative decision (which drove real user-reported bugs) is now a
// pure function so it can be pinned. The key regression: a run cut to the floor for
// ~24 years that only claws back above the start at the very END must read as
// "recovers", NOT "raised" (comfortably-funded upside).
describe("guardrails story mode", () => {
  const demoPlan = (slug: string): RetirementPlan => {
    const s = DEMO_SCENARIOS.find((x) => x.slug === slug)!;
    return { ...DEFAULT_PLAN, ...s.data, guardrails: {} };
  };

  it("fire-at-45: ends ABOVE start after a long cut → 'recovers', not 'raised'", () => {
    const tl = guardrailsTimeline(demoPlan("fire-at-45"), cfg);
    expect(tl.plateauSpend).toBeGreaterThan(tl.start); // the trap: it DOES end higher…
    expect(yearsBelowStart(tl)).toBeGreaterThan(tl.points.length * 0.2); // …but was below start most of retirement
    expect(guardrailsStoryMode(tl)).toBe("recovers");
  });

  it("high-spend $80k: deep cut with no rebound → 'holds'", () => {
    const tl = guardrailsTimeline(demoPlan("fire-at-45-high-spend"), cfg);
    expect(tl.points.some((p) => p.action === "raise")).toBe(false);
    expect(guardrailsStoryMode(tl)).toBe("holds");
  });

  it("a plan that runs short even when trimmed → 'fails'", () => {
    const doomed: RetirementPlan = {
      ...base,
      people: [{ ...DEFAULT_PLAN.people[0], currentAge: 45, superBalance: 100_000, salary: 0 }],
      retirementAge: 45, outsideSuper: 150_000, targetSpending: 55_000, guardrails: {},
    };
    const tl = guardrailsTimeline(doomed, cfg);
    expect(tl.failsAtAge).not.toBeNull();
    expect(guardrailsStoryMode(tl)).toBe("fails");
  });

  it("only reports 'raised' when the run stays at/above start for most of retirement", () => {
    // Constructed guard: plateau just above start but many years below → not raised.
    const tl = guardrailsTimeline({ ...base, targetSpending: 62_000, guardrails: {} }, cfg);
    if (yearsBelowStart(tl) > tl.points.length * 0.2) {
      expect(guardrailsStoryMode(tl)).not.toBe("raised");
    }
  });
});
