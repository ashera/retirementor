import { notFound, redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveConfig } from "@/lib/refdata";
import { simulate } from "@/lib/au/simulate";
import { runMonteCarlo } from "@/lib/au/montecarlo";
import { appliedStrategies } from "@/lib/au/strategies";
import { toActiveScenario } from "@/lib/au/scenario";
import { runStressTest, failsafeSpend } from "@/lib/au/stresstest";
import { DEFAULT_PLAN, getLifeEvents, type RetirementPlan } from "@/lib/au/types";
import ReportView from "@/components/ReportView";

export const metadata = { title: "Retirement plan report", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const r = await query<{ name: string; data: RetirementPlan }>(
    "select name, data from plans where id = $1 and user_id = $2",
    [id, user.id],
  );
  const saved = r.rows[0];
  if (!saved) notFound();

  const plan = { ...DEFAULT_PLAN, ...saved.data };
  const config = await getActiveConfig();
  const result = simulate(plan, config);
  const mc = runMonteCarlo(plan, config);

  // Optional extra pages: what-if strategies (with a before/after vs the base plan),
  // life events, and a historical stress test — each rendered only when relevant.
  const strategies = appliedStrategies(plan, config);
  const lifeEvents = getLifeEvents(plan);
  let baseline = null;
  if (strategies.length > 0) {
    const base = toActiveScenario(plan).base;
    const baseRes = simulate(base, config);
    const baseMc = runMonteCarlo(base, config);
    baseline = {
      superAtRetirement: baseRes.superAtRetirement,
      lastsToLifeExpectancy: baseRes.lastsToLifeExpectancy,
      depletedAge: baseRes.depletedAge,
      successPct: Math.round(baseMc.successRate * 100),
    };
  }
  const stress = runStressTest(plan, config);
  const failsafe = failsafeSpend(plan, config);

  const generatedAt = new Date().toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <ReportView
      plan={plan}
      result={result}
      mc={mc}
      config={config}
      name={saved.name}
      generatedAt={generatedAt}
      strategies={strategies}
      lifeEvents={lifeEvents}
      baseline={baseline}
      stress={stress}
      failsafe={failsafe}
    />
  );
}
