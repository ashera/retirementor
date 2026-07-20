import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getActiveConfig } from "@/lib/refdata";
import { runStressTest } from "@/lib/au/stresstest";
import { essentialsFloor } from "@/lib/au/strategies";
import { DEMO_SCENARIOS } from "@/lib/au/scenarios/demoScenarios";
import { DEFAULT_PLAN, type RetirementPlan } from "@/lib/au/types";
import { fmtCurrency } from "@/lib/au/format";
import { SITE_URL } from "@/lib/site";
import { caseStudyBySlug } from "@/lib/caseStudies";

export const revalidate = 3600; // marketing content — recompute at most hourly

const SLUG = "retiring-into-a-market-crash";
const SCENARIO = "retire-52-sequence-risk";
const meta = caseStudyBySlug(SLUG)!;

export const metadata: Metadata = {
  title: `${meta.title} — RetireWiz`,
  description: meta.dek,
  alternates: { canonical: `${SITE_URL}/case-studies/${SLUG}` },
  openGraph: { title: meta.title, description: meta.dek, url: `${SITE_URL}/case-studies/${SLUG}`, type: "article" },
};

const tone = (survived: number, total: number) =>
  survived === total ? "emerald" : survived >= Math.ceil(total * 0.6) ? "amber" : "red";
