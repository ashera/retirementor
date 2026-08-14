"use client";

import Link from "next/link";
import { fmtCurrency } from "@/lib/au/format";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan, YearBreakdown } from "@/lib/au/types";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function Row({ label, formula, value, muted }: { label: string; formula: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 py-1.5 last:border-0">
      <div className="min-w-0">
        <div className={`text-sm ${muted ? "text-muted" : "text-slate-200"}`}>{label}</div>
        <div className="text-[11px] text-muted">{formula}</div>
      </div>
      <div className={`shrink-0 tabular-nums ${muted ? "text-muted" : "text-slate-100"}`}>{value}</div>
    </div>
  );
}

const TERMS: { term: string; def: string }[] = [
  { term: "Basic daily fee", def: "A flat everyday-living charge everyone in residential care pays — 85% of the single Age Pension. Not means-tested." },
  { term: "Hotelling", def: "A means-tested charge for 'hotel' services (meals, cleaning, laundry, heating). No cap." },
  { term: "NCCC", def: "Non-Clinical Care Contribution — a means-tested charge toward non-clinical personal care (bathing, dressing, mobility). Capped at a lifetime dollar amount or 4 years, whichever first." },
  { term: "RAD", def: "Refundable Accommodation Deposit — a lump sum for your room. Refundable to your estate, and exempt from the Age Pension assets test." },
  { term: "DAP", def: "Daily Accommodation Payment — paying for the room daily instead, as interest on the room price at the MPIR." },
  { term: "MPIR", def: "Maximum Permissible Interest Rate — the government rate that turns a room price into a DAP." },
  { term: "Means score", def: "A 0–1 measure of how much you contribute, from your assessable assets and income. 1 = the maximum means-tested charges (this version uses assets; income is added later)." },
];

