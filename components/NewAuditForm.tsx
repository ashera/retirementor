"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAudit } from "@/app/actions/audits";

/** Backoffice form to record a new compliance audit run + its findings. */
export default function NewAuditForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    title: "",
    standard: "ASIC RG 276 / Instrument 2022/603",
    build: "",
    status: "open",
    report_md: "",
    findingsText: "",
  });

  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    setErr(null);
    if (!f.title.trim()) {
      setErr("Title is required.");
      return;
    }
    setBusy(true);
    const res = await createAudit(f);
    setBusy(false);
    if (res.error) {
      setErr(res.error);
      return;
    }
    setOpen(false);
    setF((s) => ({ ...s, title: "", build: "", report_md: "", findingsText: "" }));
    if (res.id) router.push(`/admin/audits/${res.id}`);
    else router.refresh();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm font-semibold text-accent transition hover:bg-accent/20"
      >
        ＋ New audit run
      </button>
    );
  }

  const input = "w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-white outline-none focus:border-accent";
  const label = "block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1";

  return (
    <div className="w-full rounded-2xl border border-line bg-panel p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-white">New audit run</h2>
        <button onClick={() => setOpen(false)} className="text-sm text-muted hover:text-white">✕ Cancel</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label}>Title</label>
          <input className={input} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="ASIC RG 276 language review — Aug 2026" />
        </div>
        <div>
          <label className={label}>Standard</label>
          <input className={input} value={f.standard} onChange={(e) => set("standard", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Build / version</label>
            <input className={input} value={f.build} onChange={(e) => set("build", e.target.value)} placeholder="1.0.6xx" />
          </div>
          <div>
            <label className={label}>Status</label>
            <select className={input} value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="actioned">Actioned</option>
            </select>
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Report (markdown)</label>
          <textarea className={`${input} h-40 font-mono text-xs`} value={f.report_md} onChange={(e) => set("report_md", e.target.value)} placeholder="# Audit report…" />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Findings — one per line: severity | ref | category | quote | suggestion</label>
          <textarea
            className={`${input} h-40 font-mono text-xs`}
            value={f.findingsText}
            onChange={(e) => set("findingsText", e.target.value)}
            placeholder="high | GuidedIntro.tsx:181 | advice | You're ahead of the pack | Neutral comparison"
          />
        </div>
      </div>
      {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:text-white">Cancel</button>
        <button onClick={submit} disabled={busy} className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-60">
          {busy ? "Saving…" : "Save audit"}
        </button>
      </div>
    </div>
  );
}
