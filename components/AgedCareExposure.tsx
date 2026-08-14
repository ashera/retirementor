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
  plan, result, noCareResult, config,
}: {
  plan: RetirementPlan;
  result: SimResult;
  noCareResult: SimResult | null;
  config: EngineConfig;
}) {
  const [workings, setWorkings] = useState(false);
  const ac = plan.agedCare;
  const careRows = result.rows.filter((r) => (r.breakdown.agedCareTotal ?? 0) > 0);
  const firstRow = careRows[0];
  const first = firstRow?.breakdown;
  if (!ac?.enabled || !first) return null;

  const radHeld = Math.max(0, ...result.rows.map((r) => r.breakdown.radHeld ?? 0));
  const rent = first.agedCareHomeRent ?? 0;
  const isResidential = ac.careType === "residential";

  // The real (un-weighted) fees are the sticker; the components sum to it. When the
  // framing is "if you need it" the CHARGED cost is weighted below that.
  const full = first.agedCareFull ?? first.agedCareTotal ?? 0;
  const charged = first.agedCareTotal ?? 0;
  const weighted = full > 0 && charged / full < 0.999;

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
        {weighted && (
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[11px]">
            <span className="text-muted">Expected (× chance you need it)</span>
            <span className="tabular-nums text-slate-200">{fmtCurrency(Math.round(charged))}/yr</span>
          </div>
        )}
      </div>

      {radHeld > 0 && (
        <div className="mt-2 rounded-xl border border-line bg-panel-2 p-3 text-[11px] leading-relaxed text-muted">
          <span className="font-semibold text-slate-200">Refundable deposit (RAD): {fmtCurrency(Math.round(radHeld))}</span> — held for
          your room, refundable to your estate and exempt from the Age Pension assets test. It&apos;s <strong className="text-slate-300">not</strong> part
          of the spendable balance shown on the chart.
        </div>
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
        <AgedCareWorkingsModal plan={plan} breakdown={first} config={config} careAge={firstRow.age} onClose={() => setWorkings(false)} />
      )}
    </div>
  );
}
