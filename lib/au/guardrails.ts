// Outlook for a guardrails (flexible-spending) plan: the honest downside a fixed
// safe-spend can't show. It runs the plan across random return sequences (the same
// split-pool sampling the main Monte Carlo uses) and summarises how deep and how
// often spending would be trimmed — plus the central (steady-return) spend path
// for a sparkline. Only meaningful when plan.guardrails is set.

import { simulate } from "./simulate";
import { mulberry32, standardNormal } from "./montecarlo";
import { budgetSplit, presetCategories } from "./budget";
import { householdRetirementOffset } from "./types";
import type { EngineConfig } from "./config";
import type { RetirementPlan } from "./types";

export interface GuardrailsOutlook {
  startSpend: number; // living-spend in the first retired year (the reference)
  worstCutPct: number; // in a rough (p10) run, how far below the start spending is trimmed (fraction)
  worstCutSpend: number; // the trimmed living-spend in that run (today's $)
  yearsBelowBad: number; // in a rough run, how many retirement years are spent below the start
  everRaises: boolean; // does the central path give a raise above the start spend?
  centralPath: { age: number; spend: number }[]; // deterministic (steady-return) living-spend path
  downturnPath: { age: number; spend: number }[]; // the "retire into a downturn" living-spend path (matches the modal), truncated at any run-short
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((p / 100) * (sortedAsc.length - 1))));
  return sortedAsc[idx];
}

const retirementSpends = (plan: RetirementPlan, config: EngineConfig, returns?: number[], outside?: number[]) =>
  simulate(plan, config, returns, outside).rows.filter((r) => r.phase !== "accumulation").map((r) => r.breakdown.livingSpend);

export function guardrailsOutlook(
  plan: RetirementPlan,
  config: EngineConfig,
  opts?: { iterations?: number; seed?: number },
): GuardrailsOutlook {
  const centralSpends = retirementSpends(plan, config);
  const startSpend = centralSpends.length ? Math.round(centralSpends[0]) : 0;
  const centralPath = simulate(plan, config).rows
    .filter((r) => r.phase !== "accumulation")
    .map((r) => ({ age: r.age, spend: Math.round(r.breakdown.livingSpend) }));
  const everRaises = centralPath.some((p) => p.spend > startSpend * 1.01);

  const iterations = opts?.iterations ?? 150;
  const rand = mulberry32(opts?.seed ?? 0x9e3779b9);
  const mean = plan.investmentReturn;
  const sd = Math.max(0, plan.returnVolatility);
  const outsideMean = plan.outsideReturn ?? plan.investmentReturn;
  const outsideSd = Math.max(0, plan.outsideVolatility ?? plan.returnVolatility);
  const splitPools = outsideMean !== mean || outsideSd !== sd;
  const startOldest = Math.max(...plan.people.map((p) => p.currentAge));
  const horizon = Math.max(0, Math.round(plan.lifeExpectancy - startOldest));

  const minSpends: number[] = [];
  const yearsBelow: number[] = [];
  for (let iter = 0; iter < iterations; iter++) {
    const returns = new Array(horizon + 1);
    const outsideReturns = splitPools ? new Array(horizon + 1) : undefined;
    for (let t = 0; t <= horizon; t++) {
      const z = standardNormal(rand);
      returns[t] = mean + sd * z;
      if (outsideReturns) outsideReturns[t] = outsideMean + outsideSd * z;
    }
    const spends = retirementSpends(plan, config, returns, outsideReturns);
    if (!spends.length) continue;
    minSpends.push(Math.min(...spends));
    yearsBelow.push(spends.filter((v) => v < startSpend - 1).length);
  }

  minSpends.sort((a, b) => a - b);
  yearsBelow.sort((a, b) => a - b);
  const p10Min = percentile(minSpends, 10); // a rough (bottom-decile) run's deepest spend
  const worstCutPct = startSpend > 0 ? Math.max(0, 1 - p10Min / startSpend) : 0;

  // The illustrative "retire into a downturn" spend path (same as the modal), for
  // the card's mini-preview — truncated where the plan runs short.
  const dtl = guardrailsTimeline(plan, config);
  const downturnPath = dtl.points
    .filter((p) => dtl.failsAtAge == null || p.age <= dtl.failsAtAge)
    .map((p) => ({ age: p.age, spend: p.spend }));

  return {
    startSpend,
    worstCutPct,
    worstCutSpend: Math.round(startSpend * (1 - worstCutPct)),
    yearsBelowBad: percentile(yearsBelow, 90), // pairs with the rough-run cut depth
    everRaises,
    centralPath,
    downturnPath,
  };
}

// --- Illustrative timeline (for the "why does spending stay low?" modal) -------

export interface GuardrailsTimelinePoint {
  age: number;
  spend: number; // living-spend that year (today's $)
  rate: number; // net-of-pension withdrawal rate over the portfolio (fraction; 0 once depleted)
  action: "start" | "cut" | "raise" | "hold";
  funded: boolean; // was spending actually met this year (false once the portfolio is exhausted)
}

export interface GuardrailsTimeline {
  start: number; // initial spend
  floor: number; // the cut floor (max of essentials capped at start, floorPct% of start)
  wr0: number; // initial rate — the rail reference
  upperRail: number; // rate above which spending is cut
  lowerRail: number; // rate below which spending is raised
  pensionAge: number | null; // first age the Age Pension pays (the pivotal recovery)
  plateauSpend: number; // where spending settles by the end
  failsAtAge: number | null; // first age spending can't be met (portfolio exhausted), else null
  didCut: boolean; // did any cut trigger at all (false when spending is all-essentials)
  dipYears: number; // length of the illustrative downturn
  dip: number; // annual return (%) through the downturn
  meanReturn: number; // annual return (%) once returns normalise (the plan's assumption)
  points: GuardrailsTimelinePoint[];
}

