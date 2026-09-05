// Budget Quest — the pure game logic that sits over the existing budget mechanics
// (lib/au/budget.ts + the projection engine). No React, no engine changes: it just
// scores a budget into a lifestyle TIER, a sustainability VERDICT, milestone BADGES
// and a line of guidance from Bert. Kept pure so it's unit-testable and shared by the
// embedded play mode and the standalone /budget tool.

import type { EngineConfig } from "./config";
import type { Household, RetirementPlan } from "./types";
import { DEFAULT_PLAN } from "./types";

export type QuestTier = "below" | "modest" | "comfortable" | "premium";

export interface TierInfo {
  tier: QuestTier;
  index: number; // 0..3, drives the 4-segment meter
  label: string;
  thresholds: { modest: number; comfortable: number; premium: number };
}

const TIER_LABEL: Record<QuestTier, string> = {
  below: "Below modest",
  modest: "Modest",
  comfortable: "Comfortable",
  premium: "Premium",
};

/**
 * Classify a total annual budget into a lifestyle tier against the ASFA standards.
 * Modest & Comfortable are the canonical ASFA headline figures; Premium is a
 * "generous" step above Comfortable (the same spirit as the budget builder's
 * premium preset, which uplifts discretionary spend).
 */
export function budgetTier(total: number, household: Household, config: EngineConfig): TierInfo {
  const modest = config.asfa.modest[household];
  const comfortable = config.asfa.comfortable[household];
  const premium = Math.round((comfortable * 1.25) / 500) * 500;
  let tier: QuestTier;
  let index: number;
  if (total >= premium) { tier = "premium"; index = 3; }
  else if (total >= comfortable) { tier = "comfortable"; index = 2; }
  else if (total >= modest) { tier = "modest"; index = 1; }
  else { tier = "below"; index = 0; }
  return { tier, index, label: TIER_LABEL[tier], thresholds: { modest, comfortable, premium } };
}

export type SustainStatus = "good" | "warn" | "bad";

export interface SustainVerdict {
  status: SustainStatus;
  label: string;
}

/**
 * The sustainability verdict for the gauge. Confidence (Monte-Carlo success, 0..1) is
 * the primary signal because it accounts for market risk; `lastsToLE` (the central,
 * deterministic run) gates the top rating so a plan that doesn't even last on the
 * central path can't read as "on track".
 */
export function sustainabilityVerdict(lastsToLE: boolean, confidence: number): SustainVerdict {
  if (lastsToLE && confidence >= 0.85) return { status: "good", label: "On track" };
  if (confidence >= 0.6 || lastsToLE) return { status: "warn", label: "Tight" };
  return { status: "bad", label: "Runs short" };
}

export interface Badge {
  id: string;
  icon: string;
  label: string;
  earned: boolean;
  phase?: number; // future-phase badges show locked
}

export interface BadgeInputs {
  tierIndex: number;
  lastsToLE: boolean;
  confidence: number; // 0..1
  stressSurvived?: boolean; // Phase 3 (stress test) — undefined = locked
}

/** Milestone badges. Reward SMART states (a lifestyle that lasts), never spend size. */
export function computeBadges(i: BadgeInputs): Badge[] {
  return [
    { id: "comfortable", icon: "🏅", label: "ASFA Comfortable", earned: i.tierIndex >= 2 },
    { id: "funded", icon: "🛡️", label: "Fully funded", earned: i.lastsToLE },
    { id: "confident", icon: "🎯", label: "High confidence", earned: i.confidence >= 0.85 },
    { id: "downturn", icon: "💧", label: "Downturn-proof", earned: !!i.stressSurvived, phase: 3 },
  ];
}

export interface BertContext {
  status: SustainStatus;
  tier: QuestTier;
  headroom: number; // maxSustainableSpend − total; >0 = room to spend more
}

/**
 * One line of Bert's guidance for the current state. Always constructive — when a
 * budget doesn't last, it points at a lever, never shames the spend.
 */
export function bertLine({ status, tier, headroom }: BertContext): string {
  if (status === "bad") {
    return "Hmm — at this lifestyle your money runs short. Try easing back travel or dining, or see what downsizing and the Age Pension can do.";
  }
  if (status === "warn") {
    return "So close! It mostly holds, but it's tight. A small trim — or a lever like downsizing — would put you comfortably in the clear.";
  }
  // good
  if (tier === "premium") return "Living large — and it still lasts! That's a generous retirement that holds up.";
  if (headroom >= 5000) return `Safe with room to spare — you could add about ${money(headroom)} a year and still be fine.`;
  if (tier === "comfortable") return "Nice — a comfortable retirement that goes the distance.";
  return "Solid and sustainable. If you'd like more lifestyle, you've got room to add it.";
}

function money(n: number): string {
  return "$" + (Math.round(n / 100) * 100).toLocaleString("en-AU");
}

export interface QuestInputs {
  household: Household;
  superBalance: number;
  retirementAge: number;
  homeowner?: boolean;
}

/**
 * Build a minimal, engine-valid plan from the standalone tool's 2–3 quick inputs, so the
 * "will it last?" constraint is real. Models the household AT retirement (currentAge =
 * retirementAge) — a clean pure-drawdown check of whether a budget lasts on this super.
 */
export function questPlanFromInputs({ household, superBalance, retirementAge, homeowner = true }: QuestInputs): RetirementPlan {
  const person = (bal: number) => ({ currentAge: retirementAge, superBalance: bal, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 });
  const people = household === "couple" ? [person(superBalance / 2), person(superBalance / 2)] : [person(superBalance)];
  return {
    ...DEFAULT_PLAN,
    household,
    people,
    superMode: "individual",
    homeowner,
    outsideSuper: 0,
    annualOutsideSavings: 0,
    retirementAge,
    lifeExpectancy: 90,
  };
}
