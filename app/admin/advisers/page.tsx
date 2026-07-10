import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listSources } from "@/lib/refdata";
import { computeStaleness } from "@/lib/au/staleness";
import { listAdviserLeads } from "@/app/actions/advisers";
import AdvisersView from "@/components/AdvisersView";

export const metadata = { title: "Backoffice — Advisers", robots: { index: false } };

export default async function AdvisersAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const [leads, sources] = await Promise.all([listAdviserLeads(), listSources()]);
  const now = new Date();
  const staleCount = sources.filter(
    (s) => computeStaleness(s.last_updated_from, s.review_interval_days, now).state === "stale",
  ).length;

  return <AdvisersView email={user.email} leads={leads} staleCount={staleCount} />;
}
