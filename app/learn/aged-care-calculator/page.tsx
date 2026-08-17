import Link from "next/link";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/seo";
import AgedCareCalculator from "@/components/AgedCareCalculator";

const title = "Aged care cost calculator — Australia (2026)";
const description =
  "Estimate the cost of Australian aged care — the basic daily fee, means-tested hotelling and care contribution, the RAD/DAP room payment and its retention. A free interactive calculator using the 2026 Aged Care Act fee structure.";

export const metadata: Metadata = {
  title: `${title} — RetireWiz`,
  description,
  alternates: { canonical: `${SITE_URL}/learn/aged-care-calculator` },
  openGraph: { title, description, url: `${SITE_URL}/learn/aged-care-calculator`, type: "website" },
};

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Aged care cost calculator",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    url: `${SITE_URL}/learn/aged-care-calculator`,
    description,
    inLanguage: "en-AU",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "AUD" },
  },
  breadcrumbLd([
    { name: "Home", path: "/" },
    { name: "Knowledge base", path: "/learn" },
    { name: "Aged care cost calculator", path: "/learn/aged-care-calculator" },
  ]),
];

export default function AgedCareCalculatorPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <Link href="/learn" className="font-medium hover:text-white">← Knowledge base</Link>
        <span aria-hidden>·</span>
        <span className="text-accent">Aged care</span>
      </div>

      <header className="mt-5">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Aged care cost calculator</h1>
        <p className="mt-3 text-lg leading-relaxed text-slate-300">
          Aged care in Australia is means-tested and the fees can be confusing. Move the sliders to estimate what a care
          home — or Support at Home — might cost you, using the 2026 Aged Care Act fee structure.
        </p>
      </header>

      <div className="mt-8">
        <AgedCareCalculator />
      </div>

      {/* How the numbers work — short, links to the deeper articles */}
      <section className="mt-12">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-accent">How aged care is charged</h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-300">
          <p>
            Residential care has four charges: a flat <strong className="text-white">basic daily fee</strong> everyone pays,
            a means-tested <strong className="text-white">hotelling</strong> fee for meals and cleaning, a means-tested{" "}
            <strong className="text-white">care contribution (NCCC)</strong> that is capped, and the cost of your{" "}
            <strong className="text-white">room</strong> — paid as a refundable lump sum (a RAD), as a daily payment (a DAP),
            or a mix. Clinical care is fully government-funded.
          </p>
          <p>
            How much of the means-tested fees you pay depends on your assessable assets and income — the same test behind the{" "}
            <Link href="/learn/means-testing" className="text-accent hover:underline">Age Pension</Link>, with your former home
            counted only up to a cap. A refundable deposit is exempt from that test, which is part of why the RAD-vs-DAP choice
            matters.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/learn/aged-care-costs" className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm text-slate-300 transition hover:border-accent/40 hover:text-white">
            Aged care costs explained
          </Link>
          <Link href="/learn/aged-care-funding" className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm text-slate-300 transition hover:border-accent/40 hover:text-white">
            How to fund aged care
          </Link>
          <Link href="/learn/means-testing" className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm text-slate-300 transition hover:border-accent/40 hover:text-white">
            Means testing
          </Link>
        </div>
      </section>

      <div className="mt-12 rounded-2xl border border-accent/30 bg-accent/10 p-6 text-center">
        <h2 className="text-lg font-bold text-white">See it in your whole retirement plan</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300">
          The free planner models a care phase inside your full projection — how the fees, the RAD and your Age Pension play
          out over the years, and what it leaves to your estate.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110"
        >
          Open the planner <span aria-hidden>→</span>
        </Link>
      </div>
    </main>
  );
}
