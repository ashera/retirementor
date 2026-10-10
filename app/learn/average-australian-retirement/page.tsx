import Link from "next/link";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/seo";
import { fmtCurrency } from "@/lib/au/format";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import AverageRetirementCalculator from "@/components/AverageRetirementCalculator";
import Bert from "@/components/Bert";

const COMF = DEFAULT_CONFIG.asfa.lumpSum.comfortable.single; // $630k
const MOD = DEFAULT_CONFIG.asfa.lumpSum.modest.single; // $110k
const COMF_YR = DEFAULT_CONFIG.asfa.comfortable.single; // ~$54.8k/yr

const title = "Can the average Australian retire comfortably?";
const description =
  "A popular r/AusFinance thread did the maths: the average 38-year-old on a median full-time income lands just over $1 million in super at 67. We reproduce the calculation to the dollar, run its five what-ifs, and add the catch the thread's top comment raised — average vs median super — with a free calculator so you can test your own numbers.";

export const metadata: Metadata = {
  title: `${title} — RetireWiz`,
  description,
  alternates: { canonical: `${SITE_URL}/learn/average-australian-retirement` },
  openGraph: { title, description, url: `${SITE_URL}/learn/average-australian-retirement`, type: "article" },
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
    mainEntityOfPage: `${SITE_URL}/learn/average-australian-retirement`,
  },
  breadcrumbLd([
    { name: "Home", path: "/" },
    { name: "Knowledge base", path: "/learn" },
    { name: "Can the average Australian retire comfortably?", path: "/learn/average-australian-retirement" },
  ]),
];

function Src({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">
      {children}
    </a>
  );
}

// The thread's inputs, shown as a compact definition list.
const INPUTS: [string, string][] = [
  ["Age now → retirement", "38 → 67 (29 years)"],
  ["Median full-time income", "$90,500/yr"],
  ["Average super balance (age 38)", "$182,800"],
  ["Super guarantee", "12%"],
  ["Super return (after 15% tax)", "6.4% p.a., less a 1% fee"],
  ["Pay growth / inflation", "2.6% / 2.5% p.a."],
];

// The five what-ifs from the thread (all in today's dollars).
const WHATIFS: [string, string, string][] = [
  ["Super balance a third ($61k)", "$643,000", "still comfortable"],
  ["No pay rises ever (0% growth)", "$892,000", "still comfortable"],
  ["4% inflation the whole way", "$658,000", "still comfortable"],
  ["Retire at 60, not 67", "$717,000", "still comfortable"],
  ["Part-time, 0.5 FTE ($45,250)", "$771,000", "still comfortable"],
];

