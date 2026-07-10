"use client";

// Dev-only measurement harness for the PDF report. Renders ReportView with
// representative "stress" plans (couple + mortgage + property + full budget,
// etc.) using DEFAULT_CONFIG — no DB — so scripts/measure-report.mjs can load
// it at A4 print dimensions and flag any section that overflows its page.
// Not available in production.

import { Suspense } from "react";
import { notFound, useSearchParams } from "next/navigation";
import ReportView from "@/components/ReportView";
import { DEFAULT_CONFIG as config } from "@/lib/au/config";
import { simulate } from "@/lib/au/simulate";
import { runMonteCarlo } from "@/lib/au/montecarlo";
import { budgetToStages, budgetTotal, presetCategories } from "@/lib/au/budget";
import {
  DEFAULT_PLAN,
  type MortgageDetail,
  type PropertyDetail,
  type RetirementPlan,
} from "@/lib/au/types";

const person = (over: Partial<RetirementPlan["people"][number]>) => ({
  currentAge: 55, superBalance: 350_000, salary: 90_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0, ...over,
});

const mortgage: MortgageDetail = { type: "principal_interest", balance: 180_000, interestRate: 6, annualRepayment: 20_000, payoffAge: 72, strategy: "carry" };
const property: PropertyDetail = { value: 500_000, growthReal: 2, grossYield: 4.5, costRatio: 28, loanBalance: 180_000, loanRate: 6, purchasePrice: 300_000, strategy: "hold", sellAtAge: 80 };

function withBudget(base: RetirementPlan, homeowner: boolean): RetirementPlan {
  const categories = presetCategories(config, base.household === "couple" ? "couple" : "single", homeowner, "comfortable");
  return { ...base, spendingMode: "stages", spendingStages: budgetToStages(config, categories), targetSpending: budgetTotal(categories), budget: { tenure: homeowner ? "own" : "rent", lifestyle: "comfortable", categories, applyPhases: true } };
}

const base = (over: Partial<RetirementPlan>): RetirementPlan => ({
  ...DEFAULT_PLAN, household: "single", superMode: "individual",
  people: [person({})], homeowner: true, outsideSuper: 150_000, annualOutsideSavings: 5_000,
  retirementAge: 67, spendingMode: "flat", targetSpending: 45_000,
  investmentReturn: 6, inflation: 2.5, lifeExpectancy: 92, ...over,
});

// Cases chosen to stress the tallest content on each page.
const CASES: Record<string, RetirementPlan> = {
  simple: base({}),
  couple: base({ household: "couple", people: [person({}), person({ currentAge: 53, superBalance: 250_000, salary: 70_000 })] }),
  // Staggered retirement — partners retire at different ages.
  staggered: base({ household: "couple", retirementAge: 60, targetSpending: 70_000, people: [person({ currentAge: 58 }), person({ currentAge: 58, superBalance: 250_000, salary: 80_000, retirementAge: 67 })] }),
  // Heaviest page-1 inputs (couple + mortgage + property) and page-2 budget table.
  heavy: withBudget(
    base({
      household: "couple",
      people: [person({}), person({ currentAge: 53, superBalance: 250_000, salary: 70_000 })],
      outsideSuper: 200_000, annualOutsideSavings: 8_000, mortgage, investmentProperty: property,
    }),
    true,
  ),
  // Single with a full staged budget — stresses the page-2 budget table + page-3 cards.
  budget: withBudget(base({ people: [person({ superBalance: 420_000 })] }), true),
  "budget-renter": withBudget(base({ homeowner: false }), false),
};

function MeasuredReport() {
  const params = useSearchParams();
  const key = params.get("case") ?? "heavy";
  const plan = CASES[key] ?? CASES.heavy;
  const result = simulate(plan, config);
  const mc = runMonteCarlo(plan, config);
  return <ReportView plan={plan} result={result} mc={mc} config={config} name={`measure:${key}`} generatedAt="—" />;
}

export default function ReportMeasurePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <MeasuredReport />
    </Suspense>
  );
}
