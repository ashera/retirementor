import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import TimelineView from "@/components/TimelineView";
import { query } from "@/lib/db";
import { getActiveConfig } from "@/lib/refdata";
import { DEFAULT_PLAN, type RetirementPlan } from "@/lib/au/types";

// Admin-only READ-ONLY retirement story for a user's scenario. Mirrors the shared
// /s/<token>/timeline route but keyed by plans.id.
export const metadata = { title: "Retirement timeline (admin preview)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminScenarioTimelinePage({ params }: { params: Promise<{ id: string }> }) {
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
    <TimelineView
      config={config}
      savedPlans={[]}
      sharedPlan={{ plan, name: saved.name, basePath: `/admin/scenario/${id}` }}
    />
  );
}
