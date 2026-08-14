"use client";

import Link from "next/link";
import { fmtCurrency } from "@/lib/au/format";
import type { RetirementPlan, SimResult } from "@/lib/au/types";

const lastsToLabel = (res: SimResult, plan: RetirementPlan): string =>
  res.depletedAge != null ? `age ${res.depletedAge}` : `past ${plan.lifeExpectancy}`;

// The "aged-care exposure" card on the What-If board — shown when aged care is
// modelled. It makes the numbers legible: the cost breakdown (so the acronyms from
// the /learn articles appear in context), the REFUNDABLE deposit (which otherwise
// looks like it vanished from the spendable balance), and the effect on how long
// the money lasts. General information, not advice.
export default function AgedCareExposure({
  plan, result, noCareResult,
}: {
  plan: RetirementPlan;
  result: SimResult;
  noCareResult: SimResult | null;
}) {
  const ac = plan.agedCare;
  if (!ac?.enabled) return null;
  const careRows = result.rows.filter((r) => (r.breakdown.agedCareTotal ?? 0) > 0);
  const first = careRows[0]?.breakdown;
  if (!first) return null;

  const radHeld = Math.max(0, ...result.rows.map((r) => r.breakdown.radHeld ?? 0));
  const rent = first.agedCareHomeRent ?? 0;
  const isResidential = ac.careType === "residential";
  const probabilistic = ac.framing === "probabilistic";

  const rows: { label: string; value: number }[] = [];
  if (isResidential) {
    if (first.agedCareBasic) rows.push({ label: "Basic daily fee", value: first.agedCareBasic });
    if (first.agedCareHotelling) rows.push({ label: "Hotelling", value: first.agedCareHotelling });
    if (first.agedCareNCCC) rows.push({ label: "Care (NCCC)", value: first.agedCareNCCC });
    if (first.agedCareDAP) rows.push({ label: "Daily room (DAP)", value: first.agedCareDAP });
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      {probabilistic && (
        <p className="mb-2 text-[11px] text-muted">Shown as an expected cost, weighted by the chance you need care.</p>
      )}

      <div className="rounded-xl border border-line bg-panel-2 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-muted">Cost in the first care year</span>
          <span className="text-lg font-bold tabular-nums text-rose-300">{fmtCurrency(Math.round(first.agedCareTotal ?? 0))}<span className="text-xs font-normal text-muted">/yr</span></span>
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

      {radHeld > 0 && (
        <div className="mt-2 rounded-xl border border-line bg-panel-2 p-3 text-[11px] leading-relaxed text-muted">
          <span className="font-semibold text-slate-200">Refundable deposit (RAD): {fmtCurrency(Math.round(radHeld))}</span> — held for
          your room, refundable to your estate and exempt from the Age Pension assets test. It&apos;s <strong className="text-slate-300">not</strong> part
          of the spendable balance shown on the chart.
        </div>
      )}

      <div className="mt-2 text-xs text-slate-300">
        With these costs, your money is projected to last <strong className="text-white">{lastsToLabel(result, plan)}</strong>
        {noCareResult && (
          <span className="text-muted"> (vs {lastsToLabel(noCareResult, plan)} without them)</span>
        )}.
      </div>

      <p className="mt-2 text-[11px] text-muted">
        Estimates only, not advice.{" "}
        <Link href="/learn/aged-care-funding" className="text-accent hover:underline" target="_blank">How aged-care funding works →</Link>
      </p>
    </div>
  );
}
