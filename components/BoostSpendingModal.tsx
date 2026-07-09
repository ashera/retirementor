"use client";

import { useEffect, useState } from "react";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan, SimResult } from "@/lib/au/types";
import { boostSpending, type SpendingBoost } from "@/lib/au/goalseek";
import { fmtCurrency } from "@/lib/au/format";

/**
 * "Help me spend more" — the mirror of the Trim modal. When the plan already
 * lasts to life expectancy there's headroom in the budget; this previews raising
 * ONLY the discretionary spend (essentials held flat) to the most the plan can
 * sustainably afford, and applies it on confirm. It won't inflate essentials, so
 * an all-essentials budget is told to add discretionary in the builder instead.
 */
export default function BoostSpendingModal({
  open,
  onClose,
  onApply,
  plan,
  config,
  result,
  applyLabel = "Apply this budget",
}: {
  open: boolean;
  onClose: () => void;
  onApply: (patch: Partial<RetirementPlan>) => void;
  plan: RetirementPlan;
  config: EngineConfig;
  result: SimResult;
  applyLabel?: string;
}) {
  // The prudent boost runs a Monte Carlo bisection (~0.4s), so compute it after the
  // modal has painted a loading state rather than freezing the open.
  const [boost, setBoost] = useState<SpendingBoost | null>(null);
  useEffect(() => {
    if (!open) {
      setBoost(null);
      return;
    }
    setBoost(null);
    const id = setTimeout(() => setBoost(boostSpending(plan, config)), 30);
    return () => clearTimeout(id);
  }, [open, plan, config]);

  if (!open) return null;

  if (!boost) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative z-10 w-full max-w-lg rounded-2xl border border-line bg-panel p-10 text-center shadow-2xl">
          <div className="animate-pulse text-sm text-muted">📈 Working out how much more you can safely spend…</div>
        </div>
      </div>
    );
  }

  const { essentials, essentialsEstimated, loanCost, stages } = boost;
  const single = stages.length === 1; // flat plan → one "Retirement" row

  const nowLiving = stages[0]?.totalBefore ?? 0;
  const afterLiving = stages[0]?.totalAfter ?? 0;
  const nowTotal = nowLiving + loanCost;
  const afterTotal = afterLiving + loanCost;
  const add = Math.max(0, afterLiving - nowLiving);
  const addPct = nowTotal > 0 ? Math.round((add / nowTotal) * 100) : 0;

  const apply = () => {
    onApply(boost.patch);
    onClose();
  };

  const essentialsNote = essentialsEstimated
    ? "estimated from the ASFA Retirement Standard — build a budget to use your own split"
    : "from your budget";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2">
            <span aria-hidden>📈</span>
            <h2 className="text-lg font-bold text-white">Spend more with your headroom</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted transition hover:bg-panel-2 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-slate-300">
          {/* Essentials-protected banner */}
          <div className="flex items-start gap-3 rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
            <span className="text-lg" aria-hidden>🛡️</span>
            <p className="text-xs text-slate-300">
              Your <strong className="text-white">essentials of {fmtCurrency(essentials)}/yr</strong>{" "}
              ({essentialsNote}) stay the same. Only your{" "}
              <strong>discretionary</strong> spending — travel, dining, hobbies — is raised.
            </p>
          </div>

          {boost.hasHeadroom ? (
            <>
              <p>
                Your budget of <strong className="text-white">{fmtCurrency(nowTotal)}/yr</strong> has room
                to spare. You can lift discretionary by{" "}
                <strong className="text-emerald-400">{boost.discretionaryUpliftPct}%</strong> — spending{" "}
                <strong className="text-white">{fmtCurrency(afterTotal)}/yr all in</strong> — and it&apos;s still{" "}
                <strong className="text-white">{Math.round(boost.successAfter * 100)}% likely</strong> to last to
                age {plan.lifeExpectancy}, allowing for market ups and downs.
              </p>

              <div className="rounded-xl border border-line bg-panel-2 p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  {single ? "Discretionary boost" : "Boost, keeping your spending-smile shape"}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-muted">Essentials (all stages)</span>
                    <span className="tabular-nums text-slate-200">
                      {fmtCurrency(essentials)}/yr <span className="text-[11px] text-sky-300">· kept</span>
                    </span>
                  </div>
                  {stages.map((st) => (
                    <div key={st.key} className="flex items-baseline justify-between gap-4">
                      <span className="text-muted">
                        {single ? "Discretionary" : `${st.key} discretionary`}
                        {!single && <span className="text-[11px] text-muted"> (from {st.ageFrom})</span>}
                      </span>
                      <span className="flex items-baseline gap-2 tabular-nums">
                        <span className="text-muted line-through decoration-slate-500">{fmtCurrency(st.discBefore)}</span>
                        <span className="text-emerald-400">{fmtCurrency(st.discAfter)}</span>
                      </span>
                    </div>
                  ))}
                  {loanCost > 0 && (
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-muted">Home loan (unchanged)</span>
                      <span className="tabular-nums text-slate-200">{fmtCurrency(loanCost)}/yr</span>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between gap-4 border-t border-line pt-1.5">
                    <span className="font-semibold text-slate-200">{single ? "New budget" : "Headline budget (go-go)"}</span>
                    <span className="flex items-baseline gap-2 tabular-nums">
                      <span className="text-muted line-through decoration-slate-500">{fmtCurrency(nowTotal)}</span>
                      <span className="font-semibold text-white">{fmtCurrency(afterTotal)}/yr</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                <div>
                  <div className="font-semibold text-emerald-300">Adds {fmtCurrency(add)}/yr (+{addPct}%)</div>
                  <div className="text-xs text-muted">
                    About {Math.round(boost.successAfter * 100)}% likely to last to age {plan.lifeExpectancy}.
                  </div>
                </div>
                <span className="text-2xl" aria-hidden>🎉</span>
              </div>

              <p className="text-xs text-muted">
                {single
                  ? "This raises your flat retirement income target."
                  : "Every lifestage keeps its essentials and gains the same share of discretionary, so your go-go / slow-go / no-go shape is preserved."}{" "}
                This keeps you about {boost.targetPct}% likely to last — a buffer for market swings, not just
                the average projection. You can fine-tune afterwards.
              </p>
            </>
          ) : boost.allEssentials ? (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3">
                <span className="text-lg" aria-hidden>🛡️</span>
                <p className="text-xs text-slate-200">
                  Your budget is <strong>all essentials</strong> right now — there&apos;s no
                  discretionary line to grow, and we won&apos;t pad your essentials automatically.
                </p>
              </div>
              <p>
                You do have headroom to spend more. To use it, add some{" "}
                <strong className="text-white">discretionary</strong> spending — travel, dining,
                hobbies — in the budget builder, then come back and boost it.
              </p>
              <p className="text-xs text-muted">
                Keeping your essentials honest means the &ldquo;spend more&rdquo; only ever grows
                the fun stuff — a call we leave to you.
              </p>
            </>
          ) : (
            <p>
              You&apos;re already spending close to the most this plan can sustainably afford —
              there&apos;s no meaningful headroom to add without risking your money running short.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            {boost.hasHeadroom ? "Cancel" : "Close"}
          </button>
          {boost.hasHeadroom && (
            <button
              type="button"
              onClick={apply}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110"
            >
              {applyLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
