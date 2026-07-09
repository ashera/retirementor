import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listSources } from "@/lib/refdata";
import { computeStaleness } from "@/lib/au/staleness";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { evaluatePersonas } from "@/lib/au/scenarios/personas";
import ScenariosView from "@/components/ScenariosView";

export const metadata = { title: "Backoffice — Scenarios" };

export default async function ScenariosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const sources = await listSources();
  const now = new Date();
  const staleCount = sources.filter(
    (s) =>
      computeStaleness(s.last_updated_from, s.review_interval_days, now).state === "stale",
  ).length;

  // Computed against the same seed config the scenario tests assert against, so
  // this auditor view and the automated tests can never disagree.
  const reports = evaluatePersonas(DEFAULT_CONFIG);

  return (
    <ScenariosView
      email={user.email}
      reports={reports}
      staleCount={staleCount}
      financialYear={DEFAULT_CONFIG.financialYear}
      runAt={now.toISOString()}
    />
  );
}
