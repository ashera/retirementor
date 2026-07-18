import StressTestView from "@/components/StressTestView";
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
  return <StressTestView config={config} savedPlans={savedPlans} />;
}
