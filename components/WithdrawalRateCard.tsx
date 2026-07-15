"use client";

import { hasStaggeredRetirement, type RetirementPlan, type SimResult } from "@/lib/au/types";
import { fmtCurrency } from "@/lib/au/format";
import { retirementGoal, type GoalBreakdown } from "@/lib/au/goal";
import { initialWithdrawal, withdrawalBand, type InitialWithdrawal } from "@/lib/au/withdrawal";
import { MC_CONFIDENCE_TARGET } from "@/lib/au/montecarlo";
import Explainer from "@/components/Explainer";

/** Join a list into "a, b and c". */
function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

/** The reductions that bridge the income goal down to the net call on the
 *  portfolio (super + outside savings). Outside savings are NOT a reduction here —
 *  they're part of the portfolio doing the funding, not something that shrinks it. */
function reductions(w: InitialWithdrawal, goal: GoalBreakdown): { label: string; amount: number }[] {
  const out: { label: string; amount: number }[] = [];
  const loanErosion = Math.round(goal.total - w.spend); // nominal loan − its deflated value that year
  if (w.agePension + w.rent > 1) out.push({ label: `the Age Pension${w.rent > 1 ? " & rent" : ""}`, amount: Math.round(w.agePension + w.rent) });
  if (loanErosion > 100) out.push({ label: "inflation eroding your fixed loan payment", amount: loanErosion });
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
export default function WithdrawalRateCard({
  result,
  plan,
  successPct,
  safeRate = null,
  safePending = false,
}: {
  result: SimResult;
  plan: RetirementPlan;
  successPct: number;
  // Personal safe withdrawal rate (the whole-portfolio rate at the 85%-MC max spend),
  // measured on the same basis as the headline so it drops onto the same bar.
  safeRate?: number | null;
  safePending?: boolean;
}) {
  const w = initialWithdrawal(result);
  if (!w) return null;
  // Headline is the WHOLE-PORTFOLIO rate (super + outside savings) — the number the
  // 4% band actually applies to. It doesn't jump when the savings buffer empties,
  // and it doesn't understate the draw while that buffer quietly funds part of the
  // spend. The super-only rate is kept for the reconciliation & explainer.
  const pct = +(w.portfolioRate * 100).toFixed(1);
  const band = withdrawalBand(w.portfolioRate);
  const tone = TONE[band.tone];
  const markerPct = Math.min(100, Math.max(0, (w.portfolioRate / 0.1) * 100)); // 0–10% scale
  const safeMarkerPct = safeRate != null ? Math.min(100, Math.max(0, (safeRate / 0.1) * 100)) : null;
  const safePct = safeRate != null ? +(safeRate * 100).toFixed(1) : null;
  const safeConfidence = Math.round(MC_CONFIDENCE_TARGET * 100);
  const overSafe = safeRate != null && w.portfolioRate > safeRate + 0.0005; // drawing above the safe rate
  const goal = retirementGoal(plan);
  const reds = reductions(w, goal);
  const superPct = +(w.rate * 100).toFixed(1);
  const hasBuffer = w.outsideDrawn > 1;
  const runoutPct = w.bufferRunout ? Math.round(w.bufferRunout.rate * 100) : null;

  return (
    <div className="mb-6 rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Your withdrawal rate</span>
        <WithdrawalRateExplainer w={w} goal={goal} reds={reds} pct={pct} superPct={superPct} band={band.label} successPct={successPct} />
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <span className={`text-3xl font-bold tabular-nums ${tone.text}`}>{pct}%</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.badge}`}>{band.label}</span>
        <span className="text-xs text-muted">
          of your {hasBuffer ? "super + savings" : "super"} is funding your lifestyle in the first year
        </span>
      </div>
      <div className="mt-0.5 text-xs text-muted">
        {fmtCurrency(w.netSpend)} from {fmtCurrency(w.portfolio)} in {hasBuffer ? "super + savings" : "super"} at age {w.age}
        {hasStaggeredRetirement(plan) && " (your first year both retired, once no salary is coming in)"}
        {reds.length > 0 ? (
          <> — your {fmtCurrency(goal.total)} goal less {joinAnd(reds.map((r) => `${fmtCurrency(r.amount)} from ${r.label}`))}.</>
        ) : (
          "."
        )}
        {hasBuffer && (
          <> Super itself is drawing {fmtCurrency(w.drawn)} ({superPct}%) so far — your savings fund the rest.</>
        )}
      </div>
      {w.bufferRunout && (
        <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
          This climbs to about <span className="font-semibold tabular-nums">{runoutPct}%</span> by age{" "}
          {w.bufferRunout.age}, when your outside-super savings run out and super carries the full load.
          That&apos;s expected as you draw down — the{" "}
          <a href="#likelihood" className="underline hover:text-amber-100">{successPct}% likelihood</a>{" "}
          is what confirms it still lasts.
        </div>
      )}

      {/* Guidance band bar (0–10% scale): current rate (white) with the classic 4%
          anchor, and — below — an arrow at YOUR personal safe withdrawal rate. */}
      <div className="mt-4">
        <div className="relative h-2 w-full overflow-hidden rounded-full">
          <div className="absolute inset-0 flex">
            <div className="h-full bg-emerald-500/60" style={{ width: "40%" }} />
            <div className="h-full bg-amber-500/60" style={{ width: "20%" }} />
            <div className="h-full bg-red-500/60" style={{ width: "40%" }} />
          </div>
          {/* Classic 4% anchor */}
          <div className="absolute inset-y-0 w-px bg-white/40" style={{ left: "40%" }} />
          {/* Current rate */}
          <div
            className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
            style={{ left: `${markerPct}%` }}
          />
        </div>
        {/* Safe-rate arrow, pointing up at the bar */}
        {safeMarkerPct != null && (
          <div className="relative mt-px h-2.5">
            <span
              className="absolute top-0 -translate-x-1/2 text-[10px] leading-none text-sky-400"
              style={{ left: `${safeMarkerPct}%` }}
              aria-hidden
            >
              ▲
            </span>
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[10px] text-muted">
          <span><span className="font-semibold text-emerald-400">≤4%</span> safe</span>
          <span><span className="font-semibold text-amber-400">4–6%</span> moderate</span>
          <span><span className="font-semibold text-red-400">&gt;6%</span> high</span>
          {safePct != null && (
            <span className="flex items-center gap-1 text-sky-300">
              <span aria-hidden>▲</span> your safe rate ~{safePct}%{safePending ? " …" : ""}
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted">
        {safePct != null ? (
          <>
            The classic guide is about 4%, but Australia&apos;s Age Pension is a safety net, so your{" "}
            <span className="font-semibold text-sky-300">safe rate is ~{safePct}%</span> — the most you could
            draw at a steady income and still be about {safeConfidence}% likely to last to age {plan.lifeExpectancy}.
            {overSafe
              ? ` You're drawing ${pct}%, above that — see the `
              : ` You're at ${pct}%, comfortably within it — the `}
            <a href="#likelihood" className="text-accent hover:underline">{successPct}% likelihood</a>{overSafe ? "." : " confirms it."}
          </>
        ) : (
          <>
            A lower rate lasts longer. The classic guide is about 4%, but Australia&apos;s Age Pension is a
            safety net, so a higher rate can still last — your{" "}
            <a href="#likelihood" className="text-accent hover:underline">{successPct}% likelihood</a>{" "}
            is the real test.
          </>
        )}
      </p>
    </div>
  );
}

