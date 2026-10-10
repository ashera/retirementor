import Link from "next/link";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/seo";
import { fmtCurrency } from "@/lib/au/format";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import SuperOnTrackCalculator from "@/components/SuperOnTrackCalculator";
import Bert from "@/components/Bert";

const COMF = DEFAULT_CONFIG.asfa.lumpSum.comfortable.single;

const title = "Is your super on track for your age?";
const description =
  "The question half of r/AusFinance is quietly asking. See how your super compares to the typical balance for your age, whether you're on track for a comfortable retirement at 67, and what a bit extra would do — with a free calculator and honest numbers (median, not the skewed average).";

export const metadata: Metadata = {
  title: `${title} — RetireWiz`,
  description,
  alternates: { canonical: `${SITE_URL}/learn/super-on-track` },
  openGraph: { title, description, url: `${SITE_URL}/learn/super-on-track`, type: "article" },
};

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    inLanguage: "en-AU",
    isAccessibleForFree: true,
    author: { "@type": "Organization", name: "RetireWiz" },
    publisher: { "@type": "Organization", name: "RetireWiz" },
    mainEntityOfPage: `${SITE_URL}/learn/super-on-track`,
  },
  breadcrumbLd([
    { name: "Home", path: "/" },
    { name: "Knowledge base", path: "/learn" },
    { name: "Is your super on track for your age?", path: "/learn/super-on-track" },
  ]),
];

// Approximate median super by age band — the same figures the calculator interpolates.
const MEDIANS: [string, string][] = [
  ["25–34", "~$25,000"],
  ["35–44", "~$55,000"],
  ["45–54", "~$95,000"],
  ["55–64", "~$160,000"],
];

export default function SuperOnTrackPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <Link href="/learn" className="font-medium hover:text-white">← Knowledge base</Link>
        <span aria-hidden>·</span>
        <span className="text-accent">Super on track for your age</span>
      </div>

      <header className="mt-5 flex items-start justify-between gap-5">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Is your super on track for your age?</h1>
          <p className="mt-3 text-lg leading-relaxed text-slate-300">
            It&apos;s the question half of r/AusFinance is quietly asking — one recent &ldquo;I hit $100k in super!&rdquo; post drew
            hundreds of comments of people comparing notes. Here&apos;s how to actually answer it for yourself, with honest numbers.
          </p>
        </div>
        <Bert pose="glasses" size={104} className="hidden shrink-0 sm:block" />
      </header>

      {/* Calculator up top — it's the answer people came for */}
      <section className="mt-10">
        <h2 className="text-xl font-bold text-white">Where do you stand?</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-300">
          Enter your age, balance and income. You&apos;ll get two answers: how you compare to the <strong className="text-white">typical
          balance for your age</strong>, and whether your current path reaches a <strong className="text-white">comfortable retirement</strong> at 67.
        </p>
        <div className="mt-6">
          <SuperOnTrackCalculator />
        </div>
      </section>

      {/* Typical by age */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-white">What&apos;s &ldquo;typical&rdquo; by age</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-300">
          Approximate <strong className="text-white">median</strong> super balances (
          <Link href="/learn/australian-retirement-statistics" className="text-accent hover:underline">ATO/APRA, rounded</Link>):
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2 pr-4 font-medium">Age band</th>
                <th className="py-2 font-medium">Approx. median balance</th>
              </tr>
            </thead>
            <tbody>
              {MEDIANS.map(([band, bal]) => (
                <tr key={band} className="border-b border-line/60">
                  <td className="py-2 pr-4 text-slate-200">{band}</td>
                  <td className="py-2 font-semibold tabular-nums text-white">{bal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm leading-relaxed text-amber-200/90">
          A big caveat: these are <strong className="text-white">medians</strong>. The <em>average</em> is much higher — a minority of very
          large balances drag it up — which is why &ldquo;am I above average?&rdquo; is a harder bar than it sounds. We pull that thread
          apart in <Link href="/learn/average-australian-retirement" className="underline hover:text-amber-100">can the average Australian retire comfortably?</Link>
        </p>
      </section>

      {/* Two meanings */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-white">&ldquo;On track&rdquo; means two different things</h2>
        <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-300">
          <p>
            <strong className="text-white">1. Ahead of your peers.</strong> Beating the median for your age feels good — and the
            &ldquo;$100k at 32&rdquo; poster was well ahead of the ~$25k typical. But the median is a low bar, so clearing it doesn&apos;t
            mean you&apos;ll land a comfortable retirement.
          </p>
          <p>
            <strong className="text-white">2. On track for the retirement you want.</strong> The one that matters. The calculator
            projects your balance plus future employer super to 67 and checks it against the ASFA comfortable target ({fmtCurrency(COMF)}
            for a single). If you&apos;re short, it shows roughly how much extra per year would close the gap — the kind of catch-up a bit
            of <Link href="/learn/transition-to-retirement" className="text-accent hover:underline">salary sacrifice</Link> can do, within the{" "}
            <Link href="/learn/contribution-caps" className="text-accent hover:underline">contribution caps</Link>.
          </p>
        </div>
      </section>

      {/* What the formula can't see */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-white">What a balance alone can&apos;t tell you</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-300">
          A target balance is a useful waypoint, but it&apos;s not the whole answer. The ASFA comfortable figure is a{" "}
          <em>drawdown</em> target that already assumes a part Age Pension and a paid-off home — so the real question isn&apos;t just
          &ldquo;did I hit a number?&rdquo; but &ldquo;what income does my super plus the Age Pension actually fund, and how long does it
          last?&rdquo; That&apos;s what the planner models year by year.
        </p>
      </section>

      {/* CTA */}
      <div className="mt-12 rounded-2xl border border-accent/30 bg-accent/10 p-6 text-center">
        <h2 className="text-lg font-bold text-white">Go past the balance</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300">
          The free planner takes your real numbers — super, the Age Pension, tax, spending — and shows the income they fund and how long
          your money lasts, in today&apos;s dollars.
        </p>
        <Link href="/" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110">
          Open the planner <span aria-hidden>→</span>
        </Link>
      </div>

      <p className="mt-8 text-[11px] leading-relaxed text-muted">
        General information only, current at {DEFAULT_CONFIG.financialYear} — not personal financial advice. Median figures are
        approximate and vary widely by income and gender; projections are estimates in today&apos;s dollars and depend on your own
        contributions, returns, fees and circumstances. Confirm current details with{" "}
        <a href="https://moneysmart.gov.au/" target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">Moneysmart</a>{" "}
        or a licensed financial adviser before acting.
      </p>
    </main>
  );
}
