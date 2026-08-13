import type { ReactNode } from "react";
import Logo from "@/components/Logo";
import type { AuditRun, AuditFinding } from "@/lib/audits";

const SEV: Record<string, { label: string; chip: string; rail: string }> = {
  high: { label: "High", chip: "bg-red-500/15 text-red-400", rail: "border-l-red-500/60" },
  med: { label: "Medium", chip: "bg-amber-500/15 text-amber-400", rail: "border-l-amber-500/60" },
  low: { label: "Low", chip: "bg-slate-500/20 text-slate-300", rail: "border-l-slate-500/50" },
};

const FSTATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-panel-2 text-muted" },
  fixed: { label: "Fixed", cls: "bg-emerald-500/15 text-emerald-400" },
  accepted: { label: "Accepted", cls: "bg-sky-500/15 text-sky-300" },
};

const RUN_STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-red-500/15 text-red-400" },
  in_progress: { label: "In progress", cls: "bg-amber-500/15 text-amber-400" },
  actioned: { label: "Actioned", cls: "bg-emerald-500/15 text-emerald-400" },
};

/** Inline **bold** and `code`. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="rounded bg-panel-2 px-1 py-0.5 text-[0.85em] text-slate-200">{part.slice(1, -1)}</code>;
    return <span key={i}>{part}</span>;
  });
}

/** Minimal markdown → JSX (headings, bullets, blockquote, paragraphs). */
function renderMarkdown(md: string): ReactNode[] {
  const out: ReactNode[] = [];
  const lines = md.split("\n");
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(
        <ul key={`ul${out.length}`} className="my-2 list-disc space-y-1 pl-5 text-slate-300">
          {list.map((li, i) => <li key={i}>{inline(li)}</li>)}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*[-*]\s+/.test(line)) { list.push(line.replace(/^\s*[-*]\s+/, "")); continue; }
    flush();
    if (!line.trim()) continue;
    if (line.startsWith("### ")) out.push(<h4 key={out.length} className="mt-4 mb-1 text-sm font-semibold text-white">{inline(line.slice(4))}</h4>);
    else if (line.startsWith("## ")) out.push(<h3 key={out.length} className="mt-5 mb-1.5 text-base font-bold text-white">{inline(line.slice(3))}</h3>);
    else if (line.startsWith("# ")) out.push(<h2 key={out.length} className="mt-2 mb-2 text-lg font-bold text-white">{inline(line.slice(2))}</h2>);
    else if (line.startsWith("> ")) out.push(<blockquote key={out.length} className="my-3 border-l-2 border-accent/50 pl-3 text-sm italic text-muted">{inline(line.slice(2))}</blockquote>);
    else out.push(<p key={out.length} className="my-2 text-slate-300">{inline(line)}</p>);
  }
  flush();
  return out;
}

function fmtDate(d: string) {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

/** Branded, read-only rendering of a compliance audit report (used by the public
 *  share link). No interactivity — statuses are shown as badges. */
export default function AuditReportView({ audit, findings }: { audit: AuditRun; findings: AuditFinding[] }) {
  const resolved = findings.filter((f) => f.status !== "open").length;
  const total = findings.length;
  const pct = total ? Math.round((resolved / total) * 100) : 0;
  const runSt = RUN_STATUS[audit.status] ?? RUN_STATUS.open;
  const bySev = (sev: string) => findings.filter((f) => f.severity === sev);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
      {/* Brand header */}
      <div className="flex items-center justify-between gap-4 border-b border-line pb-5">
        <Logo className="h-10 w-auto" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Compliance audit report</span>
      </div>

      {/* Title block */}
      <header className="mt-7">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">{audit.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>{fmtDate(audit.ran_at)}</span>
          {audit.standard && <><span aria-hidden>·</span><span>{audit.standard}</span></>}
          {audit.build && <><span aria-hidden>·</span><span>build {audit.build}</span></>}
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${runSt.cls}`}>{runSt.label}</span>
        </div>
      </header>

      {/* Summary */}
      <section className="mt-6 rounded-2xl border border-line bg-panel p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-lg bg-red-500/15 px-2.5 py-1 text-sm font-semibold text-red-400">{audit.high} high</span>
          <span className="rounded-lg bg-amber-500/15 px-2.5 py-1 text-sm font-semibold text-amber-400">{audit.med} medium</span>
          <span className="rounded-lg bg-slate-500/20 px-2.5 py-1 text-sm font-semibold text-slate-300">{audit.low} low</span>
          {total > 0 && (
            <div className="ml-auto flex items-center gap-2 text-sm text-muted">
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-panel-2">
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
              <span className="tabular-nums">{resolved}/{total} resolved</span>
            </div>
          )}
        </div>
      </section>

      {/* Report prose */}
      {audit.report_md && (
        <section className="mt-8">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted">Summary report</div>
          <div className="mt-2 rounded-2xl border border-line bg-panel p-5 leading-relaxed">
            {renderMarkdown(audit.report_md)}
          </div>
        </section>
      )}

      {/* Findings */}
      {total > 0 && (
        <section className="mt-8">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted">Findings</div>
          <div className="mt-3 space-y-6">
            {(["high", "med", "low"] as const).map((sev) =>
              bySev(sev).length === 0 ? null : (
                <div key={sev}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">
                    {SEV[sev].label} · {bySev(sev).length}
                  </h3>
                  <div className="space-y-2">
                    {bySev(sev).map((f) => {
                      const st = FSTATUS[f.status] ?? FSTATUS.open;
                      return (
                        <div key={f.id} className={`rounded-xl border border-line border-l-2 bg-panel p-3.5 ${SEV[f.severity]?.rail ?? ""}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${SEV[f.severity]?.chip ?? SEV.low.chip}`}>{SEV[f.severity]?.label ?? "Low"}</span>
                            {f.category && <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">{f.category}</span>}
                            {f.ref && <code className="rounded bg-panel-2 px-1.5 py-0.5 text-[11px] text-slate-300">{f.ref}</code>}
                            <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                          </div>
                          {f.quote && <p className="mt-2 text-sm text-slate-200">&ldquo;{f.quote}&rdquo;</p>}
                          {f.suggestion && <p className="mt-1 text-xs text-muted">→ {f.suggestion}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ),
            )}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-10 border-t border-line pt-5 text-xs leading-relaxed text-muted">
        Internal compliance self-review of RetireWiz&apos;s user-facing language against ASIC Regulatory Guide 276 and
        ASIC Corporations (Superannuation Calculators and Retirement Estimates) Instrument 2022/603. It surfaces
        candidate issues for review and is <strong className="text-slate-300">not a compliance opinion or sign-off</strong>.
        Generated by RetireWiz.
      </footer>
    </div>
  );
}