export default function AverageRetirementPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <Link href="/learn" className="font-medium hover:text-white">← Knowledge base</Link>
        <span aria-hidden>·</span>
        <span className="text-accent">The average Australian</span>
      </div>

      <header className="mt-5 flex items-start justify-between gap-5">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Can the average Australian retire comfortably?</h1>
          <p className="mt-3 text-lg leading-relaxed text-slate-300">
            A popular <Src href="https://www.reddit.com/r/AusFinance/comments/1urbecs/can_the_average_australian_retire_comfortably/">r/AusFinance thread</Src>{" "}
            did the maths and landed on a cheerful answer: just over <strong className="text-white">$1 million</strong>. We reproduce
            it to the dollar, run its five what-ifs — then add the catch the top comment raised.
          </p>
        </div>
        <Bert pose="glasses" size={104} className="hidden shrink-0 sm:block" />
      </header>

      {/* The approach */}
      <section className="mt-10">
        <h2 className="text-xl font-bold text-white">The calculation</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-300">
          The idea is simple: take an average 38-year-old, add nothing but their compulsory employer super for 29 years, grow it at a
          long-run return, and see what&apos;s left at 67 — all expressed in <strong className="text-white">today&apos;s dollars</strong>{" "}
          so it&apos;s comparable to money now. Here are the inputs used:
        </p>
        <dl className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {INPUTS.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-medium text-white">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">The headline</div>
          <div className="mt-1 text-3xl font-extrabold tracking-tight text-white">$1,002,740</div>
          <p className="mt-1 text-sm text-slate-200">
            at 67, in today&apos;s dollars — comfortably above the ASFA <strong className="text-white">comfortable</strong> lump sum of{" "}
            {fmtCurrency(COMF)} for a single. So, on these averages: <strong className="text-white">yes</strong>.
          </p>
        </div>
      </section>

      {/* Calculator */}
      <section className="mt-10">
        <h2 className="text-xl font-bold text-white">Try it with your own numbers</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-300">
          The same formula, interactive. Use the presets to jump to the thread&apos;s scenarios — or the all-important{" "}
          <strong className="text-white">median super</strong> one.
        </p>
        <div className="mt-6">
          <AverageRetirementCalculator />
        </div>
      </section>

      {/* The five what-ifs */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-white">Five what-ifs — all still comfortable</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-300">
          The thread stress-tested the result five ways. Impressively, each one still clears the {fmtCurrency(COMF)} comfortable mark:
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2 pr-4 font-medium">Change</th>
                <th className="py-2 pr-4 font-medium">Balance at 67</th>
                <th className="py-2 font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {WHATIFS.map(([k, v, verdict]) => (
                <tr key={k} className="border-b border-line/60">
                  <td className="py-2 pr-4 text-slate-200">{k}</td>
                  <td className="py-2 pr-4 font-semibold tabular-nums text-white">{v}</td>
                  <td className="py-2 text-emerald-400">{verdict}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* The catch */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-white">The catch: average vs median</h2>
        <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-300">
          <p>
            The thread&apos;s most-upvoted reply spotted the weak link: the <strong className="text-white">$182,800</strong> super
            balance is an <em>average</em>, and super averages are dragged up by a relatively small number of very large balances. The{" "}
            <Link href="/learn/australian-retirement-statistics" className="text-accent hover:underline">median for a 35–44-year-old is closer to ~$55,000</Link>{" "}
            — less than a third of the figure used, and lower again for women (who more often take career breaks).
          </p>
          <p>
            Swap the average for the median and the headline changes a lot. On exactly the same assumptions, the projection drops from
            ~$1,002,740 to about <strong className="text-white">$625,000</strong> — right <em>on</em> the comfortable line, not
            comfortably past it. And the median case only holds if you&apos;re a <em>full-time median earner for 29 unbroken years</em>.
            Pull any one lever and it slips under: median + retire at 60 → ~$426,000; median + part-time → ~$394,000.
          </p>
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm leading-relaxed text-amber-200/90">
            The thread&apos;s answer isn&apos;t wrong — it&apos;s just answering for the <em>average</em> person, who is wealthier than
            the <em>typical</em> one. Try the &ldquo;Median super&rdquo; preset above and watch the verdict move.
          </p>
        </div>
      </section>

      {/* What comfortable means */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-white">What &ldquo;comfortable&rdquo; actually means</h2>
        <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-300">
          <p>
            One more thing the lump-sum comparison hides: the ASFA{" "}
            <Src href="https://www.superannuation.asn.au/resources/retirement-standard/">comfortable</Src> figure ({fmtCurrency(COMF)} for a
            single, about {fmtCurrency(COMF_YR)}/yr to spend) is a <strong className="text-white">drawdown</strong> target — it assumes you
            spend the balance <em>down</em> over your retirement <em>and</em> receive a part Age Pension, owning your home outright. It&apos;s
            not a pool you live off the interest of forever. The modest standard ({fmtCurrency(MOD)} lump sum) leans even more on the pension.
          </p>
          <p>
            That&apos;s the real limit of a one-line formula: it stops at the <em>balance</em>. It can&apos;t tell you the income that
            balance actually funds once you add the Age Pension and tax, or how long it lasts, or what a bad run of early markets does to
            it. That&apos;s exactly what the planner is for.
          </p>
        </div>
      </section>

      {/* CTA */}
      <div className="mt-12 rounded-2xl border border-accent/30 bg-accent/10 p-6 text-center">
        <h2 className="text-lg font-bold text-white">See what your balance actually funds</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300">
          The free planner takes it past the balance — your super and the Age Pension, year by year, in today&apos;s dollars: the
          income it supports, the tax, and how long it lasts.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110"
        >
          Open the planner <span aria-hidden>→</span>
        </Link>
      </div>

      <p className="mt-8 text-[11px] leading-relaxed text-muted">
        General information only, current at {DEFAULT_CONFIG.financialYear} — not personal financial advice. Figures reproduce a
        third-party calculation and are estimates in today&apos;s dollars; your own result depends on your income, contributions,
        returns, fees and circumstances. ASFA Retirement Standard figures are indicative and updated quarterly. Confirm current
        details with the <Src href="https://moneysmart.gov.au/">Moneysmart</Src> or a licensed financial adviser before acting.
      </p>
    </main>
  );
}
