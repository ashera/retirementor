// Shared "how complete is this plan?" model — the fuel for the wizard's progress
// ring and the dashboard indicator. Measures what the user has TOLD us: core
// sections plus optional enrichments, where an optional section counts once it
// has data OR the user has explicitly answered it (incl. "none", via
// plan.answered). Keeping this in one place means the wizard and dashboard agree.

import { hasInvestmentProperty } from "./types";
import type { RetirementPlan } from "./types";

export interface CompSection {
  key: string;
  label: string;
  core: boolean;
  optional: boolean;
  complete: boolean;
}

export interface PlanCompleteness {
  pct: number;
  tier: "Sketch" | "Working model" | "Detailed" | "Complete picture";
  completeCount: number;
  total: number;
  coreComplete: boolean;
  sections: CompSection[];
  byKey: Record<string, CompSection>;
  gapKey: string | null; // first core gap, else first optional gap
}

export function planCompleteness(plan: RetirementPlan): PlanCompleteness {
  const isCouple = plan.household === "couple";
  const a = plan.answered ?? {};
  const p0 = plan.people[0];
  const p1 = plan.people[1];
  const hasContrib = plan.people.some((p) => p.voluntaryConcessional > 0 || p.voluntaryNonConcessional > 0);
  const hasOutside = plan.outsideSuper > 0 || plan.annualOutsideSavings > 0;
  const goalSet = plan.retirementAge > 0 && (plan.spendingMode === "stages" ? plan.spendingStages.goGo > 0 : plan.targetSpending > 0);

  const sections: CompSection[] = [
    { key: "household", label: "household", core: true, optional: false, complete: true },
    { key: "you", label: "your details", core: true, optional: false, complete: !!p0 && (p0.superBalance > 0 || p0.salary > 0) },
    ...(isCouple ? [{ key: "partner", label: "your partner", core: true, optional: false, complete: !!p1 && (p1.superBalance > 0 || p1.salary > 0) }] : []),
    { key: "contributions", label: "extra contributions", core: false, optional: true, complete: hasContrib || !!a.contributions },
    { key: "outside", label: "outside savings", core: false, optional: true, complete: hasOutside || !!a.outside },
    { key: "property", label: "a property", core: false, optional: true, complete: hasInvestmentProperty(plan) || !!a.property },
    { key: "goal", label: "retirement goal", core: true, optional: false, complete: goalSet },
  ];

  const completeCount = sections.filter((s) => s.complete).length;
  const total = sections.length;
  const pct = Math.round((completeCount / total) * 100);
  const coreComplete = sections.every((s) => !s.core || s.complete);
  const enrich = sections.filter((s) => s.optional && s.complete).length;
  const tier = !coreComplete ? "Sketch" : pct === 100 ? "Complete picture" : enrich === 0 ? "Working model" : "Detailed";
  const byKey = Object.fromEntries(sections.map((s) => [s.key, s]));
  const gap = sections.find((s) => s.core && !s.complete) ?? sections.find((s) => s.optional && !s.complete);
  return { pct, tier, completeCount, total, coreComplete, sections, byKey, gapKey: gap?.key ?? null };
}
