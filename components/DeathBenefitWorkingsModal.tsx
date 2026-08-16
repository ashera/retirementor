"use client";

import Link from "next/link";
import { fmtCurrency } from "@/lib/au/format";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan, YearBreakdown } from "@/lib/au/types";

function Row({ label, formula, note, value, strong }: { label: string; formula?: string; note?: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 py-2 last:border-0">
      <div className="min-w-0">
        <div className={`text-sm ${strong ? "font-semibold text-white" : "text-slate-200"}`}>{label}</div>
        {formula && <div className="text-[11px] text-muted">{formula}</div>}
        {note && <div className="mt-0.5 text-[11px] leading-relaxed text-muted/75">{note}</div>}
      </div>
      <div className={`shrink-0 tabular-nums ${strong ? "font-semibold text-white" : "text-slate-100"}`}>{value}</div>
    </div>
  );
}

const TERMS: { term: string; def: string }[] = [
  { term: "Taxable component", def: "The part of your super built from concessional (pre-tax) contributions — employer SG, salary sacrifice — plus ALL fund earnings. This is what's taxed on death to a non-dependant." },
  { term: "Tax-free component", def: "The part built from non-concessional (after-tax) contributions — voluntary personal contributions, downsizer, and recontributions. Always passes tax-free." },
  { term: "Non-dependant", def: "For super death benefits: typically your adult children. They pay tax on the taxable component. Financially-dependent children, a spouse, or an ex-spouse via the estate are 'dependants' and pay nothing." },
  { term: "Recontribution", def: "Withdrawing from super after 60 (tax-free) and re-contributing it as a non-concessional contribution — converting taxable component into tax-free component, which cuts the death-benefit tax." },
];

