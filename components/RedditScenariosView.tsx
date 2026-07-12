"use client";

import { useState } from "react";
import Link from "next/link";
import AdminTabs from "@/components/AdminTabs";
import { fmtCurrency } from "@/lib/au/format";

export interface AdminScenario {
  id: string;
  slug: string;
  title: string;
  blurb: string | null;
  context: string | null;
  thread_url: string | null;
  published: boolean;
  retireAge: number;
  lifeExpectancy: number;
  spend: number;
  successPct: number;
  lasts: boolean;
}

/** Copy-to-clipboard button (mirrors the Marketing view's pattern). */
function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked — no-op */
        }
      }}
      className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:text-accent"
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

export default function RedditScenariosView({
  email,
  scenarios,
  staleCount = 0,
  feedbackCount = 0,
  adviserCount = 0,
}: {
  email: string;
  scenarios: AdminScenario[];
  staleCount?: number;
  feedbackCount?: number;
  adviserCount?: number;
}) {
  // Build absolute URLs on the client so copied links carry the current origin.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const publicUrl = (slug: string) => `${origin}/scenario/${slug}`;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-white">← Planner</Link>
        <span className="text-muted">{email} · admin</span>
      </div>

      <AdminTabs active="reddit" staleCount={staleCount} feedbackCount={feedbackCount} adviserCount={adviserCount} />

      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">Marketing</div>
        <h1 className="mt-1 text-3xl font-bold text-white">Reddit scenarios</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Curated demo scenarios — reproductions of public discussions (Reddit FIRE threads and the
          like). Each is authored in code and seeded on deploy; grab its public link below and share it.
          The link opens a logged-out, read-only dashboard preloaded with the scenario.
        </p>
      </header>

      {scenarios.length === 0 ? (
        <p className="rounded-2xl border border-line bg-panel px-4 py-8 text-center text-muted">
          No demo scenarios yet. Add one to <code className="text-slate-300">lib/au/scenarios/demoScenarios.ts</code>{" "}
          and deploy — it&apos;ll seed automatically.
        </p>
      ) : (
        <div className="space-y-4">
          {scenarios.map((s) => (
            <div key={s.id} className="rounded-2xl border border-line bg-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-white">{s.title}</h2>
                    {!s.published && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-400">
                        unpublished
                      </span>
                    )}
                  </div>
                  {s.blurb && <p className="mt-1 max-w-2xl text-sm text-muted">{s.blurb}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      s.successPct >= 85
                        ? "bg-emerald-500/15 text-emerald-400"
                        : s.successPct >= 60
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-red-500/15 text-red-400"
                    }`}
                    title="Live Monte Carlo success rate under the current config"
                  >
                    {s.successPct}% likely
                  </span>
                </div>
              </div>

              {/* Key inputs at a glance */}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>Retire <span className="font-semibold text-slate-300">{s.retireAge}</span></span>
                <span>Horizon to <span className="font-semibold text-slate-300">{s.lifeExpectancy}</span></span>
                <span>Spend <span className="font-semibold text-slate-300">{fmtCurrency(s.spend)}/yr</span></span>
                <span>Money lasts: <span className="font-semibold text-slate-300">{s.lasts ? "yes" : "no"}</span></span>
              </div>

              {/* Public link */}
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2">
                <code className="min-w-0 flex-1 truncate text-xs text-accent">/scenario/{s.slug}</code>
                <CopyButton text={publicUrl(s.slug)} />
                <Link
                  href={`/scenario/${s.slug}`}
                  target="_blank"
                  className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:text-accent"
                >
                  Open ↗
                </Link>
              </div>

              {/* Admin-only context */}
              {s.context && (
                <p className="mt-3 rounded-lg border border-line bg-ink/40 px-3 py-2 text-xs leading-relaxed text-slate-300">
                  {s.context}
                </p>
              )}
              {s.thread_url && (
                <a
                  href={s.thread_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs text-accent hover:underline"
                >
                  Source thread ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
