// The "confidence" read of a plan: where the user's income goal sits against three
// spend tiers, each the most they could spend at a given level of prudence —
//   • central  (50%)  — the most that lasts on the assumed average return
//   • safe     (85%)  — the most that clears the shared Monte Carlo confidence bar
//   • failsafe (95%)  — the most that survives even a bad run of markets
// All three are LOAN-INCLUSIVE annual figures (living + any ongoing home loan), so
// they compare like-for-like with the retirement income goal (see lib/au/goal.ts).
// The heavy tiers (safe, failsafe) are Monte Carlo solves — callers compute them
// off the interaction path and pass them in; this module only classifies + phrases.

/** Below this ($/yr), headroom or overspend is treated as "right at" the tier. */
export const CONFIDENCE_EPS = 1000;

export type ConfidenceState =
  | "bulletproof" // goal ≤ failsafe — survives the worst history, with room to spare
  | "safe" //        failsafe < goal ≤ safe — comfortably funded
  | "ambitious" //   safe < goal ≤ central — works on average, but above a safe level
  | "short"; //      goal > central — above even the optimistic level

export interface ConfidenceTiers {
  failsafe: number; // loan-inclusive
  safe: number; // loan-inclusive
  central: number; // loan-inclusive
}

/** Which band the loan-inclusive goal falls in. Tiers are monotone
 *  (failsafe ≤ safe ≤ central), so the checks read low-to-high. */
export function confidenceState(goal: number, t: ConfidenceTiers): ConfidenceState {
  if (goal <= t.failsafe + CONFIDENCE_EPS) return "bulletproof";
  if (goal <= t.safe + CONFIDENCE_EPS) return "safe";
  if (goal <= t.central + CONFIDENCE_EPS) return "ambitious";
  return "short";
}

/** Spare room above the goal at the safe (85%) tier — positive is headroom to spend
 *  more, negative is spending above the safe level. */
export function safeHeadroom(goal: number, t: ConfidenceTiers): number {
  return t.safe - goal;
}
