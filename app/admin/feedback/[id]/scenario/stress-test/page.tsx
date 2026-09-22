import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import StressTestView from "@/components/StressTestView";
import { getFeedbackScenario } from "@/lib/feedbackScenario";
import { getActiveConfig } from "@/lib/refdata";
import { DEFAULT_PLAN } from "@/lib/au/types";

// Admin-only READ-ONLY historical stress test for a feedback scenario.
export const metadata = { title: "Feedback scenario — Stress test (admin)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function FeedbackScenarioStressTestPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (!admin.is_admin) redirect("/");

  const { id } = await params;
  const sc = await getFeedbackScenario(id);
  if (!sc) notFound();

  const plan = { ...DEFAULT_PLAN, ...sc.plan };
  const config = await getActiveConfig();

  return (
    <StressTestView
      config={config}
      savedPlans={[]}
      sharedPlan={{ plan, name: sc.name, basePath: `/admin/feedback/${id}/scenario` }}
    />
  );
}
