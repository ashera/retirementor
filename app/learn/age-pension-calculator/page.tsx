import Link from "next/link";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/seo";
import AgePensionCalculator from "@/components/AgePensionCalculator";
import Bert from "@/components/Bert";

const title = "Age Pension calculator — Australia (2026)";
const description =
  "Estimate your Australian Age Pension entitlement — the income test, the assets test and deeming, for singles and couples, homeowners and renters. A free interactive calculator using the 1 July 2026 rates, with all the workings shown.";

export const metadata: Metadata = {
  title: `${title} — RetireWiz`,
  description,
  alternates: { canonical: `${SITE_URL}/learn/age-pension-calculator` },
  openGraph: { title, description, url: `${SITE_URL}/learn/age-pension-calculator`, type: "website" },
};

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Age Pension calculator",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    url: `${SITE_URL}/learn/age-pension-calculator`,
    description,
    inLanguage: "en-AU",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "AUD" },
  },
  breadcrumbLd([
    { name: "Home", path: "/" },
    { name: "Knowledge base", path: "/learn" },
    { name: "Age Pension calculator", path: "/learn/age-pension-calculator" },
  ]),
];

export default function AgePensionCalculatorPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <Link href="/learn" className="font-medium hover:text-white">← Knowledge base</Link>
        <span aria-hidden>·</span>
        <span className="text-accent">Age Pension</span>
      </div>

      <header className="mt-5 flex items-start justify-between gap-5">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Age Pension calculator</h1>
          <p className="mt-3 text-lg leading-relaxed text-slate-300">
            The Age Pension is means-tested two ways at once — on your income and on your assets — and you&apos;re paid the
            lower result. Move the sliders to estimate your entitlement, with every step of the working shown.
          </p>
        </div>
        <Bert pose="eureka" size={104} className="hidden shrink-0 sm:block" />
      </header>

      <div className="mt-8">
        <AgePensionCalculator />
      </div>

      {/* How the numbers work — short, links to the deeper articles */}
      <section className="mt-12">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-accent">How the Age Pension is tested</h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-300">
          <p>
            Services Australia runs an <strong className="text-white">income test</strong> and an{" "}
            <strong className="text-white">assets test</strong> separately, then pays whichever gives the{" "}
            <strong className="text-white">lower</strong> pension. Below both free areas you get the maximum rate; above them the
            pension tapers away — by 50c per $1 of income, or $3 a fortnight per $1,000 of assets.
          </p>
          <p>
            Your investments are counted through <strong className="text-white">deeming</strong>: rather than your actual returns,
            the government assumes a set rate on your financial assets. Your family home is exempt from the assets test, but
            homeowners get a smaller assets free area than non-homeowners. It&apos;s the same means test that sits behind{" "}
            <Link href="/learn/aged-care-calculator" className="text-accent hover:underline">aged-care fees</Link>.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/learn/means-testing" className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm text-slate-300 transition hover:border-accent/40 hover:text-white">
            Means testing explained
          </Link>
          <Link href="/learn/aged-care-calculator" className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm text-slate-300 transition hover:border-accent/40 hover:text-white">
            Aged care calculator
          </Link>
        </div>
      </section>

      <div className="mt-12 rounded-2xl border border-accent/30 bg-accent/10 p-6 text-center">
        <h2 className="text-lg font-bold text-white">See it across your whole retirement</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300">
          The free planner projects your Age Pension year by year as your assets draw down — often rising as you spend — alongside
          your super, tax and spending.
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
