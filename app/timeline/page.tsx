import TimelineView from "@/components/TimelineView";
import { getCurrentUser } from "@/lib/auth";
import { listPlans } from "@/app/actions/plans";
import { getActiveConfig } from "@/lib/refdata";

export const metadata = { title: "Your retirement timeline", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const user = await getCurrentUser();
  const [savedPlans, config] = await Promise.all([
    user ? listPlans() : Promise.resolve([]),
    getActiveConfig(),
  ]);
  return <TimelineView config={config} savedPlans={savedPlans} />;
}
