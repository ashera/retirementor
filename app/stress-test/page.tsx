import StressTestView from "@/components/StressTestView";
import VisitorPing from "@/components/VisitorPing";
import VisitorActivity from "@/components/VisitorActivity";
import { getCurrentUser } from "@/lib/auth";
import { listPlans } from "@/app/actions/plans";
import { getActiveConfig } from "@/lib/refdata";

export const metadata = { title: "Historical stress test", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function StressTestPage() {
  const user = await getCurrentUser();
  const [savedPlans, config] = await Promise.all([
    user ? listPlans() : Promise.resolve([]),
    getActiveConfig(),
  ]);
  return (
    <>
      {!user && <VisitorPing event="stress" />}
      {!user && <VisitorActivity />}
      <StressTestView config={config} savedPlans={savedPlans} />
    </>
  );
}
