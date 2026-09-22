import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import PlannerApp from "@/components/PlannerApp";
import { getFeedbackScenario } from "@/lib/feedbackScenario";
import { getActiveConfig } from "@/lib/refdata";
import { DEFAULT_PLAN } from "@/lib/au/types";

// Admin-only READ-ONLY view of the scenario captured with a feedback note — so the
// team can open exactly what the submitter (even a guest) was looking at. Renders
// into the logged-out shared dashboard (user=null) so it can't touch anyone's plan.
export const metadata = { title: "Feedback scenario (admin)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function FeedbackScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (!admin.is_admin) redirect("/");

  const { id } = await params;
  const sc = await getFeedbackScenario(id);
  if (!sc) notFound();

  const plan = { ...DEFAULT_PLAN, ...sc.plan };
  const config = await getActiveConfig();

  return (
    <PlannerApp
      user={null}
      savedPlans={[]}
      active={null}
      config={config}
      sharedPlan={{ plan, name: sc.name, basePath: `/admin/feedback/${id}/scenario` }}
    />
  );
}
