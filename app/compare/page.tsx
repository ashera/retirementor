import CompareView from "@/components/CompareView";
import VisitorActivity from "@/components/VisitorActivity";
import { getCurrentUser } from "@/lib/auth";
import { listPlans, getActivePlan } from "@/app/actions/plans";
import { getActiveConfig } from "@/lib/refdata";

export const metadata = { title: "Compare scenarios", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const user = await getCurrentUser();
  const [savedPlans, active, config] = await Promise.all([
    user ? listPlans() : Promise.resolve([]),
    user ? getActivePlan() : Promise.resolve(null),
    getActiveConfig(),
  ]);
  return (
    <>
      {!user && <VisitorActivity />}
      <CompareView config={config} savedPlans={savedPlans} activeName={active?.name ?? null} />
    </>
  );
}
