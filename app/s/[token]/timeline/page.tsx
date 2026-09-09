import { notFound } from "next/navigation";
import TimelineView from "@/components/TimelineView";
import { query } from "@/lib/db";
import { getActiveConfig } from "@/lib/refdata";
import { DEFAULT_PLAN, type RetirementPlan } from "@/lib/au/types";

// Public read-only retirement story for a shared scenario. No login: the base plan
// is looked up by the same capability token as the shared dashboard.
export const metadata = { title: "Retirement timeline (shared scenario)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SharedTimelinePage({
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
    <TimelineView
      config={config}
      savedPlans={[]}
      sharedPlan={{ plan, name: saved.name, basePath: `/s/${token}` }}
    />
  );
}
