// The "retirement income goal" a user sees is the TRUE amount they must fund each
// year — their steady-state living costs PLUS any ongoing home-loan cost. The loan
// is temporary/scenario-dependent, so we keep it out of `targetSpending` (the engine
// layers it on itself — see simulate.ts) and combine the two only for display here.

import { mortgageAnnualCost } from "./mortgage";
import type { RetirementPlan } from "./types";

export type GoalLoanKind = "none" | "pi" | "io" | "cleared";

export interface GoalBreakdown {
  living: number; // steady-state / go-go living costs (excludes the loan)
  loanCost: number; // ongoing annual home-loan cost (0 if none or cleared)
  total: number; // living + loanCost — the amount to fund from day one
  loanKind: GoalLoanKind;
  payoffAge: number | null; // P&I: when the repayment (and the uplift) stops
  clearBalance: number | null; // clear-at-retirement: one-off super lump sum
}

export function retirementGoal(plan: RetirementPlan): GoalBreakdown {
  const living =
    plan.spendingMode === "stages" ? plan.spendingStages.goGo : plan.targetSpending;

  const m = plan.mortgage;
  let loanCost = 0;
  let loanKind: GoalLoanKind = "none";
  let payoffAge: number | null = null;
  let clearBalance: number | null = null;

  if (m) {
    if (m.strategy === "clear_at_retirement") {
      loanKind = "cleared";
      clearBalance = m.balance;
    } else {
      loanCost = mortgageAnnualCost(m);
      loanKind = m.type === "interest_only" ? "io" : "pi";
      payoffAge = m.payoffAge;
    }
  }

  return { living, loanCost, total: living + loanCost, loanKind, payoffAge, clearBalance };
}
