import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/site";
import { BUILD_DATE } from "@/lib/version";
import { DEFAULT_CONFIG as c } from "@/lib/au/config";
import { fmtCurrency } from "@/lib/au/format";
import { articleLd, breadcrumbLd } from "@/lib/seo";

const title = "Australian retirement in numbers (2026)";
const description =
  "Key Australian retirement statistics in one place — Age Pension rates and thresholds, super contribution caps, the ASFA retirement standard, aged-care fees, deeming rates and life expectancy — with sources.";

export const metadata: Metadata = {
  title: `${title} — RetireWiz`,
  description,
  alternates: { canonical: `${SITE_URL}/learn/australian-retirement-statistics` },
  openGraph: { title, description, url: `${SITE_URL}/learn/australian-retirement-statistics`, type: "article" },
};

const $ = (n: number) => fmtCurrency(Math.round(n));
const pct = (x: number) => `${(x * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

function StatTable({ headers, rows, caption }: { headers: string[]; rows: (string | ReactNode)[][]; caption?: string }) {
  return (
    <figure className="mt-3 overflow-x-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-panel-2">
            {headers.map((h, k) => (
              <th key={k} className="border-b border-line px-3 py-2 text-left font-semibold text-white">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="odd:bg-panel/40">
              {row.map((cell, i) => (
                <td key={i} className={`border-b border-line/60 px-3 py-2 align-top ${i === 0 ? "font-medium text-slate-200" : "tabular-nums text-slate-300"}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {caption && <figcaption className="border-t border-line/60 bg-panel-2/50 px-3 py-2 text-[11px] text-muted">{caption}</figcaption>}
    </figure>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold text-white">{heading}</h2>
      {children}
    </section>
  );
}

