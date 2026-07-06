import Link from "next/link";
import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";
import { FAQS } from "@/lib/faqContent";

export const metadata: Metadata = {
  title: "Australian retirement & super FAQ",
  description:
    "Plain-English answers to common Australian retirement questions — how much super you need, when you can access super, the Age Pension age and rates, means testing, and retiring early. General information only.",
  alternates: { canonical: "/faq" },
};

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