const toneBar = { emerald: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500" } as const;
const toneText = { emerald: "text-emerald-400", amber: "text-amber-400", red: "text-red-400" } as const;

export default async function StressTestCaseStudy() {
  if (!meta) notFound();
  const config = await getActiveConfig();
  const s = DEMO_SCENARIOS.find((x) => x.slug === SCENARIO);
  if (!s) notFound();
  const plan: RetirementPlan = { ...DEFAULT_PLAN, ...s.data };

  const fixed = runStressTest({ ...plan, guardrails: undefined }, config);
  const flex = runStressTest({ ...plan, guardrails: plan.guardrails ?? {} }, config);
  const total = fixed.total;
  const uplift = flex.survived - fixed.survived;

  const spend = plan.spendingMode === "stages" ? plan.spendingStages.goGo : plan.targetSpending;
  const ess = essentialsFloor(plan, config);
  const survivedAt = (floorPct: number) => runStressTest({ ...plan, guardrails: { floorPct } }, config).survived;

  // The flexibility ladder, ordered by how deep you'd actually cut — least to most.
  const ladder = [
    { label: "You won't cut", note: "hold your spending", floor: spend, survived: fixed.survived },
    { label: "Cut ~10%", note: "a modest trim", floor: Math.max(ess, Math.round(0.9 * spend)), survived: survivedAt(90) },
    { label: "Cut ~20%", note: "a real belt-tightening", floor: Math.max(ess, Math.round(0.8 * spend)), survived: survivedAt(80) },
    { label: "Cut to the bone", note: "down to essentials", floor: ess, survived: survivedAt(0) },
  ];

  // The era where flexing demanded the deepest cut — the honest cost.
  const worst = flex.eras.filter((e) => e.cutYears > 0).sort((a, b) => b.deepestCutPct - a.deepestCutPct)[0] ?? null;

  const Scorecard = ({ label, r, blurb }: { label: string; r: typeof fixed; blurb: string }) => {
    const t = tone(r.survived, r.total);
    return (
      <div className="rounded-xl border border-line bg-panel p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-semibold text-white">{label}</h3>
          <span className={`text-2xl font-bold ${toneText[t]}`}>
            {r.survived}
            <span className="text-base font-medium text-muted">/{r.total}</span>
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">{blurb}</p>
        <div className="mt-3 flex gap-1" aria-hidden>
          {r.eras.map((e) => (
            <span
              key={e.id}
              title={`${e.label} — ${e.lasts ? "lasts" : e.recovered ? "short spell, recovers" : "runs out"}`}
              className={`h-2 flex-1 rounded-full ${e.lasts ? "bg-emerald-500" : e.recovered ? "bg-amber-500/70" : "bg-red-500"}`}
            />
          ))}
        </div>
      </div>
    );
  };

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
          A &ldquo;my money lasts to 90&rdquo; projection is a single smooth line — one average return, every year.
          The real danger to a retirement isn&apos;t the average; it&apos;s the <strong className="text-white">order</strong> of
          returns. A crash in your first years of drawdown, while you&apos;re selling to fund your living, does damage a
          later crash never could. That&apos;s <strong className="text-white">sequence-of-returns risk</strong>, and a Monte
          Carlo success rate blurs it into a percentage.
        </p>
        <p>
          So we did something more visceral: we took one plan and replayed it against <em>every</em> major market crash
          of the last century — 1929, 1937, 1966, 1973, the dot-com bust, the GFC, 2022 — using the{" "}
          <strong className="text-white">actual year-by-year returns as they happened</strong>, starting from the moment
          of retirement. The plan: retire at 52 on $1.05M ($600k super + $450k outside), spending {fmtCurrency(spend)} a
          year — a textbook comfortable early retirement. On the smooth projection, it lasts.
        </p>
        <p className="rounded-lg border border-line bg-panel-2 p-4 text-sm text-muted">
          <strong className="text-slate-300">How to read this.</strong> Each dash below is one historical era. Green = the
          money still lasts to 90; amber = a short funding gap early on that then recovers; red = it runs out. Every era
          replays its real returns (1928–2025 market history, a proxy for a globally diversified portfolio) from the
          retirement year, on current AU rules, in today&apos;s dollars.
        </p>
      </div>

      <div className="my-10 h-px bg-line" />

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white">Fixed spending: it breaks more often than it holds</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          Keep spending your {fmtCurrency(spend)} through thick and thin, and this &ldquo;comfortable&rdquo; plan survives
          only {fixed.survived} of the {total} downturns. Retiring into a bad decade drains the pot before it can recover.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Scorecard
            label="Fixed spending"
            r={fixed}
            blurb={`Survives ${fixed.survived} of ${total}. A crash at the start, with no adjustment, is what breaks it.`}
          />
          <Scorecard
            label="Flexible spending (guardrails)"
            r={flex}
            blurb={`Survives ${flex.survived} of ${total} — flexing spend down in the bad years rescues ${uplift} more.`}
          />
        </div>
        {worst && (
          <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-4 text-sm text-amber-300/90">
            <strong className="text-amber-200">The catch.</strong> &ldquo;Flexible&rdquo; only works if you actually make
            the cuts — and they&apos;re deeper and longer than people picture. In the worst run ({worst.label}), holding on
            meant spending below plan for {worst.cutYears} years, bottoming at {fmtCurrency(Math.round(worst.minLivingSpend))}{" "}
            (−{Math.round(worst.deepestCutPct)}%). That&apos;s not a blip — it&apos;s most of your retirement.
          </p>
        )}
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white">How flexible would you really be?</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          This is the part a success rate can&apos;t show. &ldquo;Survives&rdquo; assumes you&apos;ll cut on cue. The less
          you&apos;d actually cut in a downturn, the fewer eras you get through — your safety rests on a behaviour, not a
          number.
        </p>
        <div className="space-y-3 rounded-xl border border-line bg-panel p-5">
          {ladder.map((row) => {
            const t = tone(row.survived, total);
            return (
              <div key={row.label} className="flex items-center gap-3">
                <div className="w-40 shrink-0">
                  <div className="text-sm font-medium text-white">{row.label}</div>
                  <div className="text-xs text-muted">
                    {fmtCurrency(row.floor)}/yr · {row.note}
                  </div>
                </div>
                <div className="relative h-6 flex-1 overflow-hidden rounded bg-panel-2">
                  <div className={`h-full rounded ${toneBar[t]}`} style={{ width: `${(row.survived / total) * 100}%` }} />
                </div>
                <span className={`w-12 shrink-0 text-right text-sm font-bold tabular-nums ${toneText[t]}`}>
                  {row.survived}/{total}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-slate-300">
          From <strong className="text-white">{ladder[0].survived}/{total}</strong> if you hold your spending to{" "}
          <strong className="text-white">{ladder[ladder.length - 1].survived}/{total}</strong> if you&apos;d cut all the way
          to essentials — that gap is how much of your &ldquo;safe&rdquo; retirement is really a bet on your own willingness
          to slash spending, for years, at the exact moment you feel poorest.
        </p>
      </section>

      <section className="rounded-xl border border-line bg-panel p-6">
        <h2 className="text-lg font-semibold text-white">The takeaway</h2>
        <p className="mt-2 text-slate-300">
          Two risks hide behind a tidy projection. <strong className="text-white">Sequence risk</strong> — retiring into a
          crash is far more dangerous than the same crash a decade later. And <strong className="text-white">adherence
          risk</strong> — flexible spending genuinely helps, but only to the extent you&apos;d truly make the cuts. Neither
          shows up in a single &ldquo;lasts to 90&rdquo; line. A stress test against real history does.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={`/scenario/${SCENARIO}/stress-test`}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:opacity-90"
          >
            Run this stress test →
          </Link>
          <Link
            href="/stress-test"
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-slate-200 transition hover:text-white"
          >
            Stress-test your own plan
          </Link>
          <Link
            href="/case-studies"
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-slate-200 transition hover:text-white"
          >
            More case studies
          </Link>
        </div>
      </section>

      <p className="mt-8 text-xs text-muted">
        General information only — not financial advice. Figures are estimates in today&apos;s dollars based on the stated
        assumptions and current FY rules; historical returns are used as a proxy and are not a prediction. Past
        performance is not a guarantee of future outcomes.
      </p>
    </main>
  );
}