// "How it's worked out" for the death-benefit-tax card: the component split, the rate,
// the estate, and how recontribution converts taxable -> tax-free. This scenario's real
// numbers at the planning age. General information, not advice.
export default function DeathBenefitWorkingsModal({
  plan,
  breakdown,
  config,
  age,
  onClose,
}: {
  plan: RetirementPlan;
  breakdown: YearBreakdown;
  config: EngineConfig;
  age: number;
  onClose: () => void;
}) {
  const sdb = config.superDeathBenefit;
  const dependant = plan.superBeneficiary === "dependant";
  const superAt = Math.max(0, breakdown.closingSuper);
  const taxFree = Math.max(0, breakdown.superTaxFree ?? 0);
  const taxable = Math.max(0, breakdown.superTaxable ?? 0);
  const tax = Math.max(0, breakdown.deathBenefitTax ?? 0);
  const rate = sdb.taxedElementRatePct + sdb.medicareLevyPct;
  const outside = Math.max(0, breakdown.closingOutside);
  const home = Math.max(0, breakdown.homeEquity);
  const rad = Math.max(0, breakdown.radHeld ?? 0);
  const estate = breakdown.estateValue ?? superAt - tax + outside + home + rad;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-panel p-5 shadow-2xl md:max-w-3xl">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-white">How the death-benefit tax works</h4>
          <button onClick={onClose} aria-label="Close" className="text-muted transition hover:text-white">✕</button>
        </div>
        <p className="mt-1 text-xs text-muted">
          At age {age}. Estimates in today&apos;s dollars; the tax rate is a 2026 vintage.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2 md:gap-x-5 md:[&>div]:mt-0">
          {/* 1 — the component split */}
          <div className="mt-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">1 · How your super splits</div>
            <p className="mt-1 text-xs text-muted">
              Every super account is part <span className="text-slate-200">taxable</span> and part{" "}
              <span className="text-slate-200">tax-free</span>. Only the taxable component is taxed on death to a
              non-dependant.
            </p>
            <div className="mt-2 rounded-xl border border-line bg-panel-2 p-3">
              <Row
                label="Taxable component"
                formula="concessional (pre-tax) contributions + all earnings"
                value={fmtCurrency(Math.round(taxable))}
              />
              <Row
                label="Tax-free component"
                formula="non-concessional (after-tax) contributions, downsizer, recontributions"
                value={fmtCurrency(Math.round(taxFree))}
              />
              <Row label={`Your super at ${age}`} strong formula="sum of the two components" value={fmtCurrency(Math.round(superAt))} />
            </div>
            <div className="mt-3 hidden rounded-xl border border-line bg-panel-2/50 p-3 md:block">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <span aria-hidden>💡</span> Why the taxable part grows
              </div>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted">
                <li>Most people&apos;s super is <span className="text-slate-200">mostly taxable</span> — a career of employer + salary-sacrifice contributions and decades of earnings.</li>
                <li>The mandatory minimum drawdown in retirement pulls both parts down together, so the tax-free share keeps shrinking unless you top it up.</li>
              </ul>
            </div>
          </div>

          {/* 2 — the tax */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">2 · The tax on death</div>
            <p className="mt-1 text-xs text-muted">
              Leaving super to a {dependant ? "spouse/dependant" : "non-dependant (adult children)"}:
            </p>
            <div className="mt-2 rounded-xl border border-line bg-panel-2 p-3">
              <Row label="Taxable component" value={fmtCurrency(Math.round(taxable))} />
              <Row
                label="Tax rate"
                formula={`${sdb.taxedElementRatePct}% on the taxed element + ${sdb.medicareLevyPct}% Medicare`}
                note={dependant ? "A spouse or dependant pays 0% — the whole benefit is tax-free to them." : undefined}
                value={dependant ? "0%" : `${rate}%`}
              />
              <Row
                label="Death-benefit tax"
                strong
                formula={dependant ? "tax-free to a dependant" : `${fmtCurrency(Math.round(taxable))} × ${rate}%`}
                value={fmtCurrency(Math.round(tax))}
              />
            </div>

            {/* 3 — the estate */}
            <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-accent">3 · What reaches your estate</div>
            <div className="mt-2 rounded-xl border border-line bg-panel-2 p-3">
              <Row label="Super after the tax" formula={`${fmtCurrency(Math.round(superAt))} − ${fmtCurrency(Math.round(tax))}`} value={fmtCurrency(Math.round(superAt - tax))} />
              {outside > 0 && <Row label="Savings outside super" formula="pass without this tax" value={fmtCurrency(Math.round(outside))} />}
              {home > 0 && <Row label="Home equity" formula="passes without this tax" value={fmtCurrency(Math.round(home))} />}
              {rad > 0 && <Row label="Refundable deposit (RAD)" formula="returned to your estate, net of retention" value={fmtCurrency(Math.round(rad))} />}
              <Row label="To your beneficiaries" strong value={fmtCurrency(Math.round(estate))} />
            </div>
          </div>
        </div>

        {/* 4 — the lever */}
        <div className="mt-4 rounded-xl border border-accent/25 bg-accent/5 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">4 · Cutting the tax — recontribution</div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
            After 60 you can withdraw from super tax-free and re-contribute it as a non-concessional contribution. The
            withdrawal draws the taxable and tax-free parts down together, but the money comes back <span className="text-white">100% tax-free</span> —
            so each round trip converts taxable component into tax-free component, shrinking the death-benefit tax. It&apos;s
            balance-neutral, so your projected balance doesn&apos;t change — only the tax your beneficiaries would pay.
          </p>
          <Link href="/what-if" className="mt-2 inline-block text-[11px] font-medium text-accent hover:underline">
            Try it on the What-If board →
          </Link>
        </div>

        {/* Glossary */}
        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Terms</div>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            {TERMS.map((t) => (
              <div key={t.term} className="rounded-lg border border-line bg-panel-2/50 p-2.5">
                <dt className="text-[11px] font-semibold text-slate-200">{t.term}</dt>
                <dd className="mt-0.5 text-[11px] leading-relaxed text-muted">{t.def}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-muted/75">
          General information only, not personal financial or tax advice. Super death-benefit tax depends on your fund&apos;s
          component split, who receives the benefit and how (lump sum vs income stream), and current law. Consider a licensed
          adviser before acting. See{" "}
          <Link href="/learn" className="text-accent hover:underline" target="_blank">the knowledge base</Link>.
        </p>
      </div>
    </div>
  );
}
