"use client";

import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan } from "@/lib/au/types";
import { fmtCurrency } from "@/lib/au/format";
import { MC_CONFIDENCE_TARGET, MC_CONFIDENCE_MC } from "@/lib/au/montecarlo";

const pct = (x: number, dp = 1) => `${x.toFixed(dp)}%`;

interface Row {
  label: string;
  value: string;
}

/** The specific modelling assumptions each strategy leans on — a focused subset
 *  of the full set, pulled live from the plan + reference data. */
function strategyRows(id: string, config: EngineConfig, plan: RetirementPlan): Row[] {
  const hh = plan.household === "couple" ? "couple" : "single";
  const ap = config.agePension[hh];
  const homeGrowth = plan.home?.growthReal ?? 2;

  if (id === "downsize")
    return [
      { label: "Home capital growth (real)", value: `${pct(homeGrowth)}/yr, in today's dollars` },
      { label: "Your home", value: "Exempt from the Age Pension assets test" },
      { label: "Downsizer contribution cap", value: `${fmtCurrency(300_000)} per person` },
      { label: "Equity freed", value: "Grown home value − mortgage payoff − new home cost" },
    ];
  if (id === "sell-and-rent")
    return [
      { label: "Home capital growth (real)", value: `${pct(homeGrowth)}/yr` },
      { label: "Assets free area (homeowner → renter)", value: `${fmtCurrency(ap.assetsFreeArea.homeowner)} → ${fmtCurrency(ap.assetsFreeArea.nonHomeowner)}` },
      { label: "Rent", value: "Paid from your spending each year, for life" },
      { label: "Equity freed", value: "Grown home value − mortgage payoff → savings" },
    ];
  if (id === "clear-mortgage")
    return [
      { label: "Super access", value: `Tax-free to withdraw from age ${config.preservationAge}` },
      { label: "Mortgage cost", value: "Interest-only = balance × rate; P&I = your set repayment" },
      { label: "Age Pension", value: "Lower assessable super can lift your pension" },
    ];
  if (id.startsWith("sell-prop"))
    return [
      { label: "Capital gains tax", value: "50% discount (held > 12 months), at resident marginal rates" },
      { label: "Net proceeds", value: "Sale price − loan − CGT → savings" },
      { label: "Age Pension treatment", value: "Net equity (assets test); actual net rent, not deemed (income test)" },
    ];
  if (id === "retire-later")
    return [
      { label: "Super Guarantee (employer)", value: `${pct(config.sgRate * 100)} of salary` },
      { label: "Contributions tax", value: pct(config.contributionsTax * 100, 0) },
      { label: "Investment return (net of fees)", value: `${pct(plan.investmentReturn)}/yr` },
      { label: "Effect", value: "More years contributing, and fewer to fund" },
    ];
  if (id === "adjust-spending")
    return [
      { label: "Essentials floor", value: "Held fixed — only discretionary flexes" },
      { label: "Prudent / safe spend bar", value: `${Math.round(MC_CONFIDENCE_TARGET * 100)}% Monte Carlo confidence (${MC_CONFIDENCE_MC.iterations} runs)` },
      { label: "Figures", value: "Today's dollars" },
    ];
  if (id === "part-time-work")
    return [
      { label: "Work Bonus (income test)", value: `First ${fmtCurrency(7_800)}/yr per person is exempt` },
      { label: "Tax on the income", value: "Senior (SAPTO) rate; Medicare levy ignored" },
      { label: "Effect", value: "Offsets your drawdown; no extra super (no SG modelled on it)" },
    ];
  if (id === "salary-sacrifice")
    return [
      { label: "Contributions tax", value: `${pct(config.contributionsTax * 100, 0)} (vs your marginal rate)` },
      { label: "Concessional cap (incl. SG)", value: `${fmtCurrency(config.concessionalCap)}/yr` },
      { label: "Division 293", value: `+${pct(config.div293ExtraTaxRate * 100, 0)} once income tops ${fmtCurrency(config.div293Threshold)}` },
      { label: "Access", value: `Locked until preservation age (${config.preservationAge})` },
    ];
  if (id === "ttr")
    return [
      { label: "The arbitrage", value: "Income tax saved − 15% contributions tax" },
      { label: "TTR pension earnings", value: "Tax-free" },
      { label: "Applies", value: `From age ${config.preservationAge} while you're still working` },
      { label: "Bounded by", value: `The concessional cap (${fmtCurrency(config.concessionalCap)}/yr)` },
    ];
  return [];
}

export default function StrategyAssumptionsModal({
  open,
  onClose,
  strategyId,
  strategyLabel,
  config,
  plan,
}: {
  open: boolean;
  onClose: () => void;
  strategyId: string | null;
  strategyLabel: string | null;
  config: EngineConfig;
  plan: RetirementPlan;
}) {
  if (!open || !strategyId) return null;
  const rows = strategyRows(strategyId, config, plan);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/whatif-icon.png" alt="" aria-hidden className="h-7 w-7 shrink-0" style={{ mixBlendMode: "lighten" }} />
            <h2 className="truncate text-base font-bold text-white">
              {strategyLabel} — assumptions
            </h2>
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

        <div className="space-y-3 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-slate-300">
          {rows.length === 0 ? (
            <p className="text-muted">This strategy uses the shared modelling assumptions — see &ldquo;the assumptions behind these numbers&rdquo; at the top of the page.</p>
          ) : (
            <div>
              {rows.map((r) => (
                <div key={r.label} className="flex flex-col gap-0.5 border-b border-line/60 py-2 last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <span className="text-xs text-muted">{r.label}</span>
                  <span className="text-xs font-medium text-slate-200 sm:text-right">{r.value}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted">
            Just what this strategy leans on — all in today&apos;s dollars (FY{config.financialYear}). For the full set
            (returns, tax, Age Pension, fees, Monte Carlo), use &ldquo;See the assumptions behind these numbers&rdquo; at
            the top of the page. Educational estimates only, not personal advice.
          </p>
        </div>

        <div className="flex items-center justify-end border-t border-line px-5 py-3">
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
