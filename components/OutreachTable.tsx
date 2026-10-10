"use client";

import { useMemo, useState, useTransition } from "react";
import { fmtDateTime } from "@/lib/au/format";
import type { OutreachRow } from "@/lib/adminOutreach";
import { setOutreachStatus, deleteOutreach } from "@/app/actions/outreach";

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "To action", cls: "bg-amber-500/15 text-amber-300" },
  commented: { label: "Commented", cls: "bg-emerald-500/15 text-emerald-300" },
  skipped: { label: "Skipped", cls: "bg-slate-500/15 text-slate-300" },
};

type Filter = "all" | "new" | "commented" | "skipped";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="rounded-md border border-line px-2 py-1 text-xs font-medium text-slate-200 transition hover:border-accent/50 hover:text-white"
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

export default function OutreachTable({ items }: { items: OutreachRow[] }) {
  const [filter, setFilter] = useState<Filter>("new");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [, start] = useTransition();

  const counts = useMemo(
    () => ({
      all: items.length,
      new: items.filter((o) => o.status === "new").length,
      commented: items.filter((o) => o.status === "commented").length,
      skipped: items.filter((o) => o.status === "skipped").length,
    }),
    [items],
  );
  const filtered = filter === "all" ? items : items.filter((o) => o.status === filter);

  const toggle = (id: string) =>
    setOpen((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const TABS: { key: Filter; label: string }[] = [
    { key: "new", label: `To action (${counts.new})` },
    { key: "commented", label: `Commented (${counts.commented})` },
    { key: "skipped", label: `Skipped (${counts.skipped})` },
    { key: "all", label: `All (${counts.all})` },
  ];

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-panel p-6 text-sm text-muted">
        No leads yet. Run <code className="rounded bg-ink/40 px-1">railway run npm run reddit:match -- --article=super-on-track --save</code> to populate.
      </p>
    );
  }

  return (
    <>
      <div className="mb-4 flex gap-1 rounded-lg border border-line bg-panel-2 p-1 text-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={`rounded-md px-3 py-1.5 font-medium transition ${filter === t.key ? "bg-accent text-ink" : "text-muted hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((o) => {
          const st = STATUS[o.status] ?? STATUS.new;
          const isOpen = open.has(o.id);
          return (
            <div key={o.id} className="rounded-2xl border border-line bg-panel p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${st.cls}`}>{st.label}</span>
                {o.subreddit && <span>r/{o.subreddit}</span>}
                <span>· {fmtDateTime(o.created_at)}</span>
                {o.fit_score > 0 && <span>· fit {o.fit_score}</span>}
                <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[11px] text-slate-300">{o.article_slug}</span>
                {o.commented_at && <span className="text-emerald-400">· commented {fmtDateTime(o.commented_at)}</span>}
              </div>

              <a
                href={o.reddit_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 block font-semibold text-white hover:text-accent"
              >
                {o.reddit_title || o.reddit_url} <span aria-hidden className="text-muted">↗</span>
              </a>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => toggle(o.id)} className="rounded-md border border-line px-2 py-1 text-xs font-medium text-slate-200 transition hover:border-accent/50 hover:text-white">
                  {isOpen ? "Hide draft" : "Draft & link"}
                </button>
                {o.prefilled_url && (
                  <a href={o.prefilled_url} target="_blank" rel="noopener noreferrer" className="rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-xs font-medium text-accent transition hover:bg-accent/20">
                    Open prefilled page ↗
                  </a>
                )}
                <span className="ml-auto flex gap-1">
                  {(["new", "commented", "skipped"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => start(() => void setOutreachStatus(o.id, s))}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                        o.status === s ? `${(STATUS[s] ?? STATUS.new).cls}` : "border border-line text-muted hover:text-white"
                      }`}
                    >
                      {STATUS[s].label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { if (confirm("Delete this lead?")) start(() => void deleteOutreach(o.id)); }}
                    className="rounded-md px-2 py-1 text-xs font-medium text-muted transition hover:text-red-400"
                    title="Delete"
                  >
                    ✕
                  </button>
                </span>
              </div>

              {isOpen && (
                <div className="mt-3 space-y-3 border-t border-line pt-3">
                  {o.suggested_response && (
                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Suggested response (personalise before posting)</span>
                        <CopyButton text={o.suggested_response} />
                      </div>
                      <pre className="whitespace-pre-wrap rounded-lg border border-line bg-panel-2 p-3 text-[13px] leading-relaxed text-slate-200">{o.suggested_response}</pre>
                    </div>
                  )}
                  {o.prefilled_url && (
                    <div className="flex items-center justify-between gap-2">
                      <a href={o.prefilled_url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-[13px] text-accent hover:underline">{o.prefilled_url}</a>
                      <CopyButton text={o.prefilled_url} label="Copy link" />
                    </div>
                  )}
                  {o.parsed && Object.keys(o.parsed).length > 0 && (
                    <div className="text-[11px] text-muted">
                      Parsed from the post: {Object.entries(o.parsed).map(([k, v]) => `${k}=${v}`).join(" · ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <p className="rounded-2xl border border-line bg-panel p-6 text-sm text-muted">Nothing in this view.</p>}
      </div>
    </>
  );
}
