import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import WhatIfView from "@/components/WhatIfView";
import { query } from "@/lib/db";
import { getActiveConfig } from "@/lib/refdata";
import { DEFAULT_PLAN, type RetirementPlan } from "@/lib/au/types";

// Admin-only READ-ONLY What-If sandbox for a user's scenario (signedIn=false → never
// persisted). Mirrors the shared /s/<token>/what-if route but keyed by plans.id.
export const metadata = { title: "What if… (admin preview)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminScenarioWhatIfPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (!admin.is_admin) redirect("/");

  const { id } = await params;
  let saved: { name: string; data: RetirementPlan } | undefined;
  try {
    const r = await query<{ name: string; data: RetirementPlan }>("select name, data from plans where id = $1", [id]);
    saved = r.rows[0];
  } catch {
    saved = undefined;
  }
  if (!saved) notFound();

  const plan = { ...DEFAULT_PLAN, ...saved.data };
  const config = await getActiveConfig();

  return (
    <WhatIfView
      config={config}
      savedPlans={[]}
      signedIn={false}
      sharedPlan={{ plan, name: saved.name, basePath: `/admin/scenario/${id}` }}
    />
  );
}