// Full "how the cost is worked out" explainer for the aged-care card — the means
// score, the per-line fee arithmetic (with this scenario's real numbers), any
// probabilistic weighting, and a glossary. General information, not advice.
export default function AgedCareWorkingsModal({
  plan, breakdown, config, careAge, onClose,
}: {
  plan: RetirementPlan;
  breakdown: YearBreakdown;
  config: EngineConfig;
  careAge: number;
  onClose: () => void;
}) {
  const ac = plan.agedCare!;
  const AC = config.agedCare;
  const residential = ac.careType === "residential";

  // Reconstruct the v1 means indicator exactly as the engine did.
  const superOpen = Math.max(0, breakdown.openingSuper);
  const outsideOpen = Math.max(0, breakdown.openingOutside);
  const cappedHome = Math.min(Math.max(0, breakdown.homeValue), AC.homeValueCapMeansTest);
  const assets = superOpen + outsideOpen + cappedHome;
  const score = clamp01((assets - AC.careAssetFreeArea) / Math.max(1, AC.careAssetFullArea - AC.careAssetFreeArea));

  const full = breakdown.agedCareFull ?? breakdown.agedCareTotal ?? 0;
  const charged = breakdown.agedCareTotal ?? 0;
  const weight = full > 0 ? charged / full : 1;
  const weighted = weight < 0.999;

  const room = ac.radAmount ?? AC.radNationalAvg;
  const isLump = residential && (ac.accommodation ?? "dap") !== "dap";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-panel p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-white">How the cost is worked out</h4>
          <button onClick={onClose} aria-label="Close" className="text-muted transition hover:text-white">✕</button>
        </div>
        <p className="mt-1 text-xs text-muted">
          {residential ? "Residential care" : "At-home care"} at age {careAge}. Figures are 2026-vintage estimates in today&apos;s dollars.
        </p>

        {/* Step 1 — the means test */}
        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">1 · Your means score</div>
          <p className="mt-1 text-xs text-muted">
            The means-tested charges scale with your assessable position. This version uses assets (income is added in a
            later version).
          </p>
          <div className="mt-2 rounded-xl border border-line bg-panel-2 p-3">
            <Row label="Super (opening)" formula="assessed from Age-Pension age" value={fmtCurrency(Math.round(superOpen))} />
            <Row label="Savings outside super" formula="opening balance" value={fmtCurrency(Math.round(outsideOpen))} />
            {cappedHome > 0 && (
              <Row label="Former home (capped)" formula={`min(home value, ${fmtCurrency(AC.homeValueCapMeansTest)})`} value={fmtCurrency(Math.round(cappedHome))} />
            )}
            <Row label="Assessable assets" formula="sum of the above" value={fmtCurrency(Math.round(assets))} />
            <Row
              label="Means score"
              formula={`(assets − ${fmtCurrency(AC.careAssetFreeArea)}) ÷ (${fmtCurrency(AC.careAssetFullArea)} − ${fmtCurrency(AC.careAssetFreeArea)}), capped 0–1`}
              value={score.toFixed(2)}
            />
          </div>
        </div>

        {/* Step 2 — the fees */}
        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">2 · The annual fees</div>
          <div className="mt-2 rounded-xl border border-line bg-panel-2 p-3">
            {residential ? (
              <>
                <Row label="Basic daily fee" formula={`$${AC.basicDailyFee.toFixed(2)}/day × 365 (flat)`} value={fmtCurrency(Math.round(breakdown.agedCareBasic ?? 0))} />
                <Row label="Hotelling" formula={`$${AC.hotellingMaxDaily.toFixed(2)}/day × ${score.toFixed(2)} × 365`} value={fmtCurrency(Math.round(breakdown.agedCareHotelling ?? 0))} />
                <Row label="Care (NCCC)" formula={`$${AC.ncccMaxDaily.toFixed(2)}/day × ${score.toFixed(2)} × 365 · cap ${fmtCurrency(AC.ncccLifetimeCap)}/${AC.ncccMaxYears}yr`} value={fmtCurrency(Math.round(breakdown.agedCareNCCC ?? 0))} />
                {isLump ? (
                  <Row label="Accommodation (RAD)" formula={`${fmtCurrency(room)} lump sum — refundable, no daily charge`} value="$0" muted />
                ) : (
                  <Row label="Accommodation (DAP)" formula={`room ${fmtCurrency(room)} × MPIR ${pct(AC.mpir)}`} value={fmtCurrency(Math.round(breakdown.agedCareDAP ?? 0))} />
                )}
                {(breakdown.agedCareHomeRent ?? 0) > 0 && (
                  <Row label="Less: rent from your home" formula={`home value × ${pct(AC.formerHomeRentYieldNet)} net (assessable)`} value={`−${fmtCurrency(Math.round(breakdown.agedCareHomeRent ?? 0))}`} />
                )}
              </>
            ) : (
              <Row label="Support at Home contribution" formula={`means-tested (score ${score.toFixed(2)}); clinical care is free`} value={fmtCurrency(Math.round(full))} />
            )}
            <div className="mt-1 flex items-center justify-between border-t border-line pt-2">
              <span className="text-sm font-semibold text-white">{residential ? "Cost if you need care" : "Total"}</span>
              <span className="tabular-nums font-bold text-rose-300">{fmtCurrency(Math.round(full))}/yr</span>
            </div>
          </div>
        </div>

        {/* Step 3 — weighting (probabilistic only) */}
        {weighted && (
          <div className="mt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">3 · Weighted for the chance you need it</div>
            <div className="mt-2 rounded-xl border border-line bg-panel-2 p-3">
              <Row
                label="Expected cost this year"
                formula={`${fmtCurrency(Math.round(full))} × ${pct(weight)} (chance of care × chance still alive)`}
                value={fmtCurrency(Math.round(charged))}
              />
              <p className="mt-1 text-[11px] text-muted">
                In the &ldquo;if you need it&rdquo; framing the modelled cost is weighted by the likelihood you actually enter care and
                are still alive that year, so the deep tail is discounted. Switch to &ldquo;Assume it&rdquo; to model the full cost.
              </p>
            </div>
          </div>
        )}

        {/* Terminology */}
        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">Terminology</div>
          <dl className="mt-2 space-y-1.5">
            {TERMS.filter((t) => residential || ["Means score", "NCCC"].includes(t.term) || t.term === "Basic daily fee").map((t) => (
              <div key={t.term} className="rounded-lg border border-line bg-panel-2 px-3 py-2">
                <dt className="text-xs font-semibold text-slate-200">{t.term}</dt>
                <dd className="text-[11px] leading-relaxed text-muted">{t.def}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-muted">
          Estimates only, from a 2026 vintage of indexed rates — they don&apos;t reflect a care assessment or your circumstances.
          General information, not advice. See{" "}
          <Link href="/learn/aged-care-costs" className="text-accent hover:underline" target="_blank">What aged care costs</Link> and{" "}
          <Link href="/learn/aged-care-funding" className="text-accent hover:underline" target="_blank">Paying for aged care</Link>.
        </p>

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft">Done</button>
        </div>
      </div>
    </div>
  );
}
