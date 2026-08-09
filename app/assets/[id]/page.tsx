import { notFound, redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveConfig } from "@/lib/refdata";
import { simulate } from "@/lib/au/simulate";
import { DEFAULT_PLAN, type RetirementPlan } from "@/lib/au/types";
import AssetsView, { type AgePoint } from "@/components/AssetsView";

export const metadata = { title: "Assets & liabilities", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AssetsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const r = await query<{ name: string; data: RetirementPlan }>(
    "select name, data from plans where id = $1 and user_id = $2",
    [id, user.id],
  );
  const saved = r.rows[0];
  if (!saved) notFound();

  const plan = { ...DEFAULT_PLAN, ...saved.data };
  const config = await getActiveConfig();
  const result = simulate(plan, config);
  const points: AgePoint[] = result.rows.map((row) => ({
    age: row.age,
    superTotal: row.totalSuper,
    savings: row.outside,
    homeValue: row.homeValue,
    homeEquity: row.homeEquity,
    propertyEquity: row.propertyEquity,
    drLoan: row.breakdown.investmentLoan ?? 0,
    working: row.phase === "accumulation",
    // Freed equity routed to OUTSIDE super this year — from a home downsize and from a
    // property sale — so the savings row can name where a jump came from.
    homeToOutside: Math.max(0, (row.breakdown.homeProceeds ?? 0) - (row.breakdown.homeProceedsToSuper ?? 0)),
    propToOutside: row.breakdown.propertyProceeds ?? 0,
  }));

  return <AssetsView name={saved.name} plan={plan} points={points} />;
}
