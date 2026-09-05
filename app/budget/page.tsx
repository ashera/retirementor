import Link from "next/link";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/seo";
import BudgetQuestStandalone from "@/components/BudgetQuestStandalone";
import Bert from "@/components/Bert";

const title = "Budget Quest — retirement budget game (Australia)";
const description =
  "Design the retirement lifestyle you want and watch whether your money can carry it. A free, Bert-guided retirement-budget game using the ASFA Retirement Standard and a real projection — no sign-up.";

export const metadata: Metadata = {
  title: `${title} — RetireWiz`,
  description,
  alternates: { canonical: `${SITE_URL}/budget` },
  openGraph: { title, description, url: `${SITE_URL}/budget`, type: "website" },
};

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Budget Quest — retirement budget game",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    url: `${SITE_URL}/budget`,
    description,
    inLanguage: "en-AU",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "AUD" },
  },
  breadcrumbLd([
    { name: "Home", path: "/" },
    { name: "Budget Quest", path: "/budget" },
  ]),
];

export default function BudgetPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <Link href="/" className="font-medium hover:text-white">← RetireWiz</Link>
        <span aria-hidden>·</span>
        <span className="text-accent">Budget Quest</span>
      </div>

      <header className="mt-5 flex items-start justify-between gap-5">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            Budget Quest <span aria-hidden>🎮</span>
          </h1>
          <p className="mt-3 text-lg leading-relaxed text-slate-300">
            Design the retirement you want — travel, dining, the lot — and watch, live, whether your money can carry it.
            The win isn&apos;t spending the most; it&apos;s a life you love that <em>lasts</em>. Bert&apos;s your guide.
          </p>
        </div>
        <Bert pose="violin" size={104} className="hidden shrink-0 sm:block" />
      </header>

      <div className="mt-8">
        <BudgetQuestStandalone />
      </div>

      <section className="mt-12">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-accent">How it works</h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-300">
          <p>
            Every dollar you move does two things: it changes your <strong className="text-white">lifestyle tier</strong> —
            from below-modest up to premium, against the <strong className="text-white">ASFA Retirement Standard</strong> —
            and it swings the <strong className="text-white">&ldquo;will it last?&rdquo; gauge</strong>, a real projection of
            how long your money holds and how confident that is across thousands of market scenarios.
          </p>
          <p>
            It&apos;s a quick, standalone check. To see the same budget inside your whole plan — with tax, the Age Pension,
            part-time work, downsizing and more — hand it off to the free planner.
          </p>
        </div>
        <div className="mt-4">
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110">
            Open the full planner <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
