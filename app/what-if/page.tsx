import WhatIfView from "@/components/WhatIfView";
import VisitorPing from "@/components/VisitorPing";
import VisitorActivity from "@/components/VisitorActivity";
import { getCurrentUser } from "@/lib/auth";
import { listPlans, ensureActiveScenario } from "@/app/actions/plans";
import { getActiveConfig } from "@/lib/refdata";

export const metadata = { title: "What if…", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function WhatIfPage() {
  const user = await getCurrentUser();
  const [active, config] = await Promise.all([
    user ? ensureActiveScenario() : Promise.resolve(null),
    getActiveConfig(),
  ]);
  const savedPlans = user ? await listPlans() : [];
  return (
    <>
      {!user && <VisitorPing event="whatif" />}
      {!user && <VisitorActivity />}
      <WhatIfView config={config} savedPlans={savedPlans} active={active} signedIn={!!user} />
    </>
  );
}
