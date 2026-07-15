import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveConfig, listSources } from "@/lib/refdata";
import { computeStaleness } from "@/lib/au/staleness";
import { listFeedback } from "@/lib/adminFeedback";
import { listAdviserLeads } from "@/app/actions/advisers";
import { runMonteCarlo } from "@/lib/au/montecarlo";
import { historicalStats, historicalSeries } from "@/lib/au/historicalReturns";
import { DEFAULT_PLAN, type RetirementPlan } from "@/lib/au/types";
import ReturnModelView from "@/components/ReturnModelView";

export const metadata = { title: "Backoffice — Return model", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ReturnModelAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const [config, sources, feedback, leads] = await Promise.all([
    getActiveConfig(),
    listSources(),
    listFeedback(),
    listAdviserLeads(),
  ]);

  // A representative all-equity early-retiree plan, so the admin can see how the
  // two models diverge on the same inputs before flipping the switch site-wide.
  const sample: RetirementPlan = {
    ...DEFAULT_PLAN, household: "single", superMode: "individual",
    people: [{ ...DEFAULT_PLAN.people[0], currentAge: 45, superBalance: 0, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
    homeowner: true, outsideSuper: 1_500_000, annualOutsideSavings: 0,
    retirementAge: 45, spendingMode: "flat", targetSpending: 60_000,
    investmentReturn: 7, returnVolatility: 11, inflation: 2.5, lifeExpectancy: 90,
  };
  const mc = { iterations: 400, seed: 0x9e3779b9 } as const;
  const preview = [45_000, 60_000, 75_000].map((spend) => {
    const p = { ...sample, targetSpending: spend };
    return {
      spend,
      gaussian: Math.round(runMonteCarlo(p, config, { ...mc, model: "gaussian" }).successRate * 100),
      bootstrap: Math.round(runMonteCarlo(p, config, { ...mc, model: "bootstrap", blockYears: config.bootstrapBlockYears ?? 10 }).successRate * 100),
    };
  });

  const now = new Date();
  const staleCount = sources.filter(
    (s) => computeStaleness(s.last_updated_from, s.review_interval_days, now).state === "stale",
  ).length;

  return (
    <ReturnModelView
      model={config.returnModel ?? "gaussian"}
      blockYears={config.bootstrapBlockYears ?? 10}
      cgtRegime={config.outsideTax.cgtRegime}
      stats={historicalStats()}
      series={historicalSeries()}
      preview={preview}
      sampleOutside={sample.outsideSuper}
      staleCount={staleCount}
      feedbackCount={feedback.filter((f) => !f.handled).length}
      adviserCount={leads.length}
    />
  );
}
