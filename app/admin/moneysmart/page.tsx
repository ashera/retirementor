import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listSources } from "@/lib/refdata";
import { computeStaleness } from "@/lib/au/staleness";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { listMoneysmartChecks } from "@/app/actions/moneysmart";
import MoneysmartView from "@/components/MoneysmartView";

export const metadata = { title: "Backoffice — Moneysmart" };

export default async function MoneysmartPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const sources = await listSources();
  const now = new Date();
  const staleCount = sources.filter(
    (s) => computeStaleness(s.last_updated_from, s.review_interval_days, now).state === "stale",
  ).length;

  const checks = await listMoneysmartChecks();

  return (
    <MoneysmartView email={user.email} staleCount={staleCount} checks={checks} config={DEFAULT_CONFIG} />
  );
}
