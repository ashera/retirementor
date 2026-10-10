import Link from "next/link";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/seo";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import MortgageAtRetirementCalculator from "@/components/MortgageAtRetirementCalculator";
import Bert from "@/components/Bert";

const title = "Pay off the mortgage at retirement, or keep it?";
const description =
  "Should you clear your home loan with super when you retire, or keep the mortgage and stay invested? It's not just return vs interest rate — in Australia the Age Pension means test tips the scales, because clearing the loan moves assessable super into your exempt home. A free calculator that runs both, plus how to think about it.";

export const metadata: Metadata = {
  title: `${title} — RetireWiz`,
  description,
  alternates: { canonical: `${SITE_URL}/learn/mortgage-at-retirement` },
  openGraph: { title, description, url: `${SITE_URL}/learn/mortgage-at-retirement`, type: "article" },
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
    mainEntityOfPage: `${SITE_URL}/learn/mortgage-at-retirement`,
  },
  breadcrumbLd([
    { name: "Home", path: "/" },
    { name: "Knowledge base", path: "/learn" },
    { name: "Pay off the mortgage at retirement?", path: "/learn/mortgage-at-retirement" },
  ]),
];

export default function MortgageAtRetirementPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <Link href="/learn" className="font-medium hover:text-white">← Knowledge base</Link>
        <span aria-hidden>·</span>
        <span className="text-accent">Mortgage at retirement</span>
      </div>

      <header className="mt-5 flex items-start justify-between gap-5">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Pay off the mortgage at retirement, or keep it?</h1>
          <p className="mt-3 text-lg leading-relaxed text-slate-300">
            More Australians are reaching retirement still owing on the home. The instinct is to clear it with super and be
            debt-free — but it&apos;s not always the better move, and in Australia there&apos;s a twist most calculators miss.
          </p>
        </div>
        <Bert pose="glasses" size={104} className="hidden shrink-0 sm:block" />
      </header>

      {/* Calculator */}
      <section className="mt-10">
        <h2 className="text-xl font-bold text-white">Run it both ways</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-300">
          This runs the <strong className="text-white">full RetireWiz engine</strong> — the Age Pension means test, tax and drawdown —
          for both choices, so the comparison is real, not a rule of thumb.
        </p>
        <div className="mt-6">
          <MortgageAtRetirementCalculator />
        </div>
      </section>

      {/* Three forces */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-white">Three forces pulling in different directions</h2>
        <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-slate-300">
          <div className="rounded-xl border border-line bg-panel p-4">
            <h3 className="font-semibold text-white">1. Return vs interest rate</h3>
            <p className="mt-1">
              Keep the mortgage and your super stays invested. If it earns <em>more</em> than your loan rate (and in pension phase those
              earnings are <strong className="text-white">tax-free</strong>, while home-loan interest isn&apos;t deductible), the money
              works harder left invested. If your loan rate is higher than your return, paying it off is a guaranteed &ldquo;return&rdquo;
              equal to the rate.
            </p>
          </div>
          <div className="rounded-xl border border-accent/30 bg-accent/[0.06] p-4">
            <h3 className="font-semibold text-white">2. The Age Pension means test — the Australian twist</h3>
            <p className="mt-1">
              Your home is <strong className="text-white">exempt</strong> from the assets test; your super and savings are{" "}
              <strong className="text-white">assessed</strong>. So drawing super to clear the loan <em>moves money from an assessed asset
              into an exempt one</em> — which can <strong className="text-white">increase your Age Pension</strong> by up to about 7.8% a
              year of the amount you clear (the assets-test taper). That pension boost is real cash, every year, and it&apos;s exactly what
              a plain return-vs-rate calculator ignores. See the{" "}
              <Link href="/learn/age-pension-calculator" className="text-accent hover:underline">Age Pension calculator</Link>.
            </p>
          </div>
          <div className="rounded-xl border border-line bg-panel p-4">
            <h3 className="font-semibold text-white">3. Cash flow, risk and peace of mind</h3>
            <p className="mt-1">
              Clearing the loan ends the repayment, so you need to draw less each year — and a smaller, debt-free drawdown is far less
              exposed to a bad run of early markets (<Link href="/learn/sequence-risk" className="text-accent hover:underline">sequence
              risk</Link>). Many retirees value certainty over a few extra dollars on paper. The numbers inform the call; they don&apos;t
              make it.
            </p>
          </div>
        </div>
      </section>

      {/* Caveats */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-white">A few things to keep in mind</h2>
        <ul className="mt-3 space-y-2.5 text-[15px] leading-relaxed text-slate-300">
          <li className="flex gap-2.5"><span aria-hidden className="text-accent">•</span><span>Drawing a super lump sum to pay the loan is <strong className="text-white">tax-free from age 60</strong> once you&apos;ve retired.</span></li>
          <li className="flex gap-2.5"><span aria-hidden className="text-accent">•</span><span>Clearing it leaves you with <strong className="text-white">less liquid super</strong> — fine if you keep a buffer, riskier if it drains your accessible savings.</span></li>
          <li className="flex gap-2.5"><span aria-hidden className="text-accent">•</span><span>A partial pay-down is an option too — clear enough to ease the cash flow (and nudge the pension up) without emptying the nest egg.</span></li>
          <li className="flex gap-2.5"><span aria-hidden className="text-accent">•</span><span>The pension boost only helps once you&apos;re <strong className="text-white">Age-Pension age ({DEFAULT_CONFIG.agePensionAge})</strong> and within the means-test taper zone — not if your assets are well above it.</span></li>
        </ul>
      </section>

      {/* CTA */}
      <div className="mt-12 rounded-2xl border border-accent/30 bg-accent/10 p-6 text-center">
        <h2 className="text-lg font-bold text-white">See it across your whole retirement</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300">
          The planner models the mortgage, the Age Pension and your drawdown year by year — and has a one-click &ldquo;clear the mortgage
          with super&rdquo; What-If so you can see the exact effect on your income and how long your money lasts.
        </p>
        <Link href="/" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110">
          Open the planner <span aria-hidden>→</span>
        </Link>
      </div>

      <p className="mt-8 text-[11px] leading-relaxed text-muted">
        General information only, current at {DEFAULT_CONFIG.financialYear} — not personal financial advice. Estimates in today&apos;s
        dollars on the assumptions you enter; your result depends on your own circumstances, and the calculator doesn&apos;t weigh market
        risk or personal preferences. Confirm current details with{" "}
        <a href="https://moneysmart.gov.au/" target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">Moneysmart</a>{" "}
        or a licensed financial adviser before acting.
      </p>
    </main>
  );
}
