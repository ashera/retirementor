import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveConfig, listSources } from "@/lib/refdata";
import { computeStaleness } from "@/lib/au/staleness";
import { listFeedback } from "@/lib/adminFeedback";
import { listAdviserLeads } from "@/app/actions/advisers";
import { listDemoScenarios } from "@/app/actions/demoScenarios";
import { simulate } from "@/lib/au/simulate";
import { runMonteCarlo } from "@/lib/au/montecarlo";
import { DEFAULT_PLAN } from "@/lib/au/types";
import RedditScenariosView from "@/components/RedditScenariosView";

export const metadata = { title: "Backoffice — Scenarios", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function RedditScenariosAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const [scenarios, config, sources, feedback, leads] = await Promise.all([
    listDemoScenarios(),
    getActiveConfig(),
    listSources(),
    listFeedback(),
    listAdviserLeads(),
  ]);

  // Compute each scenario's live headline (success rate + does it last) so the
  // admin can eyeball that a seeded scenario still behaves as intended.
  const rows = scenarios.map((s) => {
    const plan = { ...DEFAULT_PLAN, ...s.data };
    const successPct = Math.round(runMonteCarlo(plan, config).successRate * 100);
    const lasts = simulate(plan, config).lastsToLifeExpectancy;
    const spend = plan.spendingMode === "stages" ? plan.spendingStages.goGo : plan.targetSpending;
    return {
      id: s.id,
      slug: s.slug,
      title: s.title,
      blurb: s.blurb,
      context: s.context,
      thread_url: s.thread_url,
      published: s.published,
      retireAge: plan.retirementAge,
      lifeExpectancy: plan.lifeExpectancy,
      spend,
      successPct,
      lasts,
    };
  });

  const now = new Date();
  const staleCount = sources.filter(
    (s) => computeStaleness(s.last_updated_from, s.review_interval_days, now).state === "stale",
  ).length;

  return (
    <RedditScenariosView
      email={user.email}
      scenarios={rows}
      staleCount={staleCount}
      feedbackCount={feedback.filter((f) => !f.handled).length}
      adviserCount={leads.length}
    />
  );
}
