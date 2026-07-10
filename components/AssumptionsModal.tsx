"use client";

import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan } from "@/lib/au/types";
import { fmtCurrency } from "@/lib/au/format";
import { MC_CONFIDENCE_TARGET, MC_CONFIDENCE_MC } from "@/lib/au/montecarlo";

const pct = (x: number, dp = 1) => `${x.toFixed(dp)}%`;

/**
 * The concrete modelling assumptions behind every strategy outcome — pulled live
 * from the user's plan and the active reference data, so users can see exactly
 * what the numbers rest on. Not the qualitative compliance disclosure (that's the
 * separate Assumptions & limitations dialog).
 */
export default function AssumptionsModal({
  open,
  onClose,
  config,
  plan,
}: {
  open: boolean;
  onClose: () => void;
  config: EngineConfig;
  plan: RetirementPlan;
}) {
  if (!open) return null;

  const hh = plan.household === "couple" ? "couple" : "single";
  const ap = config.agePension[hh];
  const wageGrowth = plan.inflation + (config.livingStandardsGrowthPct ?? 0);
  const homeGrowth = plan.home?.growthReal ?? 2;
  const bands = config.minDrawdownBands
    .map((b) => (b.minAge === 0 ? `${Math.round(b.rate * 100)}% under 65` : `${Math.round(b.rate * 100)}% from ${b.minAge}`))
    .join(", ");

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-muted">{label}</span>
      <span className="shrink-0 text-right font-medium text-slate-200 tabular-nums">{value}</span>
    </div>
  );
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">{title}</h3>
      <div className="text-xs">{children}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2">
            <span aria-hidden>🔍</span>
            <h2 className="text-lg font-bold text-white">The assumptions behind these numbers</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted transition hover:bg-panel-2 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-slate-300">
          <p className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs text-slate-300">
            Every figure is in <strong className="text-white">today&apos;s dollars</strong>. Balances are deflated in two
            stages (RG 276): by wage growth while you&apos;re working, then by CPI in retirement. These are the current{" "}
            <strong className="text-white">FY{config.financialYear}</strong> reference figures.
          </p>

          <Section title="Economic">
            <Row label="Investment return (before fees)" value={pct(plan.investmentReturn)} />
            <Row label="Return volatility (for the likelihood)" value={pct(plan.returnVolatility)} />
            <Row label="Inflation (CPI, in retirement)" value={pct(plan.inflation)} />
            <Row label={`Wage growth (pre-retirement = CPI + ${pct(config.livingStandardsGrowthPct ?? 0)})`} value={pct(wageGrowth)} />
          </Section>

          <Section title="Super">
            <Row label="Super Guarantee (employer)" value={pct(config.sgRate * 100)} />
            <Row label="Contributions tax" value={`${pct(config.contributionsTax * 100, 0)} (+${pct(config.div293ExtraTaxRate * 100, 0)} Div 293 over ${fmtCurrency(config.div293Threshold)})`} />
            <Row label="Concessional cap" value={`${fmtCurrency(config.concessionalCap)}/yr`} />
            <Row label="Non-concessional cap" value={`${fmtCurrency(config.nonConcessionalCap)}/yr`} />
            <Row label="Earnings tax" value={`${pct(config.superEarningsTaxAccumulation * 100, 0)} accumulation · 0% pension phase`} />
            <Row label="Fees" value={`${pct(config.fees.adminInvestmentPct)} + ${fmtCurrency(config.fees.fixedAdminAnnual)} admin + ${fmtCurrency(config.fees.insuranceAnnual)} insurance /yr`} />
            <Row label="Preservation age (can access super)" value={`${config.preservationAge}`} />
          </Section>

          <Section title={`Age Pension (${hh})`}>
            <Row label="Age Pension age" value={`${config.agePensionAge}`} />
            <Row label="Maximum rate" value={`${fmtCurrency(Math.round(ap.maxAnnual))}/yr`} />
            <Row label="Income test: free area / taper" value={`${fmtCurrency(Math.round(ap.incomeFreeAreaAnnual))}/yr · ${Math.round(config.agePension.incomeTaperPerDollar * 100)}c per $1 over`} />
            <Row label="Assets free area (homeowner / renter)" value={`${fmtCurrency(ap.assetsFreeArea.homeowner)} / ${fmtCurrency(ap.assetsFreeArea.nonHomeowner)}`} />
            <Row label="Assets test taper" value={`${fmtCurrency(Math.round(config.agePension.assetsTaperPerDollar * 1000))}/yr per $1,000 over`} />
            <Row label="Deeming (below / above threshold)" value={`${pct(config.deeming.lowerRate * 100)} / ${pct(config.deeming.upperRate * 100)} over ${fmtCurrency(config.deeming.threshold[hh])}`} />
          </Section>

          <Section title="Likelihood (Monte Carlo)">
            <Row label="&lsquo;Likely to last&rsquo; / prudent spend bar" value={`${Math.round(MC_CONFIDENCE_TARGET * 100)}% of runs succeed`} />
            <Row label="Simulation runs" value={`${MC_CONFIDENCE_MC.iterations.toLocaleString()} random return paths`} />
            <p className="mt-1 text-[11px] text-muted">
              The chart and the lever amounts use the central (average-return) projection; the likelihood % allows for
              market ups and downs.
            </p>
          </Section>

          <Section title="Strategy specifics">
            <Row label="Home capital growth (real)" value={`${pct(homeGrowth)}/yr`} />
            <Row label="Downsizer contribution cap" value={`${fmtCurrency(300_000)} per person`} />
            <Row label="Work Bonus (income-test exemption)" value={`${fmtCurrency(7_800)}/yr per person`} />
            <div className="py-1">
              <span className="text-muted">Minimum super drawdown</span>
              <span className="mt-0.5 block font-medium text-slate-200">{bands}</span>
            </div>
          </Section>

          <p className="text-[11px] text-muted">
            Educational estimates only, not personal financial advice. See <strong>Assumptions &amp; limitations</strong> on
            the planner dashboard for the full disclosures, sources and caveats.
          </p>
        </div>

        <div className="flex items-center justify-end border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
