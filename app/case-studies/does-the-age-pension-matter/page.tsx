import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getActiveConfig } from "@/lib/refdata";
import { runMonteCarlo } from "@/lib/au/montecarlo";
import { DEMO_SCENARIOS } from "@/lib/au/scenarios/demoScenarios";
import { DEFAULT_PLAN, type RetirementPlan } from "@/lib/au/types";
import type { EngineConfig } from "@/lib/au/config";
import { SITE_URL } from "@/lib/site";
import { caseStudyBySlug } from "@/lib/caseStudies";

export const revalidate = 3600; // marketing content — recompute at most hourly

const meta = caseStudyBySlug("does-the-age-pension-matter")!;
export const metadata: Metadata = {
  title: `${meta.title} — RetireWiz`,
  description: meta.dek,
  alternates: { canonical: `${SITE_URL}/case-studies/${meta.slug}` },
  openGraph: { title: meta.title, description: meta.dek, url: `${SITE_URL}/case-studies/${meta.slug}`, type: "article" },
};

interface Row {
  slug: string;
  label: string;
  sub: string;
  group: "ordinary" | "wealthy";
}
const ROWS: Row[] = [
  { slug: "retire-55-single", label: "Single, retire at 55", sub: "$750k ($500k super + $250k outside) · $42k a year", group: "ordinary" },
  { slug: "retire-55-couple", label: "Couple, retire at 55", sub: "$1.1M ($750k super + $350k outside) · $60k a year", group: "ordinary" },
  { slug: "fire-at-45", label: "Single, retire at 45 — modest spend", sub: "$1M ($400k super + $600k outside) · $40k a year", group: "wealthy" },
  { slug: "fire-at-45-high-spend", label: "Single, retire at 45 — high spend", sub: "$2M ($500k super + $1.5M outside) · $80k a year", group: "wealthy" },
];

function planFor(slug: string): RetirementPlan {
  const s = DEMO_SCENARIOS.find((x) => x.slug === slug);
  if (!s) throw new Error(`missing demo scenario ${slug}`);
  return { ...DEFAULT_PLAN, ...s.data };
}
function pensionOff(config: EngineConfig): EngineConfig {
  return {
    ...config,
    agePension: {
      ...config.agePension,
      single: { ...config.agePension.single, maxAnnual: 0 },
      couple: { ...config.agePension.couple, maxAnnual: 0 },
    },
  };
}

function Bar({ label, value, tone }: { label: string; value: number; tone: "with" | "without" }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-xs text-muted">{label}</span>
      <div className="relative h-6 flex-1 overflow-hidden rounded bg-panel-2">
        <div className={`h-full rounded ${tone === "with" ? "bg-accent" : "bg-rose-500/60"}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-white">{value}%</span>
    </div>
  );
}

export default async function AgePensionCaseStudy() {
  if (!meta) notFound();
  const config = await getActiveConfig();
  const noPension = pensionOff(config);
  const mc = { iterations: 1500, seed: 0x9e3779b9 } as const;

  const results = ROWS.map((r) => {
    const plan = planFor(r.slug);
    const withP = Math.round(runMonteCarlo(plan, config, mc).successRate * 100);
    const withoutP = Math.round(runMonteCarlo(plan, noPension, mc).successRate * 100);
    return { ...r, withP, withoutP, uplift: withP - withoutP };
  });
  const ordinary = results.filter((r) => r.group === "ordinary");
  const wealthy = results.filter((r) => r.group === "wealthy");

  const Section = ({ heading, blurb, rows }: { heading: string; blurb: string; rows: typeof results }) => (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-white">{heading}</h2>
      <p className="mb-4 mt-1 text-sm text-muted">{blurb}</p>
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.slug} className="rounded-xl border border-line bg-panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">{r.label}</h3>
                <p className="text-xs text-muted">{r.sub}</p>
              </div>
              <span className="shrink-0 whitespace-nowrap rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
                +{r.uplift} pts
              </span>
            </div>
            <div className="mt-4 space-y-2">
              <Bar label="With Age Pension" value={r.withP} tone="with" />
              <Bar label="Without it" value={r.withoutP} tone="without" />
            </div>
            <Link href={`/scenario/${r.slug}`} className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
              Explore this scenario →
            </Link>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <div className="mb-6 text-sm">
        <Link href="/case-studies" className="text-muted hover:text-white">← Case studies</Link>
      </div>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-white sm:text-3xl">{meta.title}</h1>
        <p className="mt-3 text-lg text-slate-300">{meta.dek}</p>
      </header>

      <div className="space-y-4 text-slate-300">
        <p>
          There&apos;s a recurring argument in retirement circles: is the Age Pension a genuine pillar of your plan, or a
          rounding error you should ignore and just self-fund? People talk straight past each other — so we modelled four
          plans the same way and switched the Age Pension off in each. The disagreement dissolves: its importance depends
          almost entirely on how wealthy you are and how much you spend.
        </p>
        <p className="rounded-lg border border-line bg-panel-2 p-4 text-sm text-muted">
          <strong className="text-slate-300">How to read this.</strong> Each bar is the chance the money lasts to age 90
          across thousands of market scenarios (a Monte Carlo that block-resamples real 1928–2025 return sequences),
          on current AU rules — the means-tested Age Pension, super preservation rules, tax and fees, in today&apos;s
          dollars. The only thing changed between the two bars is whether the Age Pension is switched on.
        </p>
      </div>

      <div className="my-10 h-px bg-line" />

      <Section
        heading="Ordinary retirees — the pension is the backbone"
        blurb="Realistic 'good saver' balances. Strip out the Age Pension and these plans fall apart — it does most of the heavy lifting."
        rows={ordinary}
      />
      <Section
        heading="High-net-worth early retirees — the pension barely moves the needle"
        blurb="The FIRE end of the spectrum. Retiring very early on a large portfolio, the means test tapers the pension away, so removing it changes little."
        rows={wealthy}
      />

      <section className="rounded-xl border border-line bg-panel p-6">
        <h2 className="text-lg font-semibold text-white">The takeaway</h2>
        <p className="mt-2 text-slate-300">
          Both camps are right — about different people. For a normal retiree the means-tested Age Pension is the
          backbone of the plan; ignore it (as many calculators do) and you&apos;ll wildly over-save or scare yourself out
          of retiring. For a high-spend millionaire it&apos;s tapered away and barely registers. What actually decides it
          is your assets and how much you spend — not a blanket rule.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:opacity-90">
            Model your own retirement →
          </Link>
          <Link href="/case-studies" className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-slate-200 transition hover:text-white">
            More case studies
          </Link>
        </div>
      </section>

      <p className="mt-8 text-xs text-muted">
        General information only — not financial advice. Figures are estimates in today&apos;s dollars based on the
        stated assumptions and current FY rules, not a guarantee of future outcomes.
      </p>
    </main>
  );
}
