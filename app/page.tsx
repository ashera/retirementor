import PlannerApp from "@/components/PlannerApp";
import { getCurrentUser } from "@/lib/auth";
import { listPlans } from "@/app/actions/plans";
import { buildReviewData, getActiveConfig } from "@/lib/refdata";

export default async function Page() {
  const user = await getCurrentUser();
  const [savedPlans, config] = await Promise.all([
    user ? listPlans() : Promise.resolve([]),
    getActiveConfig(),
  ]);
  const reviewDue = user?.is_admin ? (await buildReviewData()).dueTotal : 0;
  return (
    <PlannerApp
      user={user ? { email: user.email, isAdmin: user.is_admin } : null}
      savedPlans={savedPlans}
      config={config}
      reviewDue={reviewDue}
    />
  );
}
