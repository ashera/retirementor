"use client";

import type { SimResult } from "@/lib/au/types";
import { fmtCurrency } from "@/lib/au/format";
import { initialWithdrawal, withdrawalBand } from "@/lib/au/withdrawal";

const TONE: Record<"accent" | "amber" | "red", { text: string; badge: string }> = {
  accent: { text: "text-emerald-400", badge: "bg-emerald-500/15 text-emerald-400" },
  amber: { text: "text-amber-400", badge: "bg-amber-500/15 text-amber-400" },
  red: { text: "text-red-400", badge: "bg-red-500/15 text-red-400" },
};

/**
 * Withdrawal-rate diagnostic card — the share of super drawn in the first
 * drawdown year, with a safe/moderate/high guidance band. Read-only; it explains
 * sustainability alongside "money lasts" and the likelihood gauge.
 */
export default function WithdrawalRateCard({ result, successPct }: { result: SimResult; successPct: number }) {
  const w = initialWithdrawal(result);
  if (!w) return null;
  const pct = +(w.rate * 100).toFixed(1);
  const band = withdrawalBand(w.rate);
  const tone = TONE[band.tone];
  const markerPct = Math.min(100, Math.max(0, (w.rate / 0.1) * 100)); // 0–10% scale

  return (
    <div className="mb-6 rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Withdrawal rate</span>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <span className={`text-3xl font-bold tabular-nums ${tone.text}`}>{pct}%</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.badge}`}>{band.label}</span>
        <span className="text-xs text-muted">
          of your super in the first drawdown year — {fmtCurrency(w.drawn)} of {fmtCurrency(w.balance)} at age {w.age}
        </span>
      </div>

      {/* Guidance band bar (0–10% scale) with a marker at the rate */}
      <div className="mt-4">
        <div className="relative h-2 w-full overflow-hidden rounded-full">
          <div className="absolute inset-0 flex">
            <div className="h-full bg-emerald-500/60" style={{ width: "40%" }} />
            <div className="h-full bg-amber-500/60" style={{ width: "20%" }} />
            <div className="h-full bg-red-500/60" style={{ width: "40%" }} />
          </div>
          <div
            className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
            style={{ left: `${markerPct}%` }}
          />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted">
          <span><span className="font-semibold text-emerald-400">≤4%</span> safe</span>
          <span><span className="font-semibold text-amber-400">4–6%</span> moderate</span>
          <span><span className="font-semibold text-red-400">&gt;6%</span> high</span>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted">
        A lower rate lasts longer. The classic guide is about 4%, but Australia&apos;s Age Pension is a
        safety net, so a higher rate can still last — your{" "}
        <a href="#likelihood" className="text-accent hover:underline">{successPct}% likelihood</a>{" "}
        is the real test.
      </p>
    </div>
  );
}
