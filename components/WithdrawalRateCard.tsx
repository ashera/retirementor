"use client";

import { type RetirementPlan, type SimResult } from "@/lib/au/types";
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
  if (w.agePension + w.rent > 1) {
    const hasPension = w.agePension > 1;
    const hasRent = w.rent > 1;
    const label = hasPension ? `the Age Pension${hasRent ? " & rent" : ""}` : "rent";
    out.push({ label, amount: Math.round(w.agePension + w.rent) });
  }
  if (w.workIncome > 1) out.push({ label: "part-time work", amount: Math.round(w.workIncome) });
  if (loanErosion > 100) out.push({ label: "inflation eroding your fixed loan payment", amount: loanErosion });
  return out;
}

/**
 * Withdrawal-rate stat-card explainer — the full detail (was its own diagnostic
 * card) now lives in this modal, launched from the "Withdrawal rate" stat card:
 * how the rate is worked out, where it sits on the guidance band, your personal
 * safe withdrawal rate (steady + flexible), the income-goal reconciliation, and
 * why it climbs. Self-contained — derives everything from the plan + sim result;
 * returns null before there's a drawdown year.
 */
export function WithdrawalRateStatExplainer({
  result,
  plan,
  successPct,
  safeRate = null,
  flexSafeRate = null,
  safePending = false,
}: {
  result: SimResult;
  plan: RetirementPlan;
  successPct: number;
  safeRate?: number | null;
  flexSafeRate?: number | null;
  safePending?: boolean;
}) {
  const w = initialWithdrawal(result);
  if (!w) return null;
  const goal = retirementGoal(plan);
  const reds = reductions(w, goal);
  const pct = +(w.portfolioRate * 100).toFixed(1);
  const superPct = +(w.rate * 100).toFixed(1);
  const band = withdrawalBand(w.portfolioRate).label;
  const hasBuffer = w.outsideDrawn > 1;

  // Guidance-band positions (0–10% scale).
  const clampPct = (v: number) => Math.min(100, Math.max(0, v));
  const markerPct = clampPct((w.portfolioRate / 0.1) * 100);
  const safeMarkerPct = safeRate != null ? clampPct((safeRate / 0.1) * 100) : null;
  const showFlex = flexSafeRate != null && safeRate != null && flexSafeRate > safeRate + 0.002;
  const flexMarkerPct = showFlex ? clampPct((flexSafeRate! / 0.1) * 100) : null;
  const safePct = safeRate != null ? +(safeRate * 100).toFixed(1) : null;
  const flexPct = showFlex ? +(flexSafeRate! * 100).toFixed(1) : null;
  const overSafe = safeRate != null && w.portfolioRate > safeRate + 0.0005;
  const safeConfidence = Math.round(MC_CONFIDENCE_TARGET * 100);

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

      {/* Where you sit on the guidance band, with your personal safe rate(s). */}
      <div>
        <h3 className="mb-2 font-semibold text-white">Where you sit</h3>
        <div className="relative h-2 w-full overflow-hidden rounded-full">
          <div className="absolute inset-0 flex">
            <div className="h-full bg-emerald-500/60" style={{ width: "40%" }} />
            <div className="h-full bg-amber-500/60" style={{ width: "20%" }} />
            <div className="h-full bg-red-500/60" style={{ width: "40%" }} />
          </div>
          <div className="absolute inset-y-0 w-px bg-white/50" style={{ left: "40%" }} />
          <div
            className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
            style={{ left: `${markerPct}%` }}
          />
        </div>
        {safeMarkerPct != null && (
          <div className="relative mt-px h-2.5">
            <span
              className="absolute top-0 -translate-x-1/2 text-[10px] leading-none text-sky-400"
              style={{ left: `${safeMarkerPct}%` }}
              aria-hidden
            >
              ▲
            </span>
            {flexMarkerPct != null && (
              <span
                className="absolute top-0 -translate-x-1/2 text-[10px] leading-none text-violet-400"
                style={{ left: `${flexMarkerPct}%` }}
                aria-hidden
              >
                ▲
              </span>
            )}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-muted">
          <span><span className="font-semibold text-emerald-400">≤4%</span> conservative</span>
          <span><span className="font-semibold text-amber-400">4–6%</span> moderate</span>
          <span><span className="font-semibold text-red-400">&gt;6%</span> high</span>
          <span className="text-white">● you {pct}%</span>
          {safePct != null && (
            <span className="flex items-center gap-1 text-sky-300">
              <span aria-hidden>▲</span> prudent ~{safePct}%{safePending ? " …" : ""}
            </span>
          )}
          {flexPct != null && (
            <span className="flex items-center gap-1 text-violet-300">
              <span aria-hidden>▲</span> flexible ~{flexPct}%
            </span>
          )}
        </div>
        <p className="mt-3">
          {safePct != null ? (
            <>
              The classic guide is about 4%, but Australia&apos;s Age Pension is a safety net, so your{" "}
              <span className="font-semibold text-sky-300">prudent withdrawal rate is ~{safePct}%</span>{" "}
              (often called a &ldquo;safe withdrawal rate&rdquo;) — the most you could draw at a steady income and
              still be about {safeConfidence}% likely to last to age {plan.lifeExpectancy}.
              {overSafe
                ? ` You're drawing ${pct}%, above that, so the plan leans more on the Age Pension and a good sequence of returns — the `
                : ` You're at ${pct}%, within it — the `}
              <a href="#likelihood" className="text-accent hover:underline">{successPct}% likelihood</a>{" "}
              is the real test.
              {flexPct != null && (
                <>
                  {" "}
                  <span className="text-violet-300">Flexible spending</span> — easing back a little after markets
                  fall — could lift your prudent rate to{" "}
                  <span className="font-semibold text-violet-300">~{flexPct}%</span>, but that becomes a{" "}
                  <em>starting</em> rate you&apos;d trim in rough markets rather than a fixed draw.
                </>
              )}
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

      <div>
        <h3 className="mb-1 font-semibold text-white">How it&apos;s worked out</h3>
        <div className="rounded-lg border border-line bg-ink/60 px-3 py-2 font-mono text-xs text-slate-200">
          {fmtCurrency(w.netSpend)} ÷ {fmtCurrency(w.portfolio)} = {pct}%
        </div>
        <p className="mt-2">
          We take what your own savings must fund — your spending
          {(() => {
            const src = [
              w.agePension > 1 && "the Age Pension",
              w.rent > 1 && "net rent",
              w.workIncome > 1 && "part-time work income",
            ].filter(Boolean) as string[];
            return src.length ? ` less ${joinAnd(src)}` : "";
          })()}{" "}
          — and divide it by your total investable assets (super{hasBuffer && " + outside savings"}) at
          the start of that year.
        </p>
      </div>

      {hasBuffer && (
        <div>
          <h3 className="mb-1 font-semibold text-white">Why it doesn&apos;t &ldquo;jump&rdquo; later</h3>
          <p>
            Spending draws from your outside-super savings first (super is concessionally taxed now and
            tax-free once it&apos;s in the pension pool, so it&apos;s worth preserving), so <em>super alone</em> is only drawing{" "}
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
