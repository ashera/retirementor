import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listSources } from "@/lib/refdata";
import { computeStaleness } from "@/lib/au/staleness";
import { listFeedback } from "@/lib/adminFeedback";
import { listAdviserLeads } from "@/app/actions/advisers";
import { listMarketingAssets } from "@/app/actions/marketing";
import MarketingView from "@/components/MarketingView";

export const metadata = { title: "Backoffice — Marketing", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MarketingAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const [assets, sources, feedback, leads] = await Promise.all([
    listMarketingAssets(),
    listSources(),
    listFeedback(),
    listAdviserLeads(),
  ]);
  const now = new Date();
  const staleCount = sources.filter(
    (s) => computeStaleness(s.last_updated_from, s.review_interval_days, now).state === "stale",
  ).length;

  return (
    <MarketingView
      email={user.email}
      assets={assets}
      staleCount={staleCount}
      feedbackCount={feedback.filter((f) => !f.handled).length}
      adviserCount={leads.length}
    />
  );
}
