import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import FooterNav from "@/components/FooterNav";
import { listPublishedReleases } from "@/lib/releases";
import { SITE_URL } from "@/lib/site";

const title = "What’s new — RetireWiz release notes";
const description =
  "Every update we ship to RetireWiz, in plain language — new features, improvements and fixes, with dates and versions.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/releases` },
  openGraph: { title, description, url: `${SITE_URL}/releases`, type: "website" },
};
export const dynamic = "force-dynamic";

function fmtDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

export default async function ReleasesPage() {
  const releases = await listPublishedReleases();
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <div className="mb-8 flex items-center justify-between gap-3">
        <Link href="/" aria-label="RetireWiz home">
          <Logo className="h-10 w-auto" />
        </Link>
        <Link href="/" className="text-sm text-muted hover:text-white">
          ← Planner
        </Link>
      </div>

      <header className="mb-8">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">What&apos;s new</div>
        <h1 className="mt-1 text-3xl font-bold text-white">Release notes</h1>
        <p className="mt-2 text-muted">Every update we ship to RetireWiz, in plain language.</p>
      </header>

      {releases.length === 0 ? (
        <p className="rounded-2xl border border-line bg-panel p-6 text-muted">No releases published yet — check back soon.</p>
      ) : (
        <ol className="space-y-4">
          {releases.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-panel p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line pb-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold text-white">{fmtDate(r.released_at)}</span>
                  {r.title && <span className="text-sm text-slate-300">— {r.title}</span>}
                </div>
                <span className="flex items-center gap-2 text-[11px] tabular-nums text-muted">
                  <span className="rounded-full bg-panel-2 px-2 py-0.5">
                    v{r.version}
                    {r.build != null ? ` · build ${r.build}` : ""}
                  </span>
                  {r.commit_hash && <span className="font-mono">{r.commit_hash.slice(0, 7)}</span>}
                </span>
              </div>
              {r.notes.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {r.notes.map((n, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-200">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-10">
        <FooterNav />
      </div>
    </main>
  );
}
