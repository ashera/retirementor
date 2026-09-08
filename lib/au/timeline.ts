// Retirement Timeline — turns the active scenario into a chronological, narrated
// "story" of the retirement it describes. PURE: same (plan, result, config) → same
// story. Every FACT line is engine output; the optional VIGNETTE is illustrative
// colour (the view flags it as such) and never carries a figure of its own; Bert
// hosts. The `mood` is derived once from the outcome so Bert and the vignettes can
// never contradict the numbers (the same guard the guardrails story uses).
//
// Everything is indexed by the OLDEST person's age (like YearRow.age); calendar
// years are derived from today + (age − oldest current age), since the engine has
// no birth year. Figures are today's dollars.
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan, SimResult } from "@/lib/au/types";
import {
  oldestCurrentAge,
  personRetirementOffset,
  householdRetirementOffset,
  hasStaggeredRetirement,
  getLifeEvents,
  getIncomeStreams,
  householdHorizon,
} from "@/lib/au/types";
import { appliedStrategies } from "@/lib/au/strategies";
import { fmtCurrency } from "@/lib/au/format";

// Kept structurally identical to components/Bert.tsx's BertPose so a beat's pose is
// assignable to <Bert pose={…}> without coupling lib → components.
export type TimelinePose =
  | "pointer" | "eureka" | "atom" | "flask" | "glasses" | "violin" | "bicycle" | "blackboard";

export type TimelinePhase = "build" | "gogo" | "slowgo" | "nogo" | "horizon";
export type TimelineMood = "strong" | "ok" | "tight" | "short";

export interface TimelineBeat {
  id: string;
  age: number; // oldest-person axis
  year: number; // calendar year
  yearLabel?: string; // overrides the year chip (e.g. a span "2026 – 2034")
  phase: TimelinePhase;
  icon: string;
  title: string;
  fact: string; // always present, from engine figures
  bert?: { pose: TimelinePose; line: string };
  vignette?: string; // illustrative colour; the view tags it
  kind: string;
}

export interface Timeline {
  title: string; // "My retirement timeline" / "Our retirement timeline"
  intro: string;
  headline: string;
  mood: TimelineMood;
  lastsToAge: number;
  mcPct: number | null;
  beats: TimelineBeat[];
}

const PHASE_LABEL: Record<TimelinePhase, string> = {
  build: "Before you retire",
  gogo: "The go-go years",
  slowgo: "Slowing down",
  nogo: "The later years",
  horizon: "",
};
export function phaseLabel(phase: TimelinePhase, staged: boolean): string {
  if (phase === "gogo" && !staged) return "In retirement";
  return PHASE_LABEL[phase];
}

// Illustrative vignette pools (never contain a number). Picked deterministically.
const VIG = {
  retire: [
    "The commute is over. The first weekday with nowhere to be feels enormous — and the plan says you've earned it.",
    "Years of saving quietly turn into something simpler: time that's finally yours to spend.",
  ],
  gogo: [
    "This is the window for the big trips — while energy and health are on your side.",
    "The years you'll do the most living. The plan is built to carry them.",
  ],
  property: [
    "A weight lifts with the sale — one less thing to manage, and a cushion for whatever comes next.",
  ],
  windfall: [
    "A little unexpected room in the plan — the kind that buys peace of mind more than anything else.",
  ],
  mortgage: [
    "The keys are wholly yours now. No repayment to make room for — every dollar goes further.",
  ],
  downsize: [
    "A home full of memories becomes a lighter, simpler place to be — bittersweet, and quietly freeing.",
    "Less house to look after, more life to enjoy — and the equity you built quietly goes to work for the years ahead.",
  ],
  sellRent: [
    "Handing over the keys is a big step — but it trades bricks and upkeep for freedom and flexibility.",
  ],
  pension: [
    "A steady government top-up arrives, taking some of the weight off your own savings.",
  ],
  selfFunded: [
    "You built enough that the pension isn't part of the story — the plan stands on its own two feet.",
  ],
  agedCare: [
    "If more support is needed later, it's already accounted for — the plan doesn't flinch at it.",
  ],
  horizonGood: [
    "You didn't just retire comfortably. You retired with room to spare.",
    "Decades of choices, and the throughline is simple: the money kept up with the life.",
  ],
} as const;

