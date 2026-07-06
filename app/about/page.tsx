import Link from "next/link";
import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "About & how it works",
  description:
    "RetireWiz is a free Australian retirement and super planner. How it works: year-by-year projection of your super and savings, the means-tested Age Pension, early-retirement bridge, super fees and tax — in today's dollars, using current rules and ASIC-consistent assumptions.",
  alternates: { canonical: "/about" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: `About ${SITE_NAME}`,
  url: `${SITE_URL}/about`,
  isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-xl font-bold text-white">{title}</h2>
      <div className="space-y-3 text-slate-300">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Link href="/" className="text-sm font-medium text-muted hover:text-white">← Back to the planner</Link>

      <header className="mt-6">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">About</p>
        <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
          A free Australian retirement &amp; super planner
        </h1>
        <p className="mt-3 text-muted">
          {SITE_NAME} helps Australians answer one question: <em>will my super and the Age Pension
          last?</em> It projects your superannuation and other savings year by year to the age you
          plan to, applies the means-tested Age Pension, and shows — in today&apos;s dollars — how
          much you&apos;ll have and how long it lasts. It&apos;s free, needs no sign-up to start, and
          sells no financial product.
        </p>
      </header>

      <Section title="What it models">
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong className="text-white">Superannuation</strong> — employer Super Guarantee plus voluntary contributions, contribution caps and super fees.</li>
          <li><strong className="text-white">The Age Pension</strong> — both the income and assets tests, at current rates, updated as your assets draw down.</li>
          <li><strong className="text-white">Retirement drawdown</strong> — your spending goal (or a detailed budget), including a home loan carried into retirement.</li>
          <li><strong className="text-white">Early retirement</strong> — the &ldquo;bridge&rdquo; from retiring before super unlocks at 60, through to the Age Pension at 67.</li>
          <li><strong className="text-white">Your situation</strong> — singles or couples, homeowners or renters, savings outside super, and an investment property.</li>
          <li><strong className="text-white">Uncertainty</strong> — thousands of Monte Carlo simulations to estimate how <em>likely</em> your money is to last, not just a single line.</li>
        </ul>
      </Section>

      <Section title="How the numbers are calculated">
        <p>
          Everything is modelled year by year using current Australian rules for super, tax,
          contribution caps and the means-tested Age Pension. Results are shown in{" "}
          <strong className="text-white">today&apos;s dollars</strong> so the figures are meaningful
          now, using default long-term economic assumptions consistent with{" "}
          <strong className="text-white">ASIC&apos;s Regulatory Guide 276</strong> for retirement
          estimates, and they account for super fees. Because real returns vary, the planner also
          runs thousands of simulations to estimate the probability your money lasts to your planning
          age. All results are estimates, not a guarantee of future outcomes.
        </p>
      </Section>

      <Section title="Data &amp; assumptions">
        <p>
          Rates and thresholds come from official Australian sources — Age Pension rates and means
          tests (Services Australia), contribution caps and tax (ATO), and lifestyle spending
          benchmarks from the ASFA Retirement Standard. Economic assumptions (returns, inflation,
          wage growth) follow ASIC&apos;s defaults for retirement calculators. These figures are
          reviewed and updated as the underlying rules change.
        </p>
      </Section>

      <Section title="Important — general information only">
        <p>
          {SITE_NAME} is a superannuation forecast tool provided under ASIC Corporations
          (Superannuation Calculators and Retirement Estimates) Instrument 2022/603 and prepared in
          line with ASIC Regulatory Guide 276. It provides{" "}
          <strong className="text-white">general information only</strong> and is not personal
          financial product advice — it does not consider your objectives, financial situation or
          needs, and does not promote any financial product. Before making a financial decision,
          consider obtaining advice from a licensed Australian Financial Services (AFS) adviser.
        </p>
      </Section>

      <div className="mt-10 rounded-2xl border border-accent/30 bg-accent/10 p-6 text-center">
        <h2 className="text-xl font-bold text-white">See your own numbers</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300">
          Model your super, the Age Pension and how long your money lasts — free, no sign-up needed to start.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110"
        >
          Open the {SITE_NAME} planner <span aria-hidden>→</span>
        </Link>
      </div>
    </main>
  );
}
