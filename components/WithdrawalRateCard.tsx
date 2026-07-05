"use client";

import type { SimResult } from "@/lib/au/types";
import { fmtCurrency } from "@/lib/au/format";
import { initialWithdrawal, withdrawalBand, type InitialWithdrawal } from "@/lib/au/withdrawal";
import Explainer from "@/components/Explainer";

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
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Your withdrawal rate</span>
        <WithdrawalRateExplainer w={w} pct={pct} band={band.label} successPct={successPct} />
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <span className={`text-3xl font-bold tabular-nums ${tone.text}`}>{pct}%</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.badge}`}>{band.label}</span>
        <span className="text-xs text-muted">of your super is being withdrawn in the first year</span>
      </div>
      <div className="mt-0.5 text-xs text-muted">
        {fmtCurrency(w.drawn)} of {fmtCurrency(w.balance)} at age {w.age}
        {w.minDriven ? (
          <> — the ATO minimum, above your {fmtCurrency(w.spend)} spend; the surplus is reinvested outside super.</>
        ) : w.agePension + w.rent > 0 ? (
          <> — your {fmtCurrency(w.spend)} spend less {fmtCurrency(w.agePension + w.rent)} from the Age Pension{w.rent > 0 ? " and rent" : ""}.</>
        ) : w.outsideDrawn > 0 ? (
          <> — super plus {fmtCurrency(w.outsideDrawn)} from your outside savings funds the {fmtCurrency(w.spend)} spend.</>
        ) : null}
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

function WithdrawalRateExplainer({
  w,
  pct,
  band,
  successPct,
}: {
  w: InitialWithdrawal;
  pct: number;
  band: string;
  successPct: number;
}) {
  return (
    <Explainer title="Your withdrawal rate">
      <p>
        Your <strong className="text-white">withdrawal rate</strong> is the share of your super
        balance you take out in a year. In your first drawdown year that&apos;s{" "}
        <strong className="text-white">{pct}%</strong> — {fmtCurrency(w.drawn)} drawn from a{" "}
        {fmtCurrency(w.balance)} balance at age {w.age} ({band}).
      </p>

      <div>
        <h3 className="mb-1 font-semibold text-white">How it&apos;s worked out</h3>
        <div className="rounded-lg border border-line bg-ink/60 px-3 py-2 font-mono text-xs text-slate-200">
          {fmtCurrency(w.drawn)} ÷ {fmtCurrency(w.balance)} = {pct}%
        </div>
        <p className="mt-2">
          We take the amount drawn from super and divide it by the balance at the start of that year.
        </p>
      </div>

      <div>
        <h3 className="mb-1 font-semibold text-white">Why it&apos;s not your income goal</h3>
        <p>
          The withdrawal is only the slice of your spending that <em>super</em> funds — it won&apos;t
          equal your headline income goal, because:
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {w.agePension + w.rent > 0 && (
            <li>The <strong>Age Pension</strong>{w.rent > 0 ? " and any net rent" : ""} pays part of your spend ({fmtCurrency(w.agePension + w.rent)}), so super draws that much less.</li>
          )}
          {w.minDriven && (
            <li>The <strong>ATO minimum drawdown</strong> forces super to pay out more than you spend — the surplus is reinvested in your outside-super savings, not lost.</li>
          )}
          {w.outsideDrawn > 0 && (
            <li>Your <strong>outside-super savings</strong> chip in ({fmtCurrency(w.outsideDrawn)}), reducing what super has to cover.</li>
          )}
          <li>Before Age Pension age, with no pension yet, the super draw usually equals your spend.</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-1 font-semibold text-white">Is it sustainable?</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong className="text-emerald-400">≤4% — conservative.</strong> The classic &ldquo;4% rule&rdquo; anchor, from US research on a 30-year retirement.</li>
          <li><strong className="text-amber-400">4–6% — moderate.</strong> Sustainable for many, especially with the Age Pension behind you.</li>
          <li><strong className="text-red-400">&gt;6% — high.</strong> The balance is being run down quickly; more reliant on the Age Pension or a shorter horizon.</li>
        </ul>
        <p className="mt-2">
          These bands are only a rough guide in Australia, because two things soften a high rate:
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>The <strong>Age Pension</strong> is a means-tested safety net that grows as your assets fall — so income doesn&apos;t stop when super runs low.</li>
          <li>The ATO sets <strong>minimum drawdowns</strong> (4% under 65, 5% at 65–74, rising with age). Your rate can&apos;t sit below the minimum, and anything drawn above what you spend is reinvested in your outside-super savings — not lost.</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-1 font-semibold text-white">It climbs over time</h3>
        <p>
          As your balance falls but spending holds roughly steady, the rate rises each year — that&apos;s
          normal. The real test of whether your money lasts is the{" "}
          <a href="#likelihood" className="text-accent hover:underline">likelihood gauge</a>{" "}
          ({successPct}%), which stress-tests thousands of market scenarios rather than a single rate.
        </p>
      </div>
    </Explainer>
  );
}
