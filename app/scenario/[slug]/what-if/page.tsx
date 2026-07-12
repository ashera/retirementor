import { notFound } from "next/navigation";
import WhatIfView from "@/components/WhatIfView";
import { query } from "@/lib/db";
import { getActiveConfig } from "@/lib/refdata";
import { DEFAULT_PLAN, type RetirementPlan } from "@/lib/au/types";

// Public What-If sandbox for a curated demo scenario — same lookup as the demo
// dashboard, rendered read-only.
export const metadata = { title: "What if… (scenario)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DemoScenarioWhatIfPage({
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
    <WhatIfView
      config={config}
      savedPlans={[]}
      signedIn={false}
      sharedPlan={{ plan, name: scenario.title, basePath: `/scenario/${slug}` }}
    />
  );
}
