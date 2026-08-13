import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import AdminTabs from "@/components/AdminTabs";
import NewAuditForm from "@/components/NewAuditForm";
import { listAudits } from "@/lib/audits";

export const metadata = { title: "Backoffice — Compliance audits", robots: { index: false } };
export const dynamic = "force-dynamic";

const RUN_STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-red-500/15 text-red-400" },
  in_progress: { label: "In progress", cls: "bg-amber-500/15 text-amber-400" },
  actioned: { label: "Actioned", cls: "bg-emerald-500/15 text-emerald-400" },
};

function fmt(d: string) {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default async function AuditsAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/");

  const audits = await listAudits();

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-white">← Planner</Link>
        <span className="text-muted">{user.email} · admin</span>
      </div>

      <AdminTabs active="audits" />

      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold uppercase tracking-widest text-accent">Backoffice · Compliance</div>
          <h1 className="mt-1 text-2xl font-bold text-white">Audit runs</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Language reviews against ASIC RG 276 / Instrument 2022/603. Each run stores the full report and its
            findings, with a status per finding so remediation can be tracked. These are internal self-reviews,
            not a compliance sign-off.
          </p>
        </div>
        <NewAuditForm />
      </header>

      {audits.length === 0 ? (
        <p className="rounded-2xl border border-line bg-panel p-8 text-center text-muted">No audit runs yet.</p>
      ) : (
        <div className="space-y-3">
          {audits.map((a) => {
            const st = RUN_STATUS[a.status] ?? RUN_STATUS.open;
            return (
              <Link
                key={a.id}
                href={`/admin/audits/${a.id}`}
                className="block rounded-2xl border border-line bg-panel p-4 transition hover:border-accent/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
                  <div className="min-w-0">
                    <div className="font-semibold text-white">{a.title}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      {fmt(a.ran_at)}
                      {a.standard ? ` · ${a.standard}` : ""}
                      {a.build ? ` · build ${a.build}` : ""}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {a.high > 0 && <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-semibold text-red-400">{a.high} high</span>}
                  {a.med > 0 && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-400">{a.med} med</span>}
                  {a.low > 0 && <span className="rounded-full bg-slate-500/20 px-2 py-0.5 font-semibold text-slate-300">{a.low} low</span>}
                  <span className="ml-auto text-muted">
                    {a.resolved}/{a.total} findings resolved
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
