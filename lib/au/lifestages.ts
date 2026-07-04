// Retirement "spending smile" lifestage breakdown — splits each stage
// (go-go / slow-go / no-go) into Essentials, Discretionary and any Home loan.
// Shared by the on-screen LifestageModal and the PDF report so both agree.

import type { EngineConfig } from "./config";
import type { RetirementPlan } from "./types";
import { budgetSplit, isEssential } from "./budget";
import { retirementGoal, type GoalBreakdown } from "./goal";

const round100 = (x: number) => Math.round(x / 100) * 100;

/**
 * The flat essentials floor: taken from the user's budget when they've built
 * one, otherwise estimated from the ASFA Retirement Standard's essential share
 * (clamped to the smallest stage so discretionary never goes negative).
 */
export function essentialsFloor(
  plan: RetirementPlan,
  config: EngineConfig,
): { value: number; estimated: boolean } {
  if (plan.budget) {
    return { value: round100(budgetSplit(plan.budget.categories).essential), estimated: false };
  }
  const hh = plan.household === "couple" ? "couple" : "single";
  let ess = 0;
  let tot = 0;
  for (const c of config.asfa.breakdown.categories) {
    const v = c.comfortable[hh];
    tot += v;
    if (isEssential(c.key)) ess += v;
  }
  const frac = tot > 0 ? ess / tot : 0.75;
  const floor = Math.min(plan.spendingStages.goGo * frac, plan.spendingStages.noGo);
  return { value: round100(floor), estimated: true };
}

export interface LifestageRow {
  key: "Go-go" | "Slow-go" | "No-go";
  ageFrom: number;
  ageTo: number;
  living: number; // essentials + discretionary
  essentials: number;
  discretionary: number;
  loan: number; // home-loan cost active in this stage (0 if none)
  total: number; // living + loan
}

export interface LifestageBreakdown {
  rows: LifestageRow[];
  essentials: number;
  estimated: boolean; // true when the essentials split is an ASFA estimate (no budget)
  goal: GoalBreakdown;
}

/** Per-stage Essentials / Discretionary / Home-loan / Total for a plan. */
export function lifestageBreakdown(plan: RetirementPlan, config: EngineConfig): LifestageBreakdown {
  const s = plan.spendingStages;
  const { value: essentials, estimated } = essentialsFloor(plan, config);
  const goal = retirementGoal(plan);

  const loanActiveFrom = (ageFrom: number) => {
    if (goal.loanKind === "io") return true;
    if (goal.loanKind === "pi") return goal.payoffAge == null || ageFrom < goal.payoffAge;
    return false;
  };

  const defs: Omit<LifestageRow, "essentials" | "discretionary" | "loan" | "total">[] = [
    { key: "Go-go", ageFrom: plan.retirementAge, ageTo: s.slowGoAge, living: s.goGo },
    { key: "Slow-go", ageFrom: s.slowGoAge, ageTo: s.noGoAge, living: s.slowGo },
    { key: "No-go", ageFrom: s.noGoAge, ageTo: plan.lifeExpectancy, living: s.noGo },
  ];

  const rows: LifestageRow[] = defs.map((d) => {
    const discretionary = Math.max(0, d.living - essentials);
    const loan = loanActiveFrom(d.ageFrom) ? goal.loanCost : 0;
    return { ...d, essentials, discretionary, loan, total: d.living + loan };
  });

  return { rows, essentials, estimated, goal };
}
