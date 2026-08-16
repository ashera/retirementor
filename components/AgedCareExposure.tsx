"use client";

import { useState } from "react";
import Link from "next/link";
import { fmtCurrency } from "@/lib/au/format";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan, SimResult } from "@/lib/au/types";
import AgedCareWorkingsModal from "@/components/AgedCareWorkingsModal";

const lastsToLabel = (res: SimResult, plan: RetirementPlan): string =>
  res.depletedAge != null ? `age ${res.depletedAge}` : `past ${plan.lifeExpectancy}`;

// The "aged-care exposure" block, rendered inside the Aged care card when it's on.
// Makes the numbers legible: the real fee breakdown (the /learn acronyms in
// context), the REFUNDABLE deposit (so the chart's drop isn't read as money lost),
// the effect on longevity, and a "full workings" explainer. Not advice.
export default function AgedCareExposure({
  plan, result, noCareResult, config, onEdit,
}: {
  plan: RetirementPlan;
  result: SimResult;
  noCareResult: SimResult | null;
  config: EngineConfig;
  onEdit?: () => void; // open the "Model aged care" dialog (injected by AgedCareEditor)
}) {
  const [workings, setWorkings] = useState(false);
  const ac = plan.agedCare;
  const careRows = result.rows.filter((r) => (r.breakdown.agedCareTotal ?? 0) > 0);
  const firstRow = careRows[0];
  const first = firstRow?.breakdown;
  if (!ac?.enabled || !first) return null;

  const radHeld = Math.max(0, ...result.rows.map((r) => r.breakdown.radHeld ?? 0));
  // The deposit actually PAID at entry (before the 2%/yr retention nibbles it) — the
  // right basis for "did savings cover the chosen lump", separate from the running held
  // balance which now declines with retention.
  const radPaid = Math.max(0, ...result.rows.map((r) => r.breakdown.radDrawn ?? 0));
  const rent = first.agedCareHomeRent ?? 0;
  const isResidential = ac.careType === "residential";

  const full = first.agedCareFull ?? first.agedCareTotal ?? 0; // annual fees; the components sum to this

  // The lump-sum RAD the user has chosen to pay (room price × lump-sum share) —
  // a real, refundable one-off worth seeing next to the annual cost.
  const mode = isResidential ? (ac.accommodation ?? "dap") : "dap";
  const lumpShare = mode === "rad" ? 1 : mode === "combo" ? Math.min(1, Math.max(0, (ac.radSharePct ?? 50) / 100)) : 0;
  const room = ac.radAmount ?? config.agedCare.radNationalAvg;
  const chosenLump = room * lumpShare; // the deposit the user chose to pay
  const fundedLump = radPaid; // actually paid as a refundable deposit at entry (assume mode; 0 when probabilistic)
  const partialRad = fundedLump > 0 && chosenLump - fundedLump > 1; // savings couldn't cover the full lump

  const rows: { label: string; value: number }[] = [];
  if (isResidential) {
    if (first.agedCareBasic) rows.push({ label: "Basic daily fee", value: first.agedCareBasic });
    if (first.agedCareHotelling) rows.push({ label: "Hotelling", value: first.agedCareHotelling });
    if (first.agedCareNCCC) rows.push({ label: "Care (NCCC)", value: first.agedCareNCCC });
    if (first.agedCareDAP) rows.push({ label: "Daily room (DAP)", value: first.agedCareDAP });
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="rounded-xl border border-line bg-panel-2 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-muted">{isResidential ? "Cost if you need care" : "Care cost"}</span>
          <span className="text-lg font-bold tabular-nums text-rose-300">{fmtCurrency(Math.round(full))}<span className="text-xs font-normal text-muted">/yr</span></span>
        </div>
        {rows.length > 0 && (
          <div className="mt-2 space-y-1">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between text-[11px] text-muted">
                <span>{r.label}</span>
                <span className="tabular-nums text-slate-300">{fmtCurrency(Math.round(r.value))}</span>
              </div>
            ))}
          </div>
        )}
        {rent > 0 && (
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[11px]">
            <span className="text-muted">Rent from your home</span>
            <span className="tabular-nums text-accent">+{fmtCurrency(Math.round(rent))}/yr</span>
          </div>
        )}
      </div>

      {chosenLump > 0 && (
        <div className="mt-2 rounded-xl border border-rose-400/25 bg-panel-2 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium text-muted">Plus a one-off deposit (RAD)</span>
            <span className="text-base font-bold tabular-nums text-rose-200">{fmtCurrency(Math.round(chosenLump))}</span>
          </div>
          {partialRad ? (
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Your savings cover <span className="text-slate-200">{fmtCurrency(Math.round(fundedLump))}</span> as a refundable
              deposit (returned to your estate, exempt from the assets test); the remaining{" "}
              <span className="text-slate-200">{fmtCurrency(Math.round(chosenLump - fundedLump))}</span> is paid daily (DAP),
              included in the annual cost above.
            </p>
          ) : (
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              A mostly-refundable lump sum for the room, paid once — exempt from the Age Pension assets test. The provider
              keeps a retention of {Math.round(config.agedCare.radRetentionPctPerYear * 100)}%/yr for up to{" "}
              {config.agedCare.radRetentionMaxYears} years (max {Math.round(config.agedCare.radRetentionPctPerYear * config.agedCare.radRetentionMaxYears * 100)}%);
              the balance is returned to you (or your estate). Separate from the annual cost above
              {radHeld > 0 ? ", and drawn from your balance at entry (so it isn't part of the spendable balance on the chart)" : ""}.
            </p>
          )}
        </div>
      )}

      {isResidential && (first.agedCareLivingSaved ?? 0) > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Your everyday living costs drop in care — the fees cover housing, meals and utilities
          (~{fmtCurrency(Math.round(first.agedCareLivingSaved ?? 0))}/yr), so the net hit is less than the fees alone.
        </p>
      )}

      <div className="mt-2 text-xs text-slate-300">
        With these costs, your money is projected to last <strong className="text-white">{lastsToLabel(result, plan)}</strong>
        {noCareResult && <span className="text-muted"> (vs {lastsToLabel(noCareResult, plan)} without them)</span>}.
      </div>

      <button
        type="button"
        onClick={() => setWorkings(true)}
        className="mt-2 text-[11px] font-medium text-accent hover:underline"
      >
        Show the full workings →
      </button>
      <span className="ml-2 text-[11px] text-muted">
        or <Link href="/learn/aged-care-funding" className="text-accent hover:underline" target="_blank">how funding works</Link>
      </span>

      {workings && firstRow && (
        <AgedCareWorkingsModal plan={plan} breakdown={first} config={config} careAge={firstRow.age} onClose={() => setWorkings(false)} onEdit={onEdit} />
      )}
    </div>
  );
}
