import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { publishedCaseStudies } from "@/lib/caseStudies";

const title = "Case studies — RetireWiz";
const description =
  "Worked retirement examples modelled on current Australian rules — the Age Pension, super, tax and fees — showing how the numbers really behave.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/case-studies` },
  openGraph: { title, description, url: `${SITE_URL}/case-studies`, type: "website" },
};

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default function CaseStudiesIndex() {
  const studies = publishedCaseStudies();
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <div className="mb-8 text-sm">
        <Link href="/" className="text-muted hover:text-white">← Planner</Link>
      </div>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-white sm:text-3xl">Case studies</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Worked retirement examples, modelled on current Australian rules — the means-tested Age Pension, super, tax
          and fees, all in today&apos;s dollars. Each one you can open and change the numbers yourself.
        </p>
      </header>

      <ul className="space-y-4">
        {studies.map((s) => (
          <li key={s.slug}>
            <Link
              href={`/case-studies/${s.slug}`}
              className="block rounded-xl border border-line bg-panel p-5 transition hover:border-accent"
            >
              <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                <span>{fmtDate(s.date)}</span>
                <span aria-hidden>·</span>
                <span>{s.readMinutes} min read</span>
              </div>
              <h2 className="text-lg font-semibold text-white">{s.title}</h2>
              <p className="mt-1 text-sm text-slate-300">{s.dek}</p>
              <span className="mt-3 inline-block text-sm font-medium text-accent">Read →</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
