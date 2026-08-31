import Link from "next/link";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/seo";
import TtrCalculator from "@/components/TtrCalculator";
import Bert from "@/components/Bert";

const title = "TTR sweet-spot calculator — Australia (2026)";
const description =
  "Find the salary-sacrifice 'sweet spot' for a transition-to-retirement (TTR) strategy — the point that maximises your tax saving while keeping your take-home pay whole, bounded by the concessional cap and the 10% TTR drawdown limit. A free interactive calculator.";

export const metadata: Metadata = {
  title: `${title} — RetireWiz`,
  description,
  alternates: { canonical: `${SITE_URL}/learn/ttr-calculator` },
  openGraph: { title, description, url: `${SITE_URL}/learn/ttr-calculator`, type: "website" },
};

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "TTR sweet-spot calculator",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    url: `${SITE_URL}/learn/ttr-calculator`,
    description,
    inLanguage: "en-AU",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "AUD" },
  },
  breadcrumbLd([
    { name: "Home", path: "/" },
    { name: "Knowledge base", path: "/learn" },
    { name: "TTR sweet-spot calculator", path: "/learn/ttr-calculator" },
  ]),
];

export default function TtrCalculatorPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <Link href="/learn" className="font-medium hover:text-white">← Knowledge base</Link>
        <span aria-hidden>·</span>
        <span className="text-accent">Super &amp; tax</span>
      </div>

      <header className="mt-5 flex items-start justify-between gap-5">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">TTR sweet-spot calculator</h1>
          <p className="mt-3 text-lg leading-relaxed text-slate-300">
            From age 60 you can salary-sacrifice into super and top your take-home back up from a transition-to-retirement
            (TTR) pension — shifting income from your marginal rate to 15% tax. Move the sliders to find the sacrifice that
            saves the most for the same take-home.
          </p>
        </div>
        <Bert pose="eureka" size={104} className="hidden shrink-0 sm:block" />
      </header>

      <div className="mt-8">
        <TtrCalculator />
      </div>

      <section className="mt-12">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-accent">How the sweet spot works</h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-300">
          <p>
            The benefit is a <strong className="text-white">tax arbitrage</strong>: each dollar you salary-sacrifice is taxed
            at <strong className="text-white">15%</strong> going into super instead of your marginal rate plus the 2% Medicare
            levy. You replace the take-home you gave up by drawing from a TTR pension, which is{" "}
            <strong className="text-white">tax-free from 60</strong> — so your pay packet is unchanged and the difference
            between your marginal rate and 15% lands in your super.
          </p>
          <p>
            Two limits set the sweet spot. Your total concessional contributions (employer SG{" "}
            <em>plus</em> salary sacrifice) can&apos;t exceed the{" "}
            <Link href="/learn/contribution-caps" className="text-accent hover:underline">concessional cap</Link>, and a TTR
            pension can pay at most <strong className="text-white">10% of its balance</strong> a year — so a smaller super
            balance limits how much take-home you can replace. The sweet spot is the largest sacrifice that fits both.
          </p>
          <p>
            Since 1 July 2017 a TTR pension&apos;s <em>earnings</em> are taxed at 15% (the same as accumulation), so the old
            earnings-tax break is gone — the contributions arbitrage above is where the value now sits. High earners over
            $250,000 also pay <strong className="text-white">Division 293</strong>, an extra 15% that halves the arbitrage.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/learn/transition-to-retirement" className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm text-slate-300 transition hover:border-accent/40 hover:text-white">
            Transition to retirement
          </Link>
          <Link href="/learn/contribution-caps" className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm text-slate-300 transition hover:border-accent/40 hover:text-white">
            Contribution caps
          </Link>
          <Link href="/learn/income-streams" className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm text-slate-300 transition hover:border-accent/40 hover:text-white">
            Income streams
          </Link>
        </div>
      </section>

      <div className="mt-12 rounded-2xl border border-accent/30 bg-accent/10 p-6 text-center">
        <h2 className="text-lg font-bold text-white">See it in your whole retirement plan</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300">
          The free planner runs a TTR strategy inside your full projection — the extra super, the tax saved, and how it plays
          out year by year to retirement.
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
