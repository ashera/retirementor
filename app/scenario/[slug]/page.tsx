import { notFound } from "next/navigation";
import PlannerApp from "@/components/PlannerApp";
import { query } from "@/lib/db";
import { getActiveConfig } from "@/lib/refdata";
import { DEFAULT_PLAN, type RetirementPlan } from "@/lib/au/types";

// A curated, public demo scenario (e.g. a Reddit reproduction), rendered into the
// same logged-out read-only dashboard as a share link. No auth, noindex.
export const metadata = { title: "Retirement scenario", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DemoScenarioPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const r = await query<{ title: string; data: RetirementPlan }>(
    "select title, data from demo_scenarios where slug = $1 and published = true",
    [slug],
  );
  const scenario = r.rows[0];
  if (!scenario) notFound();

  const plan = { ...DEFAULT_PLAN, ...scenario.data };
  const config = await getActiveConfig();

  return (
    <PlannerApp
      user={null}
      savedPlans={[]}
      draft={null}
      config={config}
      sharedPlan={{ plan, name: scenario.title, basePath: `/scenario/${slug}` }}
    />
  );
}
