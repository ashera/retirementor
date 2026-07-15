import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getActiveConfig } from "@/lib/refdata";
import { runMonteCarlo } from "@/lib/au/montecarlo";
import { simulate } from "@/lib/au/simulate";
import { DEMO_SCENARIOS } from "@/lib/au/scenarios/demoScenarios";
import { DEFAULT_PLAN, type RetirementPlan, type Person } from "@/lib/au/types";
import type { EngineConfig } from "@/lib/au/config";
import { SITE_URL } from "@/lib/site";
import { caseStudyBySlug } from "@/lib/caseStudies";

export const revalidate = 3600;

const meta = caseStudyBySlug("will-the-cgt-changes-hurt-your-retirement")!;
export const metadata: Metadata = {
  title: `${meta.title} — RetireWiz`,
  description: meta.dek,
  alternates: { canonical: `${SITE_URL}/case-studies/${meta.slug}` },
  openGraph: { title: meta.title, description: meta.dek, url: `${SITE_URL}/case-studies/${meta.slug}`, type: "article" },
};

const P = (o: Partial<Person> = {}): Person => ({ currentAge: 52, superBalance: 400_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0, ...o });
const single = (superB: number, outside: number, age: number, spend: number): RetirementPlan => ({
  ...DEFAULT_PLAN, household: "single", superMode: "individual", people: [P({ currentAge: age, superBalance: superB })],
  homeowner: true, outsideSuper: outside, annualOutsideSavings: 0, retirementAge: age,
  spendingMode: "flat", targetSpending: spend, investmentReturn: 7, returnVolatility: 11, inflation: 2.5, lifeExpectancy: 90,
});
const demo = (slug: string): RetirementPlan => ({ ...DEFAULT_PLAN, ...DEMO_SCENARIOS.find((s) => s.slug === slug)!.data });

const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
const fmtM = (n: number) => `$${(n / 1_000_000).toFixed(n >= 1_000_000 ? 2 : 1)}M`;