/**
 * A single, illustrative "retire into a downturn" path, so the raise/cut modal
 * can show WHY spending ratchets down and recovers only partway. Deterministic:
 * the first `dipYears` years take a market fall, then returns run at the plan's
 * mean. Everything is derived from the engine's own rows (no re-implementation of
 * the guardrail rule) — spending, the net-of-pension rate, and the two rails.
 */
export function guardrailsTimeline(
  plan: RetirementPlan,
  config: EngineConfig,
  opts?: { dip?: number; dipYears?: number },
): GuardrailsTimeline {
  const dip = opts?.dip ?? -12; // annual return through the downturn
  const dipYears = opts?.dipYears ?? 3;
  const startOldest = Math.max(...plan.people.map((p) => p.currentAge));
  const horizon = Math.max(0, Math.round(plan.lifeExpectancy - startOldest));
  // Anchor the downturn to RETIREMENT (not the sim start) — the story is "retire
  // straight into a crash", so it must bite the first years of drawdown even when
  // the plan still has accumulation years to run.
  const retireOffset = householdRetirementOffset(plan);
  const seq = Array.from({ length: horizon + 1 }, (_, t) =>
    t >= retireOffset && t < retireOffset + dipYears ? dip : plan.investmentReturn,
  );

  const sim = simulate(plan, config, seq);
  const rows = sim.rows.filter((r) => r.phase !== "accumulation");
  const points: GuardrailsTimelinePoint[] = [];
  let wr0 = 0;
  let prev = 0;
  let pensionAge: number | null = null;
  rows.forEach((r, i) => {
    const b = r.breakdown;
    const spend = Math.round(b.livingSpend); // the flexed living spend (what the chart's spend line shows)
    const portfolio = r.totalSuper + r.outside;
    // Match the ENGINE's guardrail rate: the FULL call on the portfolio — living
    // spend PLUS the home loan and any post-sale rent — net of ALL income (Age
    // Pension, investment rent, part-time work, a still-working partner's pay).
    const netDraw = Math.max(0, b.livingSpend + b.mortgageCost + b.rentCost - (b.agePension + b.rentIncome + r.workIncome + r.takeHome));
    // A depleted portfolio has no meaningful rate; report 0 for the chart but flag
    // it (via `funded`) so callers can stop plotting the (otherwise exploding) rate.
    const rate = portfolio > 1 ? netDraw / portfolio : 0;
    if (i === 0) wr0 = rate;
    if (b.agePension > 1 && pensionAge == null) pensionAge = r.age;
    const action: GuardrailsTimelinePoint["action"] =
      i === 0 ? "start" : spend < prev - 1 ? "cut" : spend > prev + 1 ? "raise" : "hold";
    prev = spend;
    points.push({ age: r.age, spend, rate, action, funded: r.funded });
  });

  const start = points.length ? points[0].spend : 0;
  const essential = budgetSplit(
    plan.budget?.categories ?? presetCategories(config, plan.household, plan.homeowner, "modest"),
  ).essential;
  const floorPct = (plan.guardrails?.floorPct ?? 70) / 100;
  // Never above the start spend (mirrors the engine): a plan spending all-essentials
  // has no discretionary to trim, so its floor is simply the start.
  const floor = Math.max(Math.min(Math.round(essential), start), Math.round(floorPct * start));
  const width = (plan.guardrails?.guardPct ?? 20) / 100;
  const failsAtAge = points.find((p) => !p.funded)?.age ?? null;

  return {
    start,
    floor,
    wr0,
    upperRail: wr0 * (1 + width),
    lowerRail: wr0 * (1 - width),
    pensionAge,
    plateauSpend: points.length ? points[points.length - 1].spend : start,
    failsAtAge,
    didCut: points.some((p) => p.action === "cut"),
    dipYears,
    dip,
    meanReturn: plan.investmentReturn,
    points,
  };
}

// --- Which story the explainer should tell (shared, testable) ------------------

export type GuardrailsStory = "fails" | "raised" | "recovers" | "holds";

/** How many retirement years the illustrative rough run spends BELOW the starting
 *  spend — the honest measure of how hard guardrails bite in that run. */
export function yearsBelowStart(tl: GuardrailsTimeline): number {
  return tl.points.filter((p) => p.spend < tl.start - 1).length;
}

/**
 * The narrative the guardrails modal/card should tell for a timeline:
 *  - "fails"    — even trimmed to the floor, the plan runs short.
 *  - "raised"   — comfortably funded: mostly upside, spending stays at/above start.
 *  - "recovers" — trimmed in a rough run, then eases back (Age Pension-driven).
 *  - "holds"    — trimmed and stuck at the floor for the rest of retirement.
 *
 * "raised" REQUIRES the run to stay at/above the start for most of retirement — not
 * merely to end above it. A plan cut to the floor for decades that only claws back
 * past the start at the very end is a rescue, not upside (the fire-at-45 case that
 * used to read, wrongly, as "comfortably funded").
 */
export function guardrailsStoryMode(tl: GuardrailsTimeline): GuardrailsStory {
  if (tl.failsAtAge != null) return "fails";
  const below = yearsBelowStart(tl);
  const mostlyAboveStart = tl.points.length === 0 || below <= tl.points.length * 0.2;
  if (tl.plateauSpend > tl.start + 1 && mostlyAboveStart) return "raised";
  if (tl.points.some((p) => p.action === "raise")) return "recovers";
  return "holds";
}
