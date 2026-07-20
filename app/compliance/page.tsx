import Link from "next/link";
import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { getActiveConfig } from "@/lib/refdata";
import { DEFAULT_PLAN } from "@/lib/au/types";
import { fmtCurrency } from "@/lib/au/format";
import { APP_VERSION, GIT_SHA, BUILD_DATE } from "@/lib/version";

export const metadata: Metadata = {
  title: "Compliance & regulations",
  description:
    "How RetireWiz is designed to operate as a superannuation calculator and retirement estimate under ASIC Instrument 2022/603 and Regulatory Guide 276 — the key rules and how we comply, rule by rule.",
  alternates: { canonical: "/compliance" },
};

export const dynamic = "force-dynamic"; // reads the live reference-data config

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: `Compliance & regulations — ${SITE_NAME}`,
  url: `${SITE_URL}/compliance`,
  isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
};

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-2xl border border-line bg-panel p-5">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-300">{children}</div>
    </div>
  );
}

export default async function CompliancePage() {
  const config = await getActiveConfig();
  // Config stores some rates as fractions (0.12) and others as plain percents (2.5).
  const pctFrac = (n: number) => `${+(n * 100).toFixed(2)}%`; // for 0.12 → "12%"
  const pctNum = (n: number) => `${+n.toFixed(1)}%`; // for 2.5 → "2.5%"
  const cpi = DEFAULT_PLAN.inflation;
  const wage = cpi + (config.livingStandardsGrowthPct ?? 0);
  const ap = config.agePension;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Link href="/" className="text-sm font-medium text-muted hover:text-white">← Back to the planner</Link>

      <header className="mt-6">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">Compliance</p>
        <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Regulations &amp; how we comply</h1>
        <p className="mt-3 text-slate-300">
          {SITE_NAME} is built to operate within the relief ASIC provides for superannuation calculators and
          retirement estimates. It gives <strong className="text-white">general information only</strong> — not
          personal financial product advice. This page sets out the key regulatory rules and, for each, exactly how
          the tool is designed to comply. Figures shown here are read live from the current{" "}
          <strong className="text-white">FY{config.financialYear}</strong> reference data.
        </p>
        <p className="mt-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs text-muted">
          This page explains our design approach and is itself general information, not legal advice. Australian
          financial-services law is complex and changes; a licensed compliance adviser should confirm the tool's
          treatment for your circumstances.
        </p>
      </header>

      <section className="mt-8">
        <h2 className="text-xl font-bold text-white">The framework we operate under</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          RetireWiz is a superannuation forecast tool provided under{" "}
          <strong className="text-white">ASIC Corporations (Superannuation Calculators and Retirement Estimates)
          Instrument 2022/603</strong>, prepared in line with{" "}
          <strong className="text-white">ASIC Regulatory Guide 276</strong>. That relief lets a provider offer a
          retirement projection without personal advice, provided the calculator meets a set of conditions —
          non-advice framing, present-value results, prescribed default assumptions that the user can change, clear
          disclosure of assumptions and limitations, and current statutory inputs. The rules below map to those
          conditions.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold text-white">Key rules &amp; our compliance</h2>

        <Rule title="General information, not personal advice">
          <p>
            The tool never tells you what you <em>should</em> do. It is an if-then sandbox: you enter figures and see
            the mathematical outcome. There is no &ldquo;optimise my strategy&rdquo; button, and no recommendation to
            buy, hold or switch any financial product. A prominent &ldquo;general information only — not financial
            advice&rdquo; statement appears in the site footer and the Assumptions &amp; limitations dialog, and every
            saved report carries it.
          </p>
        </Rule>

        <Rule title="Results in today's dollars (present value)">
          <p>
            Because the projection spans decades, every future balance and income figure is shown in{" "}
            <strong className="text-white">today&apos;s dollars</strong> by default — never inflated nominal amounts
            that overstate future wealth. This is the only display basis; there is no nominal mode that could mislead.
          </p>
        </Rule>

        <Rule title="Two-stage deflation to today's dollars (RG 276)">
          <p>
            Following ASIC&apos;s superannuation-forecast method, amounts are deflated in two stages.{" "}
            <strong className="text-white">While you are working</strong>, projections are deflated by wage inflation
            of <strong className="text-white">{pctNum(wage)}</strong> (CPI {pctNum(cpi)} plus a{" "}
            {pctNum(config.livingStandardsGrowthPct ?? 0)} rise in community living standards), so the projection keeps
            pace with wages. <strong className="text-white">From retirement onward</strong> the deflator switches to
            CPI of <strong className="text-white">{pctNum(cpi)}</strong>, matching how retiree spending and the Age
            Pension are indexed. These are the landing defaults; you can change the inflation assumption.
          </p>
        </Rule>

        <Rule title="Default economic assumptions, disclosed and adjustable">
          <p>
            The calculator opens on standard default assumptions — investment return, return volatility (for the
            &ldquo;how likely&rdquo; modelling), inflation, and super fees. Each is disclosed in the Assumptions &amp;
            limitations dialog and can be changed by the user. Results are estimates and not a guarantee of future
            outcomes.
          </p>
        </Rule>

        <Rule title="Age Pension — both means tests, deeming, and current Centrelink rules">
          <p>
            The Age Pension (from age {config.agePensionAge}) is assessed on <strong className="text-white">both the
            income test and the assets test, paying the lower</strong> of the two — automatically, from your inputs.
            Homeowner status, relationship status and asset values all drive the result.
          </p>
          <p>
            Critically, financial assets are <strong className="text-white">deemed</strong> for the income test at the
            official government deeming rates ({pctFrac(config.deeming.lowerRate)} / {pctFrac(config.deeming.upperRate)}) — the
            tool does <em>not</em> apply your investment-return assumption to the pension income test. Current
            thresholds, taper rates and the maximum pension ({fmtCurrency(ap.single.maxAnnual)}/yr single,{" "}
            {fmtCurrency(ap.couple.maxAnnual)}/yr couple) are used throughout. The tool uses current Centrelink rules
            and cannot predict future changes to the pension age or means-testing thresholds — a limitation stated
            plainly in the disclosures.
          </p>
        </Rule>

        <Rule title="Superannuation rules and statutory caps">
          <p>
            Contributions, tax and preservation are modelled on current figures: Super Guarantee {pctFrac(config.sgRate)},{" "}
            {pctFrac(config.contributionsTax)} contributions tax and {pctFrac(config.superEarningsTaxAccumulation)} on
            accumulation earnings. Voluntary contributions are bounded by the statutory caps — concessional{" "}
            {fmtCurrency(config.concessionalCap)} and non-concessional {fmtCurrency(config.nonConcessionalCap)}. Super
            is preserved until age {config.preservationAge}, and the legislated minimum pension drawdown rates (which
            rise with age) are applied in the retirement phase.
          </p>
        </Rule>

        <Rule title="Transition to Retirement — an if-then sandbox">
          <p>
            The TTR feature models the salary-sacrifice side of a transition-to-retirement strategy: you enter an
            amount to sacrifice, and the tool shows the mathematical tax outcome — it never recommends a strategy or
            an &ldquo;optimal&rdquo; amount. The sacrifice is capped at the statutory{" "}
            <strong className="text-white">concessional contributions cap</strong> and is only available from your
            preservation age. Contributions remain in accumulation-phase super, taxed on earnings — the tool does not
            grant transition-phase money the tax-free treatment reserved for full retirement.
          </p>
        </Rule>

        <Rule title="Assumptions are visible and under your control">
          <p>
            Every assumption behind a result — economic rates, super and tax settings, Age Pension figures — is shown
            in the Assumptions &amp; limitations dialog, pulled live from the reference data, and the key ones are
            editable. Nothing material is hidden inside the model.
          </p>
        </Rule>

        <Rule title="Significant limitations are disclosed">
          <p>
            The disclosures state what the tool does <em>not</em> do: it cannot predict future changes to rates or
            law; it excludes aged-care costs, one-off or lump-sum spending and personal circumstances; and it flags
            simplifications (e.g. the Transfer Balance Cap and investment-property CGT). Users are directed to consider
            advice from an AFS licensee and to read the relevant Product Disclosure Statement before acting.
          </p>
        </Rule>

        <Rule title="Current, sourced statutory data">
          <p>
            Statutory figures (Centrelink thresholds, deeming rates, super caps, tax rates, ASFA spending benchmarks)
            are not scattered through the code — they live in a single versioned reference-data set, each with its
            source, maintained and rolled forward as the rules change, and tagged to the financial year
            (FY{config.financialYear}).
          </p>
        </Rule>

        <Rule title="Keeping a record">
          <p>
            You can generate a printable report of any result, which reproduces the figures alongside the assumptions
            and the not-advice disclosure — so a copy can be kept, exactly as ASIC&apos;s calculator conditions
            contemplate.
          </p>
        </Rule>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold text-white">Read more</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          The full assumptions and limitations are also shown inside the planner (the Assumptions &amp; limitations
          dialog on any result), and summarised in the site footer on every page.
        </p>
      </section>

      <p className="mt-8 border-t border-line pt-4 text-xs text-muted">
        Reference data: FY{config.financialYear}. App version <strong className="text-slate-300">v{APP_VERSION}</strong>{" "}
        ({GIT_SHA}, {BUILD_DATE}).
      </p>
    </main>
  );
}
