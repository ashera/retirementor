import { notFound, redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveConfig } from "@/lib/refdata";
import { simulate } from "@/lib/au/simulate";
import { runMonteCarlo } from "@/lib/au/montecarlo";
import { DEFAULT_PLAN, type RetirementPlan } from "@/lib/au/types";
import ReportView from "@/components/ReportView";

export const metadata = { title: "Retirement Plan Report — RetireMentor" };
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
    />
  );
}
