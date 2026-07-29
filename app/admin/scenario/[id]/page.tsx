import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import PlannerApp from "@/components/PlannerApp";
import { query } from "@/lib/db";
import { getActiveConfig } from "@/lib/refdata";
import { DEFAULT_PLAN, type RetirementPlan } from "@/lib/au/types";

// Admin-only READ-ONLY preview of any user's scenario (support / inspection). It
// renders into the same logged-out shared dashboard (user=null), so viewing or
// exploring a user's plan can never write to the admin's own working plan or active
// scenario. `id` is a plans.id. Never indexed.
export const metadata = { title: "Scenario preview (admin)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (!admin.is_admin) redirect("/");

  const { id } = await params;
  let saved: { name: string; data: RetirementPlan } | undefined;
  try {
    const r = await query<{ name: string; data: RetirementPlan }>("select name, data from plans where id = $1", [id]);
    saved = r.rows[0];
  } catch {
    saved = undefined; // malformed id (not a uuid) → treat as not found
  }
  if (!saved) notFound();

  const plan = { ...DEFAULT_PLAN, ...saved.data };
  const config = await getActiveConfig();

  return (
    <PlannerApp
      user={null}
      savedPlans={[]}
      active={null}
      config={config}
      sharedPlan={{ plan, name: saved.name, basePath: `/admin/scenario/${id}` }}
    />
  );
}
