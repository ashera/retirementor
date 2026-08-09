import { notFound, redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_PLAN, type RetirementPlan } from "@/lib/au/types";
import AssetsView from "@/components/AssetsView";

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
  return <AssetsView name={saved.name} plan={plan} />;
}
