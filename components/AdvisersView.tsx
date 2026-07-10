"use client";

import { useState } from "react";
import Link from "next/link";
import AdminTabs from "@/components/AdminTabs";
import { deleteAdviserLead, type AdviserLead } from "@/app/actions/advisers";

function tally(leads: AdviserLead[], key: keyof AdviserLead): [string, number][] {
  const m = new Map<string, number>();
  for (const l of leads) {
    const v = (l[key] as string | null) || "—";
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export default function AdvisersView({ email, leads: initial, staleCount }: { email: string; leads: AdviserLead[]; staleCount: number }) {
  const [leads, setLeads] = useState(initial);

  const remove = async (id: string) => {
    if (!confirm("Delete this signup?")) return;
    const res = await deleteAdviserLead(id);
    if (!res.error) setLeads((ls) => ls.filter((l) => l.id !== id));
  };

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-white">← Planner</Link>
        <span className="text-muted">{email} · admin</span>
      </div>

      <AdminTabs active="advisers" staleCount={staleCount} adviserCount={leads.length} />

      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">Backoffice · Advisers</div>
        <h1 className="mt-1 text-3xl font-bold text-white">Adviser waitlist</h1>
        <p className="mt-2 max-w-3xl text-muted">
          Early-access signups from <Link href="/for-advisers" className="text-accent hover:underline">/for-advisers</Link> —
          demand validation for a B2B (client-facing) offering. Watch the volume and the &ldquo;would pay&rdquo; mix.
        </p>
      </header>

      {leads.length === 0 ? (
        <div className="rounded-2xl border border-line bg-panel-2 p-8 text-center text-muted">No signups yet.</div>
      ) : (
        <>
          {/* Signal summary */}
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            {([["role", "By role"], ["practice_size", "By practice size"], ["would_pay", "Would pay / seat"]] as const).map(
              ([key, label]) => (
                <div key={key} className="rounded-2xl border border-line bg-panel px-4 py-3">
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
                  {tally(leads, key).map(([v, n]) => (
                    <div key={v} className="flex justify-between py-0.5 text-sm">
                      <span className="text-slate-300">{v}</span>
                      <span className="tabular-nums text-white">{n}</span>
                    </div>
                  ))}
                </div>
              ),
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-panel-2 text-xs uppercase tracking-wide text-muted">
                <tr>
                  {["Email", "Name", "Firm", "Role", "Size", "Would pay", "When", ""].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((l, i) => (
                  <tr key={l.id} className={i % 2 ? "bg-panel" : "bg-panel-2/40"}>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-white">{l.email}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-300">{l.name ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-300">{l.firm ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-300">{l.role ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-300">{l.practice_size ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-300">{l.would_pay ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">{new Date(l.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => remove(l.id)} className="rounded px-1.5 text-muted transition hover:text-red-400" aria-label="Delete">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Any free-text notes */}
          {leads.some((l) => l.message) && (
            <div className="mt-6 space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Notes</h2>
              {leads.filter((l) => l.message).map((l) => (
                <div key={l.id} className="rounded-xl border border-line bg-panel px-4 py-3 text-sm">
                  <span className="text-slate-200">{l.message}</span>
                  <span className="ml-2 text-xs text-muted">— {l.email}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
