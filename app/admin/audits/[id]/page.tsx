import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import AdminTabs from "@/components/AdminTabs";
import AuditDetail from "@/components/AuditDetail";
import { getAudit } from "@/lib/audits";

export const metadata = { title: "Backoffice — Audit run", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AuditRunPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const { id } = await params;
  const data = await getAudit(id);
  if (!data) notFound();

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-white">← Planner</Link>
        <span className="text-muted">{user.email} · admin</span>
      </div>

      <AdminTabs active="audits" />

      <AuditDetail audit={data.audit} findings={data.findings} />
    </main>
  );
}
