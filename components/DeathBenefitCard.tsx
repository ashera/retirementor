"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { fmtCurrency } from "@/lib/au/format";
import { simulate } from "@/lib/au/simulate";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan, SimResult } from "@/lib/au/types";
import DeathBenefitWorkingsModal from "@/components/DeathBenefitWorkingsModal";

type Beneficiary = "non-dependant" | "dependant";

// "Tax my beneficiaries would pay when I die" — a snapshot at the planning age (the
// projection horizon / life expectancy). Super splits into a tax-free component (from
// non-concessional contributions) and a taxable component (concessional + earnings);
// left to a NON-dependant (adult children) the taxable component is taxed ~15%+Medicare,
// tax-free to a spouse/dependant. General information, not advice.
export default function DeathBenefitCard({
  plan,
  result,
  config,
  whatIfHref,
  onBeneficiaryChange,
}: {
  plan: RetirementPlan;
  result: SimResult;
  config: EngineConfig;
  whatIfHref: string;
  onBeneficiaryChange: (b: Beneficiary) => void;
}) {
  const [workings, setWorkings] = useState(false);

  // If a cash-out recontribution strategy is active, how much death-benefit tax it saves
  // vs the same plan without it (one extra deterministic sim). Declared BEFORE the early
  // returns below so the hook order is stable.
  const reconSaving = useMemo(() => {
    if (plan.recontribute?.source !== "super") return 0;
    const withRows = result.rows;
    const withTax = withRows.length ? withRows[withRows.length - 1].breakdown.deathBenefitTax ?? 0 : 0;
    const withoutRows = simulate({ ...plan, recontribute: undefined }, config).rows;
    const withoutTax = withoutRows.length ? withoutRows[withoutRows.length - 1].breakdown.deathBenefitTax ?? 0 : 0;
    return Math.max(0, withoutTax - withTax);
  }, [plan, config, result]);

  const rows = result.rows;
  const horizon = rows[rows.length - 1];
  if (!horizon) return null;
  const b = horizon.breakdown;

  // Only worth showing if there is super in the plan at some point.
  const peakSuper = Math.max(0, ...rows.map((r) => r.breakdown.closingSuper));
  if (peakSuper < 1_000) return null;

  const beneficiary: Beneficiary = plan.superBeneficiary === "dependant" ? "dependant" : "non-dependant";
  const superAt = Math.max(0, b.closingSuper);
  const taxFree = Math.max(0, b.superTaxFree ?? 0);
  const taxable = Math.max(0, b.superTaxable ?? 0);
  const tax = Math.max(0, b.deathBenefitTax ?? 0);
  const kept = Math.max(0, superAt - tax); // what beneficiaries actually receive from super
  const depleted = superAt < 1_000;
  const age = horizon.age;
  const rate = (config.superDeathBenefit.taxedElementRatePct + config.superDeathBenefit.medicareLevyPct);

  const pctOf = (x: number) => (superAt > 0 ? (x / superAt) * 100 : 0);

  return (
    <div id="death-benefit" className="mt-4 scroll-mt-6 rounded-2xl border border-line bg-panel p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 text-[13px] font-bold uppercase tracking-[0.22em] text-slate-300">
            Estate
          </div>
          <h2 className="font-semibold text-white">Tax my beneficiaries would pay when I die</h2>
          <p className="mt-1 text-xs text-muted">
            If you died at {age} (your planning age), leaving your super to&hellip;
          </p>
        </div>
        {/* Beneficiary toggle — persists to the plan (a core fact, not a what-if). */}
        <div className="flex shrink-0 rounded-lg border border-line bg-panel-2 p-0.5 text-xs font-medium">
          {(["non-dependant", "dependant"] as const).map((who) => (
            <button
              key={who}
              type="button"
              onClick={() => onBeneficiaryChange(who)}
              className={`rounded-md px-2.5 py-1 transition ${
                beneficiary === who ? "bg-accent/20 text-accent" : "text-muted hover:text-slate-200"
              }`}
            >
              {who === "non-dependant" ? "Adult children" : "Spouse"}
            </button>
          ))}
        </div>
      </div>

      {depleted ? (
        <div className="rounded-xl border border-line bg-panel-2 p-4 text-sm text-slate-300">
          Your super is projected to run out
          {result.depletedAge != null ? <> by age <strong className="text-white">{result.depletedAge}</strong></> : null} — so
          there would be no super left to tax on death. Your other assets pass to your estate without this tax.
        </div>
      ) : (
        <>
          {/* The bar: your super at the planning age, split by component. */}
          <div className="rounded-xl border border-line bg-panel-2 p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-medium text-muted">Your super at {age}</span>
              <span className="text-sm font-bold tabular-nums text-white">{fmtCurrency(Math.round(superAt))}</span>
            </div>
            <div className="flex h-9 w-full overflow-hidden rounded-md" role="img" aria-label="Super split into tax-free and taxable components">
              {taxFree > 0 && (
                <div className="flex items-center justify-center bg-emerald-400/80" style={{ width: `${pctOf(taxFree)}%` }} title={`Tax-free component ${fmtCurrency(Math.round(taxFree))}`} />
              )}
              {kept - taxFree > 0 && (
                <div className="flex items-center justify-center bg-amber-400/60" style={{ width: `${pctOf(Math.max(0, kept - taxFree))}%` }} title={`Taxable component kept by beneficiaries`} />
              )}
              {tax > 0 && (
                <div className="flex items-center justify-center bg-rose-500/85" style={{ width: `${pctOf(tax)}%` }} title={`Death-benefit tax ${fmtCurrency(Math.round(tax))}`} />
              )}
            </div>
            {/* Legend */}
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              <Legend color="bg-emerald-400/80" label="Tax-free component" value={taxFree} muted={`${Math.round(pctOf(taxFree))}%`} />
              <Legend color="bg-amber-400/60" label="Taxable component" value={taxable} muted={`${Math.round(pctOf(taxable))}%`} />
              {tax > 0 && <Legend color="bg-rose-500/85" label={`Death-benefit tax (${rate}%)`} value={tax} />}
            </div>
          </div>

          {/* Headline figures */}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-rose-400/25 bg-panel-2 p-4">
              <div className="text-xs font-medium text-muted">Tax your beneficiaries pay</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-rose-300">
                {tax > 0 ? <>≈ {fmtCurrency(Math.round(tax))}</> : "$0"}
              </div>
              {beneficiary === "dependant" && (
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  Tax-free to a spouse/dependant. It can be taxed later when it passes from them to a non-dependant.
                </p>
              )}
              {reconSaving >= 500 && (
                <p className="mt-1.5 flex items-start gap-1 text-[11px] leading-relaxed text-accent">
                  <span aria-hidden>↓</span>
                  <span>
                    Your recontribution strategy has saved your beneficiaries ≈{fmtCurrency(Math.round(reconSaving))} in tax.
                  </span>
                </p>
              )}
            </div>
            <div className="rounded-xl border border-line bg-panel-2 p-4">
              <div className="text-xs font-medium text-muted">Your beneficiaries receive</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-white">≈ {fmtCurrency(Math.round(kept))}</div>
              <p className="mt-1 text-[11px] text-muted">of super</p>
            </div>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-muted">
            Your savings and home pass to your estate without this tax — it applies only to the taxable component of super.
            {tax > 0 && beneficiary === "non-dependant" && reconSaving < 500 && (
              <>
                {" "}
                <Link href={whatIfHref} className="font-medium text-accent hover:underline">
                  A recontribution strategy could reduce this →
                </Link>
              </>
            )}
            {reconSaving >= 500 && (
              <>
                {" "}
                <Link href={whatIfHref} className="font-medium text-accent hover:underline">
                  Adjust it in What-If →
                </Link>
              </>
            )}
          </p>
        </>
      )}

      <button
        type="button"
        onClick={() => setWorkings(true)}
        className="mt-3 text-[11px] font-medium text-accent hover:underline"
      >
        How it&apos;s worked out →
      </button>

      {workings && (
        <DeathBenefitWorkingsModal plan={plan} breakdown={b} config={config} age={age} onClose={() => setWorkings(false)} />
      )}
    </div>
  );
}

function Legend({ color, label, value, muted }: { color: string; label: string; value: number; muted?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted">
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm ${color}`} />
      <span className="text-slate-300">{label}</span>
      <span className="tabular-nums text-slate-400">{fmtCurrency(Math.round(value))}</span>
      {muted && <span className="text-muted/70">· {muted}</span>}
    </span>
  );
}
