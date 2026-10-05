// Pure extraction of the age-pinned What-If strategy events that the balance chart
// surfaces as bottom-axis PINS (one-off moments) and faint BANDS (spans). Kept out of
// the chart component so it's unit-testable and reused by the dashboard + report charts.
//
// Life events and aged care are handled from their own chart props; gap years already
// render as break bands (see breakSpans). This covers only the strategy layer.

import type { RetirementPlan } from "./types";
import { getInvestmentProperties, getSavingsChanges, householdRetirementOffset, oldestCurrentAge } from "./types";
import { mortgagePayoffAge } from "./mortgage";
import { fmtCompact } from "./format";

export interface EventPin {
  key: string;
  age: number; // oldest-person age axis (same as the other markers)
  icon: string; // an emoji glyph shown on the axis
  label: string; // short name (tooltip / native title)
  detail?: string; // optional second line for the tooltip
  color: string;
}

export interface EventBand {
  key: string;
  x1: number;
  x2: number;
  label: string;
  color: string;
}

/** Discrete, age-pinned strategy moments → pins. */
export function strategyEventPins(plan: RetirementPlan): EventPin[] {
  const pins: EventPin[] = [];
  const dz = plan.home?.downsize;
  if (dz) pins.push({ key: "downsize", age: dz.atAge, icon: "🏠", label: "Downsize", detail: `Home → ${fmtCompact(dz.newValue)}`, color: "#f59e0b" });
  const sar = plan.home?.sellAndRent;
  if (sar) pins.push({ key: "sell-rent", age: sar.atAge, icon: "🏠", label: "Sell up & rent", color: "#f59e0b" });
  if (plan.mortgage?.strategy === "clear_at_retirement") pins.push({ key: "clear-mortgage", age: plan.retirementAge, icon: "🏦", label: "Clear the mortgage", color: "#f59e0b" });
  const ls = plan.lumpSum;
  if (ls) pins.push({ key: "lump-sum", age: ls.atAge, icon: "💰", label: "Lump sum", detail: `${fmtCompact(ls.amount)} from super`, color: "#fbbf24" });
  getInvestmentProperties(plan).forEach((pr, i) => {
    if (pr.strategy === "sell") pins.push({ key: `sell-prop-${i}`, age: pr.sellAtAge, icon: "🏡", label: `Sell ${pr.name?.trim() || `property ${i + 1}`}`, color: "#fb923c" });
  });
  const wi = plan.workIncome;
  if (wi) pins.push({ key: "part-time-end", age: wi.untilAge, icon: "👔", label: "Part-time work ends", color: "#38bdf8" });
  const dr = plan.debtRecycle;
  if (dr) pins.push({ key: "debt-recycle-end", age: dr.untilAge, icon: "♻️", label: "Debt recycling ends", color: "#38bdf8" });
  // Stepped savings changes (kids leave home, mortgage paid off…): a pin per step,
  // up or down relative to the running rate.
  let runningSavings = plan.annualOutsideSavings;
  for (const c of getSavingsChanges(plan)) {
    const up = c.amount >= runningSavings;
    pins.push({ key: `savings-${c.id}`, age: c.atAge, icon: up ? "📈" : "📉", label: up ? "Save more" : "Save less", detail: `${fmtCompact(c.amount)}/yr`, color: "#34d399" });
    runningSavings = c.amount;
  }
  // A carried P&I loan that amortises on its own → pin the age it clears. In the
  // WORKING years with the redirect on, that freed repayment goes to savings; when it
  // clears in RETIREMENT the repayment was part of spending, so the drawdown drops.
  // (The clear-with-super strategy has its own pin above.)
  const mort = plan.mortgage;
  if (mort?.strategy === "carry" && mort.type === "principal_interest") {
    const payoff = mortgagePayoffAge(mort, oldestCurrentAge(plan));
    if (payoff != null && payoff <= plan.lifeExpectancy) {
      const inWorkingYears = payoff < oldestCurrentAge(plan) + householdRetirementOffset(plan);
      if (plan.redirectMortgageToSavings && inWorkingYears) {
        pins.push({ key: "mortgage-redirect", age: payoff, icon: "🏡", label: "Mortgage cleared → save the repayments", color: "#34d399" });
      } else {
        pins.push({ key: "mortgage-cleared", age: payoff, icon: "🏦", label: inWorkingYears ? "Mortgage cleared" : "Mortgage cleared — spending drops", color: "#f59e0b" });
      }
    }
  }
  return pins;
}

/** Age-range strategies → faint bands (recontribution window; gap years are drawn
 *  separately from break spans). */
export function strategyEventBands(plan: RetirementPlan): EventBand[] {
  const bands: EventBand[] = [];
  const rc = plan.recontribute;
  if (rc && rc.untilAge > rc.fromAge) {
    bands.push({ key: "recontribute", x1: rc.fromAge, x2: rc.untilAge, label: "Recontribution", color: "#2dd4bf" });
  }
  return bands;
}