export default function StatsPage() {
  const ap = c.agePension;
  const ac = c.agedCare;
  const updated = new Date(BUILD_DATE).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  const jsonLd = [
    articleLd({ headline: title, description, path: "/learn/australian-retirement-statistics", datePublished: "2026-08-17", dateModified: BUILD_DATE, section: "Reference" }),
    breadcrumbLd([
      { name: "Home", path: "/" },
      { name: "Knowledge base", path: "/learn" },
      { name: "Australian retirement in numbers", path: "/learn/australian-retirement-statistics" },
    ]),
  ];

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <Link href="/learn" className="font-medium hover:text-white">← Knowledge base</Link>
        <span aria-hidden>·</span>
        <span className="text-accent">Reference</span>
      </div>

      <header className="mt-5">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Australian retirement in numbers</h1>
        <p className="mt-3 text-lg leading-relaxed text-slate-300">
          The key figures behind Australian retirement — the Age Pension, super, the ASFA retirement standard, aged care
          and longevity — in one place, with sources. Rates are a 2026 vintage and are indexed regularly.
        </p>
        <p className="mt-3 text-xs text-muted">Updated <time dateTime={BUILD_DATE}>{updated}</time> · General information, not financial advice</p>
      </header>

      <Section heading="The Age Pension">
        <p className="mt-2 text-slate-300">The Age Pension starts at age <strong className="text-white">{c.agePensionAge}</strong>. It is means-tested on both income and assets; the test that produces the lower payment applies.</p>
        <StatTable
          headers={["Measure", "Single", "Couple (combined)"]}
          rows={[
            ["Maximum payment (per year)", $(ap.single.maxAnnual), $(ap.couple.maxAnnual)],
            ["Assets-test free area — homeowner", $(ap.single.assetsFreeArea.homeowner), $(ap.couple.assetsFreeArea.homeowner)],
            ["Assets-test free area — non-homeowner", $(ap.single.assetsFreeArea.nonHomeowner), $(ap.couple.assetsFreeArea.nonHomeowner)],
            ["Income-test free area (per year)", $(ap.single.incomeFreeAreaAnnual), $(ap.couple.incomeFreeAreaAnnual)],
          ]}
          caption={`Assets taper ${$(ap.assetsTaperPerDollar * 1000)} of pension per $1,000 over the free area; income taper ${pct(ap.incomeTaperPerDollar)} per $1 over. Source: Services Australia.`}
        />
        <p className="mt-3 text-slate-300">Financial assets are <strong className="text-white">deemed</strong> to earn a set rate for the income test:</p>
        <StatTable
          headers={["Deeming", "Rate", "Applies to"]}
          rows={[
            ["Lower rate", pct(c.deeming.lowerRate), `first ${$(c.deeming.threshold.single)} (single) / ${$(c.deeming.threshold.couple)} (couple)`],
            ["Upper rate", pct(c.deeming.upperRate), "balance above the threshold"],
          ]}
          caption="Source: Services Australia (deeming rates, 2026)."
        />
      </Section>

      <Section heading="Superannuation">
        <StatTable
          headers={["Measure", "Value"]}
          rows={[
            ["Super Guarantee (employer contribution)", pct(c.sgRate)],
            ["Preservation age (when you can access super)", String(c.preservationAge)],
            ["Concessional (pre-tax) contribution cap — per year", $(c.concessionalCap)],
            ["Non-concessional (after-tax) cap — per year", $(c.nonConcessionalCap)],
            ["Transfer balance cap (max in a tax-free pension)", $(c.transferBalanceCap)],
            ["Division 293 threshold (extra 15% contributions tax)", $(c.div293Threshold)],
          ]}
          caption="Source: ATO. Super earnings in pension phase are tax-free from age 60."
        />
        <p className="mt-3 text-slate-300">Approximate <strong className="text-white">median</strong> super balances by age (before the run-up to retirement):</p>
        <StatTable
          headers={["Age band", "Approx. median balance"]}
          rows={[
            ["25–34", "~$25,000"],
            ["35–44", "~$55,000"],
            ["45–54", "~$95,000"],
            ["55–64", "~$160,000"],
          ]}
          caption="Approximate medians, rounded. Source: ATO Taxation Statistics / APRA. Balances vary widely by income and gender."
        />
      </Section>

      <Section heading="How much you need — the ASFA Retirement Standard">
        <p className="mt-2 text-slate-300">The industry benchmark for annual spending in retirement (assuming you own your home outright):</p>
        <StatTable
          headers={["Lifestyle", "Single — per year", "Couple — per year"]}
          rows={[
            ["Comfortable", $(c.asfa.comfortable.single), $(c.asfa.comfortable.couple)],
            ["Modest", $(c.asfa.modest.single), $(c.asfa.modest.couple)],
          ]}
        />
        <p className="mt-3 text-slate-300">And the lump sum ASFA estimates you need at 67 to fund it (the rest comes from the Age Pension):</p>
        <StatTable
          headers={["Lifestyle", "Single", "Couple"]}
          rows={[
            ["Comfortable", $(c.asfa.lumpSum.comfortable.single), $(c.asfa.lumpSum.comfortable.couple)],
            ["Modest", $(c.asfa.lumpSum.modest.single), $(c.asfa.lumpSum.modest.couple)],
          ]}
          caption="Source: ASFA Retirement Standard."
        />
      </Section>

      <Section heading="Aged care">
        <p className="mt-2 text-slate-300">
          About <strong className="text-white">1 in {Math.max(2, Math.round(1 / ac.entryProbability))}</strong> people use
          permanent residential care at some point, typically entering around age {ac.medianEntryAge} for ~{ac.medianDurationYears} years.
          Try the <Link href="/learn/aged-care-calculator" className="text-accent hover:underline">aged care calculator</Link> for your own numbers.
        </p>
        <StatTable
          headers={["Residential fee", "Maximum (2026 vintage)"]}
          rows={[
            ["Basic daily fee (flat)", `${$(ac.basicDailyFee * 365)}/yr`],
            ["Hotelling (means-tested)", `${$(ac.hotellingMaxDaily * 365)}/yr`],
            ["Care contribution / NCCC (means-tested, capped)", `${$(ac.ncccMaxDaily * 365)}/yr, capped at ${$(ac.ncccLifetimeCap)} / 4 yrs`],
            ["Room — national average RAD", $(ac.radNationalAvg)],
            ["Room — as a daily payment (MPIR)", pct(ac.mpir)],
            ["Former-home value cap (means test)", $(ac.homeValueCapMeansTest)],
          ]}
          caption="Source: Dept. of Health, Disability and Ageing (Aged Care Act, 2026 arrangements). Clinical care is fully government-funded."
        />
      </Section>

      <Section heading="Longevity">
        <p className="mt-2 text-slate-300">Life expectancy matters because it sets how long your money must last. At age 65, an Australian can expect to live to roughly:</p>
        <StatTable
          headers={["At age 65", "Life expectancy", "Chance of reaching"]}
          rows={[
            ["Men", "~85", "~1 in 2 reach 85"],
            ["Women", "~88", "~1 in 2 reach 88"],
          ]}
          caption="Approximate. Source: ABS Life Tables. Many live well beyond — planning to ~90+ is prudent."
        />
      </Section>

      <Section heading="Sources">
        <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
          {[
            ["Services Australia — Age Pension & deeming", "https://www.servicesaustralia.gov.au/age-pension"],
            ["ATO — super contribution caps", "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions"],
            ["ASFA Retirement Standard", "https://www.superannuation.asn.au/resources/retirement-standard/"],
            ["Dept. of Health, Disability and Ageing — aged care", "https://www.health.gov.au/our-work/residential-aged-care/charging"],
            ["ABS — Life Tables", "https://www.abs.gov.au/statistics/people/population/life-tables"],
          ].map(([label, href]) => (
            <li key={href} className="flex gap-2">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{label}</a>
            </li>
          ))}
        </ul>
      </Section>

      <div className="mt-12 rounded-2xl border border-accent/30 bg-accent/10 p-6 text-center">
        <h2 className="text-lg font-bold text-white">See these numbers in your own plan</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300">
          The free planner applies all of the above — the Age Pension, super, tax and aged care — to your own situation, in today&apos;s dollars.
        </p>
        <Link href="/" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110">
          Open the planner <span aria-hidden>→</span>
        </Link>
      </div>
    </main>
  );
}