export function buildTimeline(
  plan: RetirementPlan,
  result: SimResult,
  config: EngineConfig,
  opts: { mcPct?: number | null; now?: Date } = {},
): Timeline {
  const couple = plan.people.length > 1;
  const mcPct = opts.mcPct ?? null;
  const nowYear = (opts.now ?? new Date()).getFullYear();
  const oldest = oldestCurrentAge(plan);
  const life = plan.lifeExpectancy;
  const horizonAge = oldest + householdHorizon(plan);
  const yearAt = (age: number) => nowYear + Math.round(age - oldest);
  const rowAt = (age: number) => result.rows.find((r) => r.age === age) ?? null;
  const $ = (n: number) => fmtCurrency(Math.round(n));

  const hhRetOff = Math.max(0, householdRetirementOffset(plan));
  const retireStartAge = oldest + hhRetOff;
  const staged = plan.spendingMode === "stages";
  const goGo = staged ? plan.spendingStages.goGo : plan.targetSpending;
  const slowGoAge = staged ? plan.spendingStages.slowGoAge : Number.POSITIVE_INFINITY;
  const noGoAge = staged ? plan.spendingStages.noGoAge : Number.POSITIVE_INFINITY;

  const runsShort = !result.lastsToLifeExpectancy || result.depletedAge != null;
  const mood: TimelineMood = runsShort
    ? "short"
    : mcPct == null
      ? "ok"
      : mcPct >= 90
        ? "strong"
        : mcPct >= 75
          ? "ok"
          : "tight";

  // Deterministic per-scenario variety (a small LCG seeded off the scenario).
  let seed = Math.abs(Math.round((result.superAtRetirement || 0) + oldest * 37 + goGo)) || 1;
  const pick = <T,>(arr: readonly T[]): T => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return arr[seed % arr.length];
  };
  const vig = (arr: readonly string[]) => (mood === "short" ? undefined : pick(arr));

  const phaseOf = (age: number): TimelinePhase => {
    if (age < retireStartAge) return "build";
    if (age >= noGoAge) return "nogo";
    if (age >= slowGoAge) return "slowgo";
    return "gogo";
  };

  type Draft = Omit<TimelineBeat, "year" | "phase"> & { order: number };
  const drafts: Draft[] = [];
  const add = (d: Draft) => drafts.push(d);
  const nameOf = (i: number) => (i === 0 ? "You" : "Your partner");

  // ── Start / the build ──────────────────────────────────────────────────────
  const superToday =
    plan.superMode === "joint"
      ? plan.jointSuperBalance
      : plan.people.reduce((s, p) => s + (p.superBalance || 0), 0);
  const strategies = appliedStrategies(plan, config);
  const accumBoost = strategies.some((s) =>
    ["salary-sacrifice", "ttr", "recontribute", "keep-accumulation"].includes(s.id),
  );
  if (hhRetOff > 0) {
    add({
      id: "start",
      order: 0,
      age: oldest,
      icon: "🧭",
      kind: "start",
      title: "Where the story starts",
      fact: `Super today is ${$(superToday)}, with ${hhRetOff} more year${hhRetOff === 1 ? "" : "s"} of work ahead.`,
      bert: {
        pose: "glasses",
        line: accumBoost
          ? "“The extra you're putting in now? Let's watch what it turns into.”"
          : "“Here's where you stand today. Now let's play it forward.”",
      },
    });
    add({
      id: "build",
      order: 1,
      age: retireStartAge,
      yearLabel: `${nowYear} – ${yearAt(retireStartAge)}`,
      icon: "📈",
      kind: "build",
      title: "The last stretch of working years",
      fact: `Contributions and growth carry super to ${$(result.superAtRetirement)} by the time you retire.`,
      bert: { pose: "pointer", line: "“Every year here is compounding quietly in the background.”" },
    });
  } else {
    add({
      id: "start",
      order: 0,
      age: oldest,
      icon: "🧭",
      kind: "start",
      title: "Where you are today",
      fact: `Already retired, with ${$(result.totalAtRetirement || superToday)} behind you.`,
      bert: { pose: "glasses", line: "“You're already here — let's see how the years unfold.”" },
    });
  }

  // ── Retirement begins (single, joint, or staggered) ─────────────────────────
  const offsets = plan.people.map((_, i) => personRetirementOffset(plan, i));
  if (couple && hasStaggeredRetirement(plan)) {
    const orderIdx = [0, 1].sort((a, b) => offsets[a] - offsets[b]);
    const firstI = orderIdx[0];
    const secondI = orderIdx[1];
    add({
      id: "retire-1",
      order: 2,
      age: oldest + offsets[firstI],
      icon: "🎻",
      kind: "retire",
      title: firstI === 0 ? "You step back from work" : "Your partner steps back from work",
      fact: `The household moves into retirement — ${nameOf(secondI).toLowerCase()} keeps working a while, and that income helps carry the early years.`,
      bert: { pose: "violin", line: "“One of you clocks off. The plan leans on the other's pay for now — by design.”" },
      vignette: vig(VIG.retire),
    });
    add({
      id: "retire-2",
      order: 2,
      age: oldest + offsets[secondI],
      icon: "🥂",
      kind: "retire",
      title: secondI === 0 ? "You finish work too" : "Your partner finishes work too",
      fact: `You're both fully retired now, on a ${$(goGo)}/yr plan.`,
      bert: { pose: "bicycle", line: "“And now it's both of you. This is what the saving was for.”" },
    });
  } else {
    add({
      id: "retire",
      order: 2,
      age: retireStartAge,
      icon: "🎻",
      kind: "retire",
      title: couple ? "You both finish work" : "You finish work",
      fact: `Retirement begins on a ${$(goGo)}/yr plan${mood === "strong" ? " — comfortably funded" : ""}.`,
      bert: { pose: "violin", line: "“From here on, the plan does the earning — not you.”" },
      vignette: vig(VIG.retire),
    });
  }

  // ── Recurring income streams (DB pension / annuity / foreign pension) ────────
  getIncomeStreams(plan).forEach((s, i) => {
    const ownerIdx = s.owner >= 0 ? s.owner : 0;
    const cur = plan.people[ownerIdx]?.currentAge ?? oldest;
    const age = oldest + Math.round(s.fromAge - cur);
    if (age < oldest || age > horizonAge) return;
    add({
      id: `stream-${i}`,
      order: 4,
      age,
      icon: "🏦",
      kind: "income-stream",
      title: `${s.label} begins`,
      fact: `A recurring ${$(s.perYear)}/yr income stream starts paying out.`,
      bert: { pose: "pointer", line: "“A cheque that turns up regardless of the markets — that's worth a lot.”" },
    });
  });

  // ── Super flips to the tax-free pension phase (per person) ───────────────────
  result.superUnlockAges.forEach((a, i) => {
    if (a == null) return;
    add({
      id: `unlock-${i}`,
      order: 5,
      age: a,
      icon: "🔓",
      kind: "super-flip",
      title: couple
        ? `${i === 0 ? "Your" : "Your partner's"} super turns tax-free`
        : "Your super turns tax-free",
      fact: "Preserved super moves into the tax-free pension phase — its earnings and withdrawals stop being taxed.",
      bert: { pose: "eureka", line: "“From here the tax office stops taking a slice of this pot. Nice.”" },
    });
  });

  // ── Selling an investment property ──────────────────────────────────────────
  result.rows.forEach((r) => {
    const proceeds = r.breakdown.propertyProceeds ?? 0;
    if (proceeds <= 0) return;
    add({
      id: `prop-${r.age}`,
      order: 6,
      age: r.age,
      icon: "🏠",
      kind: "property",
      title: "You sell the investment property",
      fact: `About ${$(proceeds)} is released (after CGT) and added to your savings.`,
      bert: { pose: "eureka", line: "“A big asset turns into spendable money — and simpler years ahead.”" },
      vignette: vig(VIG.property),
    });
  });

  // ── Life events (windfalls / one-off expenses) ──────────────────────────────
  getLifeEvents(plan).forEach((e, i) => {
    if (e.atAge < oldest || e.atAge > horizonAge) return;
    if (e.kind === "income") {
      add({
        id: `event-${i}`,
        order: 7,
        age: e.atAge,
        icon: "💰",
        kind: "life-event",
        title: e.label?.trim() || "A windfall arrives",
        fact: `${$(e.amount)} comes in and is added to your savings.`,
        bert: { pose: "eureka", line: "“Unexpected money is a gift — the plan tucks it away for you.”" },
        vignette: vig(VIG.windfall),
      });
    } else {
      add({
        id: `event-${i}`,
        order: 7,
        age: e.atAge,
        icon: "💸",
        kind: "life-event",
        title: e.label?.trim() || "A one-off expense",
        fact: `${$(e.amount)} goes out${e.label ? ` for ${e.label.trim().toLowerCase()}` : ""} — and the plan absorbs it.`,
        bert: { pose: "glasses", line: "“A big one-off. Good news: it was planned for.”" },
      });
    }
  });

  // ── The family home: downsizing, or selling up to rent (a big, emotional move) ─
  let homeMoveAge: number | null = null;
  const homeMoveRow = result.rows.find((r) => (r.breakdown.homeProceeds ?? 0) > 0) ?? null;
  if (plan.home?.downsize) {
    const dz = plan.home.downsize;
    const r = rowAt(dz.atAge) ?? homeMoveRow;
    const freed = r?.breakdown.homeProceeds ?? 0;
    const toSuper = r?.breakdown.homeProceedsToSuper ?? 0;
    const age = r ? r.age : dz.atAge;
    homeMoveAge = age;
    add({
      id: "downsize",
      order: 6,
      age,
      icon: "🏡",
      kind: "downsize",
      title: "You downsize the family home",
      fact:
        freed > 0
          ? `Moving to a ${$(dz.newValue)} home frees about ${$(freed)}${toSuper > 0 ? `, with ${$(toSuper)} going into super as a downsizer contribution` : ""}.`
          : `You move to a smaller ${$(dz.newValue)} home, freeing up equity for the years ahead.`,
      bert: { pose: "bicycle", line: "“A big move — and a real lift to the plan. The house was always more than an asset.”" },
      vignette: vig(VIG.downsize),
    });
  } else if (plan.home?.sellAndRent) {
    const sr = plan.home.sellAndRent;
    const r = rowAt(sr.atAge) ?? homeMoveRow;
    const freed = r?.breakdown.homeProceeds ?? 0;
    const age = r ? r.age : sr.atAge;
    homeMoveAge = age;
    add({
      id: "sell-and-rent",
      order: 6,
      age,
      icon: "🧳",
      kind: "sell-and-rent",
      title: "You sell up and rent",
      fact:
        freed > 0
          ? `Selling the home releases about ${$(freed)} into your savings; from here you rent, at about ${$(sr.rentPerYear)}/yr.`
          : `You sell the home and rent from here, at about ${$(sr.rentPerYear)}/yr.`,
      bert: { pose: "glasses", line: "“Turning the home into flexibility and cash — a different kind of security.”" },
      vignette: vig(VIG.sellRent),
    });
  }

  // ── Mortgage cleared (with-super lump, or a P&I payoff) ─────────────────────
  let clearAge: number | null = null;
  let clearLump = 0;
  for (const r of result.rows) {
    if ((r.breakdown.mortgageCleared ?? 0) > 0) {
      clearAge = r.age;
      clearLump = r.breakdown.mortgageCleared ?? 0;
      break;
    }
  }
  if (clearAge == null) {
    let prev: number | null = null;
    for (const r of result.rows) {
      const c = r.breakdown.mortgageCost ?? 0;
      if (prev != null && prev > 0 && c === 0) {
        clearAge = r.age;
        break;
      }
      prev = c;
    }
    // A P&I loan repaid as part of a home move isn't its own beat — the move covers it.
    if (clearAge != null && clearAge === homeMoveAge) clearAge = null;
  }
  if (clearAge != null && clearAge > oldest) {
    add({
      id: "mortgage",
      order: 8,
      age: clearAge,
      icon: "🔑",
      kind: "mortgage",
      title: "The mortgage is behind you",
      fact: clearLump > 0 ? `The home loan is cleared with a ${$(clearLump)} lump from super.` : "The home loan is paid off.",
      bert: { pose: "bicycle", line: "“Loan gone. Every dollar of income stretches further now.”" },
      vignette: vig(VIG.mortgage),
    });
  }

  // ── Age Pension begins, or self-funded ──────────────────────────────────────
  if (result.firstAgePensionAge != null) {
    const r = rowAt(result.firstAgePensionAge);
    const amt = r ? r.agePension : 0;
    add({
      id: "pension",
      order: 9,
      age: result.firstAgePensionAge,
      icon: "🏛️",
      kind: "pension",
      title: "The Age Pension begins",
      fact:
        amt > 0
          ? `The Age Pension starts topping up your income — about ${$(amt)}/yr to begin with, easing the draw on your own savings.`
          : "You become eligible for the Age Pension, a government-backed floor under your income.",
      bert: { pose: "pointer", line: "“The pension does some of the lifting now — that's it earning its keep.”" },
      vignette: vig(VIG.pension),
    });
  } else {
    const spAge = Math.max(retireStartAge + 1, result.agePensionAge);
    if (spAge <= horizonAge) {
      add({
        id: "self-funded",
        order: 9,
        age: spAge,
        icon: "🛡️",
        kind: "self-funded",
        title: "Self-funded, by choice",
        fact: "Your assets keep you above the Age Pension threshold — this plan stands on its own two feet.",
        bert: { pose: "pointer", line: "“No pension cheque here — and that's the plan working, not a gap in it.”" },
        vignette: vig(VIG.selfFunded),
      });
    }
  }

  // ── The spending smile eases (staged plans only) ────────────────────────────
  if (staged && slowGoAge > retireStartAge && slowGoAge <= horizonAge) {
    add({
      id: "slowgo",
      order: 10,
      age: slowGoAge,
      icon: "🚲",
      kind: "slowgo",
      title: "The pace eases",
      fact: `Spending naturally settles to about ${$(plan.spendingStages.slowGo)}/yr — the slow-go years.`,
      bert: { pose: "bicycle", line: "“The big adventures give way to gentler ones — and the budget follows.”" },
    });
  }
  if (staged && noGoAge > retireStartAge && noGoAge <= horizonAge) {
    add({
      id: "nogo",
      order: 12,
      age: noGoAge,
      icon: "🍵",
      kind: "nogo",
      title: "Quieter years",
      fact: `Spending eases again to about ${$(plan.spendingStages.noGo)}/yr — closer to home.`,
      bert: { pose: "glasses", line: "“Life slows, and so does the spending. The plan expects it.”" },
    });
  }

  // ── Aged care (only if modelled in the scenario) ────────────────────────────
  if (plan.agedCare?.enabled && Number.isFinite(plan.agedCare.entryAge)) {
    const entry = plan.agedCare.entryAge;
    const rc = rowAt(entry);
    const cost = rc?.breakdown.agedCareFull ?? rc?.breakdown.agedCareTotal ?? 0;
    if (entry <= horizonAge) {
      add({
        id: "aged-care",
        order: 11,
        age: entry,
        icon: "🕊️",
        kind: "aged-care",
        title: "More support, if it's needed",
        fact:
          cost > 0
            ? `Should care be needed around now, the plan carries about ${$(cost)}/yr of costs — already built in.`
            : "The plan sets aside for aged-care costs from around here.",
        bert: { pose: "glasses", line: "“If this chapter comes, the plan has already made room for it.”" },
        vignette: vig(VIG.agedCare),
      });
    }
  }

  // ── The ending — honest either way ──────────────────────────────────────────
  if (mood === "short") {
    const failAge = result.depletedAge ?? life;
    add({
      id: "horizon",
      order: 99,
      age: failAge,
      icon: "⚠️",
      kind: "horizon-short",
      title: "Where the plan gets tight",
      fact: `On the current plan, your savings run low around ${failAge}. A few years of part-time work, easing the go-go budget, or a later start all close the gap — try them on the What-If board.`,
      bert: { pose: "glasses", line: "“This isn't a dead end — it's a nudge. A small change here buys a lot of runway.”" },
    });
  } else {
    const lastAge = drafts.reduce((m, d) => Math.max(m, d.age), 0);
    add({
      id: "horizon",
      order: 99,
      age: Math.max(life, lastAge),
      icon: "🎗️",
      kind: "horizon",
      title: "And it lasts",
      fact:
        mcPct != null
          ? `Across thousands of possible market runs, your money carries you to ${life} about ${Math.round(mcPct)}% of the time.`
          : `Your money is projected to carry you comfortably through to ${life}.`,
      bert: {
        pose: "blackboard",
        line: mood === "strong" ? "“Room to spare — that's a plan that did its job.”" : "“It holds. Not by luck — by the choices stacked up behind you.”",
      },
      vignette: vig(VIG.horizonGood),
    });
  }

  // Sort onto the age axis; break ties with the intrinsic order rank.
  drafts.sort((a, b) => a.age - b.age || a.order - b.order);

  // For a plan that runs short, don't narrate beats that occur after the money is
  // gone (the smile easing, "it lasts") — only the honest "gets tight" ending.
  let kept = drafts;
  if (mood === "short" && result.depletedAge != null) {
    const dep = result.depletedAge;
    kept = drafts.filter((d) => d.kind === "horizon-short" || d.age <= dep);
  }

  const beats: TimelineBeat[] = kept.map((d) => ({
    id: d.id,
    age: d.age,
    yearLabel: d.yearLabel,
    icon: d.icon,
    title: d.title,
    fact: d.fact,
    bert: d.bert,
    vignette: d.vignette,
    kind: d.kind,
    year: yearAt(d.age),
    phase: (d.kind === "horizon" || d.kind === "horizon-short" ? "horizon" : phaseOf(d.age)) as TimelinePhase,
  }));

  const retireOwnAge = plan.people[0].currentAge + personRetirementOffset(plan, 0);
  const headline =
    mood === "short"
      ? `Retire at ${retireOwnAge} — with a gap to close`
      : `Retire at ${retireOwnAge} · your money lasts to ${life}`;

  return {
    title: couple ? "Our retirement timeline" : "My retirement timeline",
    intro: couple
      ? "Both of you, from your last day of work onward — the milestones, and the years your plan is built to carry."
      : "From your last day of work onward — the milestones, and the years your plan is built to carry.",
    headline,
    mood,
    lastsToAge: life,
    mcPct,
    beats,
  };
}
