import Link from "next/link";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/seo";
import EarlySuperAccessCalculator from "@/components/EarlySuperAccessCalculator";
import Bert from "@/components/Bert";

const title = "Accessing super early — what it really costs (Australia)";
const description =
  "Early access to super is back in the news — One Nation's plan to divert part of your contributions, super-for-housing, the First Home Super Saver Scheme. A plain-English explainer plus a free calculator showing what taking money out before retirement really costs, in today's dollars.";

export const metadata: Metadata = {
  title: `${title} — RetireWiz`,
  description,
  alternates: { canonical: `${SITE_URL}/learn/early-super-access` },
  openGraph: { title, description, url: `${SITE_URL}/learn/early-super-access`, type: "article" },
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
    mainEntityOfPage: `${SITE_URL}/learn/early-super-access`,
  },
  breadcrumbLd([
    { name: "Home", path: "/" },
    { name: "Knowledge base", path: "/learn" },
    { name: "Accessing super early", path: "/learn/early-super-access" },
  ]),
];

// External sources (open in a new tab; nofollow-ish via rel).
function Src({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">
      {children}
    </a>
  );
}

export default function EarlySuperAccessPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <Link href="/learn" className="font-medium hover:text-white">← Knowledge base</Link>
        <span aria-hidden>·</span>
        <span className="text-accent">Accessing super early</span>
      </div>

      <header className="mt-5 flex items-start justify-between gap-5">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Getting at your super early — what it really costs</h1>
          <p className="mt-3 text-lg leading-relaxed text-slate-300">
            Letting people tap their super before retirement is back in the headlines. Whatever the scheme, the mechanics are the
            same — and the true cost is bigger than it looks. Here&apos;s the debate, the rules, and a calculator to see it for yourself.
          </p>
        </div>
        <Bert pose="glasses" size={104} className="hidden shrink-0 sm:block" />
      </header>

      {/* In the news */}
      <section className="mt-10">
        <h2 className="text-xl font-bold text-white">Why it&apos;s in the news</h2>
        <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-300">
          <p>
            In September 2026, <strong className="text-white">One Nation</strong> proposed letting the roughly 7 million Australians
            paying rent or a mortgage <strong className="text-white">divert 3% of their 12% compulsory super into their take-home
            pay</strong> for up to three years (still taxed at the concessional 15% rate). For a worker on about $90,500 that&apos;s
            roughly <strong className="text-white">$44 a week</strong>; for a couple on $168,000, about $82 a week (
            <Src href="https://www.abc.net.au/news/2026-09-07/one-nation-pauline-hanson-rent-mortgage-super-retirement/107122814">ABC News</Src>).
          </p>
          <p>
            The catch is the long game. The <strong className="text-white">Super Members Council</strong> estimated a typical
            30-year-old would pocket about <strong className="text-white">$6,900</strong> over the three years but miss out on more
            than <strong className="text-white">$18,000 in compounding</strong> — leaving them roughly{" "}
            <strong className="text-white">$25,000 worse off at retirement</strong>. Industry body{" "}
            <Src href="https://www.superannuation.asn.au/">ASFA</Src> called the idea &ldquo;economically disastrous&rdquo;, and the
            government dismissed it, pointing to the COVID-era early-release scheme as a cautionary tale.
          </p>
          <p>
            It sits alongside two perennial ideas: <strong className="text-white">&ldquo;super for housing&rdquo;</strong> (letting
            first-home buyers withdraw a deposit) and the existing{" "}
            <strong className="text-white">First Home Super Saver Scheme</strong>, which lets you withdraw <em>voluntary</em>
            contributions (up to $50,000) for a first home. Different schemes, same trade-off: money out of super now is money that
            stops compounding for decades.
          </p>
        </div>
      </section>

      {/* The core idea + calculator */}
      <section className="mt-10">
        <h2 className="text-xl font-bold text-white">The bit that surprises people</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-300">
          A dollar taken out of super today isn&apos;t a dollar lost — it&apos;s all the growth that dollar would have earned by the
          time you retire. Because super compounds for years (often decades), a modest amount now can cost several times as much
          later. We show it in <strong className="text-white">today&apos;s dollars</strong>, so the number is comparable to money
          now — not an inflated future figure. Try your own numbers:
        </p>

        <div className="mt-6">
          <EarlySuperAccessCalculator />
        </div>
      </section>

      {/* What you can actually do now */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-white">What you can actually do now</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-300">
          Most of the above is <em>proposed</em>, not law. Today, super is <strong className="text-white">preserved</strong> until
          you reach your preservation age (60) and retire — or turn 65 regardless. Before then, early access is limited to specific
          grounds (<Src href="https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super">ATO</Src>):
        </p>
        <ul className="mt-4 space-y-2.5 text-[15px] leading-relaxed text-slate-300">
          <li className="flex gap-2.5"><span aria-hidden className="text-accent">•</span><span><strong className="text-white">Severe financial hardship</strong> — if you&apos;ve been on income support for ~26 weeks; usually capped around $10,000 a year, at your fund&apos;s discretion.</span></li>
          <li className="flex gap-2.5"><span aria-hidden className="text-accent">•</span><span><strong className="text-white">Compassionate grounds</strong> — approved by the ATO for things like medical treatment, preventing the forced sale of your home, or funeral costs.</span></li>
          <li className="flex gap-2.5"><span aria-hidden className="text-accent">•</span><span><strong className="text-white">Terminal illness, or permanent incapacity</strong> — releasing your super early when you can no longer work.</span></li>
          <li className="flex gap-2.5"><span aria-hidden className="text-accent">•</span><span><strong className="text-white">First Home Super Saver Scheme</strong> — withdraw <em>voluntary</em> contributions plus their earnings (up to $50,000) toward a first home.</span></li>
          <li className="flex gap-2.5"><span aria-hidden className="text-accent">•</span><span><strong className="text-white">Leaving Australia permanently</strong> — for eligible temporary residents.</span></li>
        </ul>
        <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm leading-relaxed text-amber-200/90">
          ⚠️ Be wary of anyone advertising a &ldquo;loophole&rdquo; to unlock your super early. Illegal early withdrawal carries
          heavy tax penalties, and promoters often charge large fees. If in doubt, check with the ATO or a licensed adviser.
        </p>
      </section>

      {/* Balance */}
      <section className="mt-10">
        <h2 className="text-xl font-bold text-white">So is it ever worth it?</h2>
        <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-300">
          <p>
            Sometimes, yes. Genuine hardship, medical costs, or keeping a roof over your head can matter far more than a bigger
            balance decades away — that&apos;s exactly why the hardship and compassionate grounds exist. The point isn&apos;t that
            early access is always wrong; it&apos;s that the cost is easy to underestimate. Seeing it in today&apos;s dollars first
            means you&apos;re making the trade-off with eyes open.
          </p>
        </div>
      </section>

      {/* CTA */}
      <div className="mt-12 rounded-2xl border border-accent/30 bg-accent/10 p-6 text-center">
        <h2 className="text-lg font-bold text-white">See it across your whole retirement</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300">
          The free planner shows how your super, the Age Pension, tax and spending play out year by year — so you can weigh a
          decision like this against your actual retirement, not just a rule of thumb.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110"
        >
          Open the planner <span aria-hidden>→</span>
        </Link>
      </div>

      <p className="mt-8 text-[11px] leading-relaxed text-muted">
        General information only, current at September 2026 — not personal financial advice, and not a recommendation to access (or
        not access) your super. Rules and proposals change; confirm current details with the{" "}
        <Src href="https://www.ato.gov.au/">ATO</Src> or a licensed financial adviser before acting.
      </p>
    </main>
  );
}