export default async function CgtCaseStudy() {
  if (!meta) notFound();
  const active = await getActiveConfig();
  // Compare the two regimes head-to-head, holding every other assumption fixed.
  const now: EngineConfig = { ...active, outsideTax: { ...active.outsideTax, cgtRegime: "discount" } }; // pre-2027: 50% discount
  const post2027: EngineConfig = { ...active, outsideTax: { ...active.outsideTax, cgtRegime: "indexed" } }; // the reform: indexation + 30% min
  const mc = { iterations: 800, seed: 0x9e3779b9 } as const;
  const succ = (p: RetirementPlan, c: EngineConfig) => Math.round(runMonteCarlo(p, c, mc).successRate * 100);

  // 1. Does the money still last? (Monte Carlo success, current vs post-2027)
  const lastRows = [
    { label: "Retire 45 · $40k on $1M", plan: demo("fire-at-45") },
    { label: "Retire 45 · $80k on $2M", plan: demo("fire-at-45-high-spend") },
    { label: "Retire 52 · $70k on $1.9M", plan: single(400_000, 1_500_000, 52, 70_000) },
    { label: "Retire 60 · $55k on $1M", plan: single(500_000, 500_000, 60, 55_000) },
  ].map((r) => ({ label: r.label, now: succ(r.plan, now), post: succ(r.plan, post2027) }));

  // 2. But a big estate takes a trim (deterministic central path: lifetime outside
  //    tax + wealth left at 90).
  const wealthCase = (plan: RetirementPlan, c: EngineConfig) => {
    const rows = simulate(plan, c).rows.filter((x) => x.phase !== "accumulation");
    return {
      tax: rows.reduce((s, x) => s + x.breakdown.outsideTax, 0),
      wealth: rows[rows.length - 1].total,
    };
  };
  const wealthRows = [
    { label: "$1.5M portfolio, retire 52", plan: single(400_000, 1_500_000, 52, 70_000) },
    { label: "$4M portfolio, $180k/yr", plan: single(500_000, 4_000_000, 55, 180_000) },
  ].map((r) => {
    const a = wealthCase(r.plan, now), b = wealthCase(r.plan, post2027);
    return { label: r.label, taxNow: a.tax, taxPost: b.tax, wealthNow: a.wealth, wealthPost: b.wealth };
  });

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
          In the 2026-27 Federal Budget the government announced it will <strong className="text-white">abolish the
          50% capital gains tax discount from 1 July 2027</strong>, replacing it with CPI cost-base indexation and a
          30% minimum tax on realised gains. The main-residence exemption is untouched, and assets you already hold
          keep the discount for the gains built up before that date. Naturally, every investor is asking: does this
          wreck my retirement plan?
        </p>
        <p>
          We can answer it directly, because our engine already treats the CGT discount as a dial. Below is the same
          set of plans run under today&apos;s 50% discount and again with the discount <strong className="text-white">
          switched off</strong> — a fair proxy for the post-2027 world.
        </p>
        <p className="rounded-lg border border-line bg-panel-2 p-4 text-sm text-muted">
          <strong className="text-slate-300">How to read this.</strong> Our engine works in today&apos;s dollars, so
          taxing the whole real gain (no discount) closely mirrors the new indexation regime. It doesn&apos;t yet add
          the 30% floor — which can actually <em>raise</em> tax for a low-income retiree whose rate was below 30% — so
          treat these as a close, honest estimate rather than the exact post-2027 figure. Success = the share of market
          scenarios (real 1928–2025 sequencing) where the money reaches age 90.
        </p>
      </div>

      <div className="my-10 h-px bg-line" />

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white">1. Will your money still last? — barely a flicker</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          Chance the money reaches 90, under the 50% discount (now) vs no discount (post-2027).
        </p>
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-medium">Plan</th>
                <th className="px-4 py-2.5 text-right font-medium">Now (50%)</th>
                <th className="px-4 py-2.5 text-right font-medium">Post-2027 (0%)</th>
                <th className="px-4 py-2.5 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {lastRows.map((r) => (
                <tr key={r.label} className="border-b border-line/50 last:border-0">
                  <td className="px-4 py-2.5 text-slate-200">{r.label}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-white">{r.now}%</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-white">{r.post}%</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${r.post - r.now < 0 ? "text-amber-300" : "text-muted"}`}>
                    {r.post - r.now === 0 ? "—" : `${r.post - r.now} pts`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm text-muted">
          Why so small? A retiree&apos;s tax is dominated by the <strong className="text-slate-300">dividend yield</strong>,
          which is taxed either way; the market runs that actually threaten a plan (early crashes) leave <em>little
          capital gain to tax</em>; and modest retirees sit under the tax-free threshold regardless.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white">2. But a large estate does take a trim</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          The tax bill is real — it just isn&apos;t what decides whether you run out. Lifetime outside-super tax and
          the wealth left at 90 (today&apos;s dollars, central projection).
        </p>
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-medium">Portfolio</th>
                <th className="px-4 py-2.5 text-right font-medium">Lifetime tax: now → post</th>
                <th className="px-4 py-2.5 text-right font-medium">Wealth at 90: now → post</th>
              </tr>
            </thead>
            <tbody>
              {wealthRows.map((r) => (
                <tr key={r.label} className="border-b border-line/50 last:border-0">
                  <td className="px-4 py-2.5 text-slate-200">{r.label}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-white">
                    {fmt(r.taxNow)} → <span className="text-amber-300">{fmt(r.taxPost)}</span>
                    <span className="ml-1 text-xs text-muted">(+{Math.round((r.taxPost / r.taxNow - 1) * 100)}%)</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-white">
                    {fmtM(r.wealthNow)} → <span className="text-amber-300">{fmtM(r.wealthPost)}</span>
                    <span className="ml-1 text-xs text-muted">({Math.round((r.wealthPost / r.wealthNow - 1) * 100)}%)</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm text-muted">
          So the honest picture: a high-net-worth portfolio pays meaningfully more tax and leaves a smaller estate —
          but it was never at risk of running out, so the change is a wealth-transfer, not a threat to the retirement.
        </p>
      </section>

      <section className="rounded-xl border border-line bg-panel p-6">
        <h2 className="text-lg font-semibold text-white">The takeaway</h2>
        <p className="mt-2 text-slate-300">
          If your question is <em>&ldquo;will I run out of money?&rdquo;</em>, the 2027 CGT change barely moves the
          needle — dividends drive a retiree&apos;s tax, and the bad markets that actually sink a plan don&apos;t
          generate the gains being taxed. If your question is <em>&ldquo;how big an estate will I leave?&rdquo;</em>,
          a large personal portfolio takes a real ~4–10% haircut. Two more things worth knowing: your <strong
          className="text-white">home stays exempt</strong>, and assets you already hold are largely grandfathered on
          the gains built up before July 2027. Property investors face a bigger, separate story (negative gearing
          changes too).
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

      <div className="mt-8 text-xs text-muted">
        <p className="mb-2">
          General information only — not financial or tax advice. Figures are estimates in today&apos;s dollars from
          the stated assumptions, model the discount removal as a proxy for the full (indexation + 30%) regime, and
          are not a guarantee of future outcomes.
        </p>
        <p>
          Sources: {" "}
          <a href="https://budget.gov.au/content/04-tax-reform.htm" className="text-accent hover:underline">Budget 2026-27 — Tax reform</a>;{" "}
          <a href="https://www.ato.gov.au/about-ato/new-legislation/in-detail/individuals/tax-reform-boosting-home-ownership-reforming-negative-gearing-and-capital-gains-tax" className="text-accent hover:underline">ATO — CGT &amp; negative gearing reform</a>;{" "}
          <a href="https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/bd/bd2526/26bd067" className="text-accent hover:underline">Treasury Laws Amendment (Tax Reform No.1) Bill 2026</a>.
        </p>
      </div>
    </main>
  );
}
