// Pure extraction of the age-pinned What-If strategy events that the balance chart
// surfaces as bottom-axis PINS (one-off moments) and faint BANDS (spans). Kept out of
// the chart component so it's unit-testable and reused by the dashboard + report charts.
//
// Life events and aged care are handled from their own chart props; gap years already
// render as break bands (see breakSpans). This covers only the strategy layer.

import type { RetirementPlan } from "./types";
import { getInvestmentProperties } from "./types";
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
