"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminTabs from "@/components/AdminTabs";
import { verifyParam } from "@/app/actions/admin";
import { markSourceUpdated } from "@/app/actions/sources";
import type { ReviewData } from "@/lib/refdata";

export default function ReviewDigest({
  email,
  data,
}: {
  email: string;
  data: ReviewData;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>, ok: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.error) setNotice(res.error);
      else {
        setNotice(ok);
        router.refresh();
      }
    });

  const pct =
    data.paramsTotal > 0
      ? Math.round((data.verified / data.paramsTotal) * 100)
      : 0;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-white">
          ← Planner
        </Link>
        <span className="text-muted">{email} · admin</span>
      </div>

      <AdminTabs active="review" staleCount={data.staleSources.length} />

      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">
          Backoffice · Review
        </div>
        <h1 className="mt-1 text-3xl font-bold text-white">Due for review</h1>
        <p className="mt-2 text-muted">
          Everything needing attention for the active FY{data.activeFY ?? "—"}{" "}
          reference data.
        </p>
      </header>

      {notice && (
        <p className="mb-4 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
          {notice}
        </p>
      )}

      {data.dueTotal === 0 ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
          <div className="text-3xl">✅</div>
          <h2 className="mt-2 text-xl font-bold text-white">All caught up</h2>
          <p className="mt-1 text-sm text-muted">
            Every parameter is verified and no source is due for a refresh.
          </p>
        </div>
      ) : (
        <>
          {/* Verification progress */}
          <section className="mb-6 rounded-2xl border border-line bg-panel p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-white">Verification progress</h2>
              <span className="text-sm text-muted">
                {data.verified}/{data.paramsTotal} verified
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {data.flaggedCount > 0 && (
                <span className="text-amber-400">
                  {data.flaggedCount} flagged for review
                </span>
              )}
              {data.neverVerifiedCount > 0 && (
                <span className="text-slate-400">
                  {data.neverVerifiedCount} never verified
                </span>
              )}
              <Link
                href="/admin"
                className="ml-auto font-medium text-accent hover:underline"
              >
                Open parameters →
              </Link>
            </div>
          </section>

          {/* Sources to refresh */}
          {(data.staleSources.length > 0 || data.dueSources.length > 0) && (
            <section className="mb-6 rounded-2xl border border-line bg-panel p-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-white">Sources to refresh</h2>
                <Link
                  href="/admin/sources"
                  className="text-sm font-medium text-accent hover:underline"
                >
                  Manage sources →
                </Link>
              </div>
              <div className="space-y-2">
                {[...data.staleSources, ...data.dueSources].map((s) => {
                  const stale = data.staleSources.includes(s);
                  return (
                    <div
                      key={s.key}
                      className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
                        stale ? "border-red-500/30" : "border-amber-500/30"
                      }`}
                    >
                      <div>
                        <div className="font-medium text-slate-100">{s.name}</div>
                        <div className="text-xs text-muted">
                          {s.organisation} · {s.paramCount} params
                        </div>
                      </div>
                      <div
                        className={`text-xs ${stale ? "text-red-400" : "text-amber-400"}`}
                      >
                        {s.lastUpdatedFrom == null
                          ? "never refreshed"
                          : stale
                            ? `${s.overdueDays}d overdue`
                            : `due in ${Math.abs(s.overdueDays ?? 0)}d`}
                      </div>
                      <button
                        onClick={() =>
                          run(
                            () => markSourceUpdated(s.key),
                            `Marked ${s.name} refreshed.`,
                          )
                        }
                        disabled={pending}
                        className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-accent-soft disabled:opacity-60"
                      >
                        Mark refreshed
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Parameters flagged for review */}
          {data.flaggedParams.length > 0 && (
            <section className="mb-6 rounded-2xl border border-line bg-panel p-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-white">
                  Parameters flagged for review
                </h2>
                <Link
                  href="/admin"
                  className="text-sm font-medium text-accent hover:underline"
                >
                  Open parameters →
                </Link>
              </div>
              <div className="space-y-2">
                {data.flaggedParams.map((p) => (
                  <div
                    key={p.key}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 px-4 py-3"
                  >
                    <div>
                      <div className="font-medium text-slate-100">{p.label}</div>
                      <div className="text-xs text-muted">
                        {p.category} · {p.sourceName}
                      </div>
                    </div>
                    {data.versionId && (
                      <button
                        onClick={() =>
                          run(
                            () => verifyParam(data.versionId as string, p.key),
                            `Verified ${p.label}.`,
                          )
                        }
                        disabled={pending}
                        className="ml-auto rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-500/50 hover:text-emerald-400 disabled:opacity-60"
                      >
                        Verify
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {data.neverVerifiedCount > 0 && (
                <p className="mt-3 text-xs text-muted">
                  Plus {data.neverVerifiedCount} parameters never verified —
                  review them on the{" "}
                  <Link href="/admin" className="text-accent hover:underline">
                    Parameters
                  </Link>{" "}
                  page.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
