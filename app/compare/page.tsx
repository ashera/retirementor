import CompareView from "@/components/CompareView";
import { getCurrentUser } from "@/lib/auth";
import { listPlans } from "@/app/actions/plans";
import { getActiveConfig } from "@/lib/refdata";

export const metadata = { title: "Compare scenarios", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const user = await getCurrentUser();
  const [savedPlans, config] = await Promise.all([
    user ? listPlans() : Promise.resolve([]),
    getActiveConfig(),
  ]);
  return <CompareView config={config} savedPlans={savedPlans} />;
}
