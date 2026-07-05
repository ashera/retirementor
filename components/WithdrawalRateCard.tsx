"use client";

import type { RetirementPlan, SimResult } from "@/lib/au/types";
import { fmtCurrency } from "@/lib/au/format";
import { retirementGoal, type GoalBreakdown } from "@/lib/au/goal";
import { initialWithdrawal, withdrawalBand, type InitialWithdrawal } from "@/lib/au/withdrawal";
import Explainer from "@/components/Explainer";

/** Join a list into "a, b and c". */
function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

/** The reductions that bridge the income goal down to the super draw. */
function reductions(w: InitialWithdrawal, goal: GoalBreakdown): { label: string; amount: number }[] {
  const out: { label: string; amount: number }[] = [];
  const loanErosion = Math.round(goal.total - w.spend); // nominal loan − its deflated value that year
  if (w.agePension + w.rent > 1) out.push({ label: `the Age Pension${w.rent > 1 ? " & rent" : ""}`, amount: Math.round(w.agePension + w.rent) });
  if (loanErosion > 100) out.push({ label: "inflation eroding your fixed loan payment", amount: loanErosion });
  if (w.outsideDrawn > 1) out.push({ label: "your outside-super savings", amount: Math.round(w.outsideDrawn) });
  return out;
}

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
export default function WithdrawalRateCard({ result, plan, successPct }: { result: SimResult; plan: RetirementPlan; successPct: number }) {
  const w = initialWithdrawal(result);
  if (!w) return null;
  const pct = +(w.rate * 100).toFixed(1);
  const band = withdrawalBand(w.rate);
  const tone = TONE[band.tone];
  const markerPct = Math.min(100, Math.max(0, (w.rate / 0.1) * 100)); // 0–10% scale
  const goal = retirementGoal(plan);
  const reds = reductions(w, goal);

  return (
    <div className="mb-6 rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Your withdrawal rate</span>
        <WithdrawalRateExplainer w={w} goal={goal} reds={reds} pct={pct} band={band.label} successPct={successPct} />
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <span className={`text-3xl font-bold tabular-nums ${tone.text}`}>{pct}%</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.badge}`}>{band.label}</span>
        <span className="text-xs text-muted">of your super is being withdrawn in the first year</span>
      </div>
      <div className="mt-0.5 text-xs text-muted">
        {fmtCurrency(w.drawn)} of {fmtCurrency(w.balance)} at age {w.age}
        {w.minDriven ? (
          <> — the ATO minimum, above what your {fmtCurrency(goal.total)} goal needs from super; the surplus is reinvested outside super.</>
        ) : reds.length > 0 ? (
          <> — your {fmtCurrency(goal.total)} goal less {joinAnd(reds.map((r) => `${fmtCurrency(r.amount)} from ${r.label}`))}.</>
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
  goal,
  reds,
  pct,
  band,
  successPct,
}: {
  w: InitialWithdrawal;
  goal: GoalBreakdown;
  reds: { label: string; amount: number }[];
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
          The withdrawal is only the slice of your spending that <em>super</em> funds. Here&apos;s how
          it reconciles with your income goal:
        </p>
        {w.minDriven ? (
          <p className="mt-2">
            The <strong>ATO minimum drawdown</strong> forces super to pay out{" "}
            <strong className="text-white">{fmtCurrency(w.drawn)}</strong> — more than your{" "}
            {fmtCurrency(goal.total)} goal needs from super — so the surplus is reinvested in your
            outside-super savings, not lost.
          </p>
        ) : (
          <div className="mt-2 space-y-0.5 rounded-lg border border-line bg-ink/60 px-3 py-2 text-xs">
            <div className="flex justify-between gap-4">
              <span>Retirement income goal</span>
              <span className="tabular-nums text-slate-200">{fmtCurrency(goal.total)}</span>
            </div>
            {reds.map((r) => (
              <div key={r.label} className="flex justify-between gap-4 text-muted">
                <span>− {r.label}</span>
                <span className="tabular-nums">−{fmtCurrency(r.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t border-line pt-0.5 font-semibold text-white">
              <span>Drawn from super</span>
              <span className="tabular-nums">{fmtCurrency(w.drawn)}</span>
            </div>
          </div>
        )}
        {goal.total - w.spend > 100 && (
          <p className="mt-2">
            Your home-loan payment is a <strong>fixed dollar amount</strong>, so in today&apos;s-dollar
            terms it shrinks with inflation each year — which is why the goal&apos;s{" "}
            {fmtCurrency(goal.loanCost)} loan cost is smaller by age {w.age}.
          </p>
        )}
        <p className="mt-2">Before Age Pension age, with no pension yet, the super draw usually equals your spend.</p>
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
