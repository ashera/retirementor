import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import StressTestView from "@/components/StressTestView";
import { query } from "@/lib/db";
import { getActiveConfig } from "@/lib/refdata";
import { DEFAULT_PLAN, type RetirementPlan } from "@/lib/au/types";

// Admin-only READ-ONLY historical stress test for a user's scenario. Mirrors the
// shared /s/<token>/stress-test route but keyed by plans.id.
export const metadata = { title: "Stress test (admin preview)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminScenarioStressTestPage({ params }: { params: Promise<{ id: string }> }) {
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
    <StressTestView
      config={config}
      savedPlans={[]}
      sharedPlan={{ plan, name: saved.name, basePath: `/admin/scenario/${id}` }}
    />
  );
}