function WithdrawalRateExplainer({
  w,
  goal,
  reds,
  pct,
  superPct,
  band,
  successPct,
}: {
  w: InitialWithdrawal;
  goal: GoalBreakdown;
  reds: { label: string; amount: number }[];
  pct: number;
  superPct: number;
  band: string;
  successPct: number;
}) {
  const hasBuffer = w.outsideDrawn > 1;
  return (
    <Explainer title="Your withdrawal rate">
      <p>
        Your <strong className="text-white">withdrawal rate</strong> is the share of your retirement
        capital you draw in a year to fund your lifestyle. Because the classic{" "}
        <strong>4% rule</strong> is a <em>whole-portfolio</em> guide, we measure it across{" "}
        <strong className="text-white">all your investable assets</strong> — super{" "}
        {hasBuffer && "plus outside-super savings "}together. In your first full-retirement year
        that&apos;s <strong className="text-white">{pct}%</strong> — {fmtCurrency(w.netSpend)} drawn
        from {fmtCurrency(w.portfolio)} at age {w.age} ({band}).
      </p>

      <div>
        <h3 className="mb-1 font-semibold text-white">How it&apos;s worked out</h3>
        <div className="rounded-lg border border-line bg-ink/60 px-3 py-2 font-mono text-xs text-slate-200">
          {fmtCurrency(w.netSpend)} ÷ {fmtCurrency(w.portfolio)} = {pct}%
        </div>
        <p className="mt-2">
          We take what your own savings must fund — your spending less the Age Pension{w.rent > 1 ? " and net rent" : ""} —
          and divide it by your total investable assets (super{hasBuffer && " + outside savings"}) at
          the start of that year.
        </p>
      </div>

      {hasBuffer && (
        <div>
          <h3 className="mb-1 font-semibold text-white">Why it doesn&apos;t &ldquo;jump&rdquo; later</h3>
          <p>
            Spending draws from your outside-super savings first (super&apos;s earnings are tax-free, so
            it&apos;s worth preserving), so <em>super alone</em> is only drawing{" "}
            <strong className="text-white">{fmtCurrency(w.drawn)}</strong> ({superPct}% of super) so far.
            A super-only rate would look deceptively low now and appear to leap the year those savings
            run out{w.bufferRunout ? ` (around age ${w.bufferRunout.age})` : ""} — but nothing about
            sustainability changes there; money just moves from one pocket to another. The
            whole-portfolio rate above rises smoothly through that point, so it&apos;s the honest gauge.
          </p>
        </div>
      )}

      <div>
        <h3 className="mb-1 font-semibold text-white">How it reconciles with your income goal</h3>
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
            <span>Funded from your portfolio</span>
            <span className="tabular-nums">{fmtCurrency(w.netSpend)}</span>
          </div>
        </div>
        {goal.total - w.spend > 100 && (
          <p className="mt-2">
            Your home-loan payment is a <strong>fixed dollar amount</strong>, so in today&apos;s-dollar
            terms it shrinks with inflation each year — which is why the goal&apos;s{" "}
            {fmtCurrency(goal.loanCost)} loan cost is smaller by age {w.age}.
          </p>
        )}
        {w.minDriven && (
          <p className="mt-2">
            The <strong>ATO minimum drawdown</strong> forces super to pay out{" "}
            {fmtCurrency(w.drawn)} — more than your spending needs from super right now — so the surplus
            is reinvested in your outside-super savings, not lost. (That&apos;s why the whole-portfolio
            rate, which nets out money moving between pockets, is the cleaner measure.)
          </p>
        )}
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
