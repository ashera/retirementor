"use client";

// Dev-only visual harness for the gamified PlanWizard (no DB). ?case=mid|full
import { notFound, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import PlanWizard from "@/components/PlanWizard";
import { DEFAULT_CONFIG as config } from "@/lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "@/lib/au/types";

const mid: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ currentAge: 42, superBalance: 180_000, salary: 95_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  outsideSuper: 0,
  annualOutsideSavings: 0,
  investmentProperty: undefined,
  retirementAge: 67,
  targetSpending: 55_000,
};

const full: RetirementPlan = {
  ...mid,
  people: [{ currentAge: 42, superBalance: 180_000, salary: 95_000, voluntaryConcessional: 8_000, voluntaryNonConcessional: 0 }],
  outsideSuper: 90_000,
  annualOutsideSavings: 6_000,
  investmentProperty: { value: 620_000, growthReal: 2, grossYield: 4, costRatio: 28, loanBalance: 200_000, loanRate: 6, purchasePrice: 350_000, strategy: "hold", sellAtAge: 75 },
};

const couple: RetirementPlan = {
  ...full,
  household: "couple",
  people: [full.people[0], { currentAge: 40, superBalance: 150_000, salary: 70_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
};

const CASES: Record<string, RetirementPlan> = { mid, full, couple };

function Inner() {
  const c = useSearchParams().get("case") ?? "mid";
  return <PlanWizard initial={CASES[c] ?? mid} configured config={config} onComplete={() => {}} onClose={() => {}} />;
}

export default function WizardPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
