import Link from "next/link";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { kbIndex, KB_ARTICLES } from "@/lib/knowledgeBase";
import KbSearch from "@/components/KbSearch";

const title = "Learn — retirement & super concepts explained";
const description =
  "A searchable knowledge base for the key ideas behind the RetireWiz planner — the Age Pension and means testing, safe withdrawal rates, flexible spending, Monte Carlo, sequence risk and more, each with worked examples.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/learn` },
  openGraph: { title, description, url: `${SITE_URL}/learn`, type: "website" },
};

// Lightweight ItemList JSON-LD so the concept library is discoverable.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "RetireWiz knowledge base",
  itemListElement: KB_ARTICLES.map((a, i) => ({
    "@type": "ListItem",
    position: i + 1,
    url: `${SITE_URL}/learn/${a.slug}`,
    name: a.title,
  })),
};

export default function LearnIndex() {
  const index = kbIndex();
  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Link href="/" className="text-sm font-medium text-muted hover:text-white">← Back to the planner</Link>

      <header className="mt-6">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">Knowledge base</p>
        <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Learn the concepts</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Plain-English explainers for the ideas behind the numbers — how the Age Pension is calculated,
          what a safe withdrawal rate is, how Monte Carlo and the stress test work, and more. Search a
          keyword or browse by topic. Each concept links to a live example you can open and change.
        </p>
      </header>

      <div className="mt-8">
        <KbSearch index={index} />
      </div>

      <div className="mt-12 rounded-2xl border border-accent/30 bg-accent/10 p-6 text-center">
        <h2 className="text-xl font-bold text-white">Prefer quick answers?</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300">
          The <Link href="/faq" className="text-accent hover:underline">FAQ</Link> covers common questions in
          a sentence or two. Or jump straight into the <Link href="/" className="text-accent hover:underline">free planner</Link>{" "}
          to see your own numbers.
        </p>
      </div>
    </main>
  );
}
