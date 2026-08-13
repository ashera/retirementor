"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AuditRun, AuditFinding } from "@/lib/audits";
import { setFindingStatus, setAuditStatus, deleteAudit } from "@/app/actions/audits";

const SEV: Record<string, { label: string; cls: string }> = {
  high: { label: "HIGH", cls: "bg-red-500/15 text-red-400" },
  med: { label: "MED", cls: "bg-amber-500/15 text-amber-400" },
  low: { label: "LOW", cls: "bg-slate-500/20 text-slate-300" },
};

const FSTATUS: { key: string; label: string; cls: string }[] = [
  { key: "open", label: "Open", cls: "border-line text-muted" },
  { key: "fixed", label: "Fixed", cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-400" },
  { key: "accepted", label: "Accepted", cls: "border-sky-500/40 bg-sky-500/15 text-sky-300" },
];

export default function AuditDetail({ audit, findings: initial }: { audit: AuditRun; findings: AuditFinding[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"findings" | "report">("findings");
  const [findings, setFindings] = useState(initial);
  const [runStatus, setRunStatus] = useState(audit.status);
  const [, startTransition] = useTransition();

  const resolved = findings.filter((f) => f.status !== "open").length;
  const total = findings.length;

  const grouped = useMemo(() => {
    const g: Record<string, AuditFinding[]> = { high: [], med: [], low: [] };
    for (const f of findings) (g[f.severity] ?? g.low).push(f);
    return g;
  }, [findings]);

  const cycleStatus = (f: AuditFinding, status: string) => {
    setFindings((prev) => prev.map((x) => (x.id === f.id ? { ...x, status } : x)));
    startTransition(async () => {
      const res = await setFindingStatus(f.id, status);
      if (res.error) router.refresh(); // revert to server truth on failure
    });
  };

  const changeRunStatus = (status: string) => {
    setRunStatus(status);
    startTransition(() => void setAuditStatus(audit.id, status));
  };

  const remove = () => {
    if (!window.confirm(`Delete “${audit.title}” and all its findings?`)) return;
    startTransition(async () => {
      await deleteAudit(audit.id);
      router.push("/admin/audits");
    });
  };

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-white">{audit.title}</h1>
        <div className="mt-1 text-sm text-muted">
          {new Date(audit.ran_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
          {audit.standard ? ` · ${audit.standard}` : ""}
          {audit.build ? ` · build ${audit.build}` : ""}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            Run status
            <select
              value={runStatus}
              onChange={(e) => changeRunStatus(e.target.value)}
              className="rounded-lg border border-line bg-panel-2 px-2 py-1 text-sm text-white outline-none focus:border-accent"
            >
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="actioned">Actioned</option>
            </select>
          </label>
          {total > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-panel-2">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((resolved / total) * 100)}%` }} />
              </div>
              {resolved}/{total} resolved
            </div>
          )}
          <button onClick={remove} className="ml-auto rounded-lg border border-line px-3 py-1 text-sm text-muted transition hover:border-red-400/50 hover:text-red-400">
            ✕ Delete
          </button>
        </div>
      </header>

      <div className="mb-4 flex gap-1 rounded-lg border border-line bg-panel-2 p-1 text-sm w-fit">
        {(["findings", "report"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1 font-medium transition ${tab === t ? "bg-accent text-ink" : "text-muted hover:text-white"}`}
          >
            {t === "findings" ? `Findings (${total})` : "Full report"}
          </button>
        ))}
      </div>

      {tab === "findings" ? (
        total === 0 ? (
          <p className="rounded-2xl border border-line bg-panel p-8 text-center text-muted">No findings recorded.</p>
        ) : (
          <div className="space-y-5">
            {(["high", "med", "low"] as const).map((sev) =>
              grouped[sev].length === 0 ? null : (
                <section key={sev}>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">
                    {SEV[sev].label} · {grouped[sev].length}
                  </h2>
                  <div className="space-y-2">
                    {grouped[sev].map((f) => (
                      <div key={f.id} className={`rounded-xl border border-line bg-panel p-3 ${f.status !== "open" ? "opacity-70" : ""}`}>
                        <div className="flex flex-wrap items-start gap-2">
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${SEV[f.severity]?.cls ?? SEV.low.cls}`}>
                            {SEV[f.severity]?.label ?? "LOW"}
                          </span>
                          {f.category && <span className="shrink-0 rounded bg-panel-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">{f.category}</span>}
                          {f.ref && <code className="shrink-0 rounded bg-panel-2 px-1.5 py-0.5 text-[11px] text-slate-300">{f.ref}</code>}
                          <div className="ml-auto flex gap-1">
                            {FSTATUS.map((s) => (
                              <button
                                key={s.key}
                                onClick={() => cycleStatus(f, s.key)}
                                className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition ${f.status === s.key ? s.cls : "border-line text-muted hover:text-white"}`}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        {f.quote && <p className="mt-2 text-sm text-slate-200">“{f.quote}”</p>}
                        {f.suggestion && <p className="mt-1 text-xs text-muted">→ {f.suggestion}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              ),
            )}
          </div>
        )
      ) : (
        <div className="rounded-2xl border border-line bg-panel p-5">
          {audit.report_md ? (
            <pre className="overflow-x-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-200">{audit.report_md}</pre>
          ) : (
            <p className="text-muted">No report stored for this run.</p>
          )}
        </div>
      )}

      <div className="mt-6 text-xs text-muted">
        <Link href="/admin/audits" className="hover:text-white">← All audit runs</Link>
      </div>
    </div>
  );
}
