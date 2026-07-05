import Link from "next/link";
import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Australian retirement & super FAQ",
  description:
    "Plain-English answers to common Australian retirement questions — how much super you need, when you can access super, the Age Pension age and rates, means testing, and retiring early. General information only.",
  alternates: { canonical: "/faq" },
};

// Q&A pairs — answers are plain text so they can also power the FAQPage JSON-LD.
const FAQS: { q: string; a: string }[] = [
  {
    q: "How much super do I need to retire in Australia?",
    a: "It depends on the lifestyle you want, whether you own your home, and whether you'll receive the Age Pension. As a rough guide, ASFA's Retirement Standard suggests a homeowner needs around $595,000 (single) or $690,000 (couple) in super for a 'comfortable' retirement, assuming they also draw a part Age Pension. A 'modest' lifestyle needs much less because the Age Pension covers most of it. The most reliable way to know your own number is to model it — that's exactly what the RetireMentor planner does with your real balances, contributions and spending goal.",
  },
  {
    q: "Will my superannuation last through retirement?",
    a: "That comes down to four things: how much you've saved, how much you spend each year, the investment return you earn, and how long you live. Drawing down more than about 4–6% of your balance a year is generally considered aggressive and raises the risk of running out. RetireMentor projects your balance year by year to your chosen planning age and tells you whether — and roughly how likely — your money is to last, including any Age Pension you become entitled to along the way.",
  },
  {
    q: "When can I access my superannuation?",
    a: "You can generally access your super once you reach your 'preservation age' and retire. For everyone retiring now (born after 30 June 1964) the preservation age is 60. You can also access super once you turn 65 even if you're still working. There are limited early-release exceptions for severe financial hardship or compassionate grounds. Accessing super is different from the Age Pension, which starts later.",
  },
  {
    q: "What age can I get the Age Pension in Australia?",
    a: "The Age Pension age is 67 for anyone born on or after 1 January 1957. Reaching Age Pension age doesn't guarantee a payment — you also have to meet the residency rules and pass the income and assets tests. Because super is usually accessible from 60 but the pension starts at 67, many people 'bridge' those years by living off their super first.",
  },
  {
    q: "How much does the Age Pension pay?",
    a: "The maximum Age Pension, including the pension and energy supplements, is around $29,000 a year for a single person and about $44,000 a year combined for a couple. The exact rates are set by the government and indexed twice a year (in March and September), so they rise over time. How much you actually receive is reduced by the income and assets tests. RetireMentor applies the current rates and both tests automatically in your projection.",
  },
  {
    q: "Am I eligible for the Age Pension, and how does means testing work?",
    a: "Eligibility is decided by two tests — an income test and an assets test — and the one that produces the lower payment applies. Your family home is exempt from the assets test, but most other assets (including super in pension phase, savings and investment properties) count. As your assessable assets or income rise, the payment tapers down and eventually cuts out. This is why many retirees receive a part pension that grows as they draw their super down.",
  },
  {
    q: "Can I retire early, before I can access super or the Age Pension?",
    a: "Yes, but you need to fund the gap. To retire before 60 you generally can't touch super, so you'd rely on savings and investments held outside super until preservation age. From 60 to 67 you can draw on super but not yet the Age Pension — the 'bridge' years. RetireMentor is built for this: it models early retirement, your outside-super savings, and the bridge to preservation age and then to the Age Pension.",
  },
  {
    q: "What's the difference between a 'comfortable' and a 'modest' retirement?",
    a: "These are benchmarks published by the Association of Superannuation Funds of Australia (ASFA). A 'comfortable' retirement — around $52,000 a year for a single and $73,000 for a couple — allows for private health cover, occasional travel, dining out and a reasonable car. A 'modest' retirement — roughly $33,000 (single) and $48,000 (couple) — covers the basics and is better than relying on the Age Pension alone. ASFA updates these figures every quarter for inflation. You can start your budget from these figures inside the planner and adjust them to your own life.",
  },
  {
    q: "How are RetireMentor's projections calculated?",
    a: "Projections are modelled year by year using current Australian rules for super, tax, contribution caps and the means-tested Age Pension. All results are shown in today's dollars so the figures are meaningful now, using default long-term economic assumptions consistent with ASIC's guidance for retirement estimates, and they account for super fees. Because markets are uncertain, the planner also runs thousands of simulations to estimate how likely your money is to last. Results are estimates, not a guarantee of future outcomes.",
  },
  {
    q: "Is RetireMentor financial advice?",
    a: "No. RetireMentor provides general information only. It's a superannuation forecast tool prepared in line with ASIC's regulatory guidance and does not consider your personal objectives, financial situation or needs, and does not recommend any specific financial product. It's designed to help you understand your options and have a more informed conversation. Before making a financial decision you should consider getting personal advice from a licensed financial adviser.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function FaqPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <Link href="/" className="text-sm font-medium text-muted hover:text-white">← Back to the planner</Link>

      <header className="mt-6">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">Retirement &amp; super</p>
        <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Australian retirement &amp; super FAQ</h1>
        <p className="mt-3 text-muted">
          Plain-English answers to the questions people ask most about retiring in Australia — how much
          super you need, when you can access it, and how the Age Pension fits in. General information
          only, not financial advice. To see the numbers for your own situation, use the{" "}
          <Link href="/" className="text-accent hover:underline">free planner</Link>.
        </p>
      </header>

      <div className="mt-8 space-y-4">
        {FAQS.map((f) => (
          <section key={f.q} className="rounded-2xl border border-line bg-panel p-6">
            <h2 className="text-lg font-semibold text-white">{f.q}</h2>
            <p className="mt-2 leading-relaxed text-slate-300">{f.a}</p>
          </section>
        ))}
      </div>

      <div className="mt-10 rounded-2xl border border-accent/30 bg-accent/10 p-6 text-center">
        <h2 className="text-xl font-bold text-white">See your own numbers</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300">
          Model your super, the Age Pension and how long your money lasts — in today&apos;s dollars,
          using current rules. Free, no sign-up needed to start.
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
