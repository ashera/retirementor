import WhatIfView from "@/components/WhatIfView";
import VisitorPing from "@/components/VisitorPing";
import VisitorActivity from "@/components/VisitorActivity";
import { getCurrentUser } from "@/lib/auth";
import { listPlans } from "@/app/actions/plans";
import { getActiveConfig } from "@/lib/refdata";

export const metadata = { title: "What if…", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function WhatIfPage() {
  const user = await getCurrentUser();
  const [savedPlans, config] = await Promise.all([
    user ? listPlans() : Promise.resolve([]),
    getActiveConfig(),
  ]);
  return (
    <>
      {!user && <VisitorPing event="whatif" />}
      {!user && <VisitorActivity />}
      <WhatIfView config={config} savedPlans={savedPlans} signedIn={!!user} />
    </>
  );
}
