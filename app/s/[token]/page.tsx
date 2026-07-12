import { notFound } from "next/navigation";
import PlannerApp from "@/components/PlannerApp";
import { query } from "@/lib/db";
import { getActiveConfig } from "@/lib/refdata";
import { DEFAULT_PLAN, type RetirementPlan } from "@/lib/au/types";

// A public, read-only share link. No login: the scenario is looked up by its
// capability token and rendered into a logged-out dashboard preloaded with it.
export const metadata = { title: "Shared retirement scenario", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SharedScenarioPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const r = await query<{ name: string; data: RetirementPlan }>(
    "select name, data from plans where share_token = $1",
    [token],
  );
  const saved = r.rows[0];
  if (!saved) notFound();

  const plan = { ...DEFAULT_PLAN, ...saved.data };
  const config = await getActiveConfig();

  return (
    <PlannerApp
      user={null}
      savedPlans={[]}
      draft={null}
      config={config}
      sharedPlan={{ plan, name: saved.name, basePath: `/s/${token}` }}
    />
  );
}
