"use client";

import { useEffect, useState } from "react";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan, SimResult } from "@/lib/au/types";
import { trimSpending, type SpendingTrim } from "@/lib/au/goalseek";
import { fmtCurrency } from "@/lib/au/format";

/**
 * "Help me trim spending" — the mirror of the Boost modal. When the current
 * spend sits UNDER the shared confidence bar (85% Monte Carlo), this previews
 * trimming ONLY discretionary spending (essentials held flat) down to the most
 * the plan can prudently afford, and applies it on confirm. If even zero
 * discretionary can't clear the bar, it says so plainly rather than eating into
 * essentials.
 */
export default function TrimSpendingModal({
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
  // The prudent trim runs a Monte Carlo bisection (~0.4s), so compute it after
  // the modal has painted a loading state rather than freezing the open.
  const [trim, setTrim] = useState<SpendingTrim | null>(null);
  useEffect(() => {
    if (!open) {
      setTrim(null);
      return;
    }
    setTrim(null);
    const id = setTimeout(() => setTrim(trimSpending(plan, config)), 30);
    return () => clearTimeout(id);
  }, [open, plan, config]);

  if (!open) return null;

  if (!trim) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative z-10 w-full max-w-lg rounded-2xl border border-line bg-panel p-10 text-center shadow-2xl">
          <div className="animate-pulse text-sm text-muted">✂️ Working out the most you can prudently spend…</div>
        </div>
      </div>
    );
  }

  const { essentials, essentialsEstimated, loanCost, stages } = trim;
  const single = stages.length === 1; // flat plan → one "Retirement" row

  const nowLiving = stages[0]?.totalBefore ?? 0; // go-go / flat headline
  const afterLiving = stages[0]?.totalAfter ?? 0;
  const nowTotal = nowLiving + loanCost;
  const afterTotal = afterLiving + loanCost;
  const cut = Math.max(0, nowLiving - afterLiving);
  const cutPct = nowTotal > 0 ? Math.round((cut / nowTotal) * 100) : 0;
  const beforePct = Math.round(trim.successBefore * 100);
  const afterPct = Math.round(trim.successAfter * 100);

  const apply = () => {
    onApply(trim.patch);
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
            <span aria-hidden>✂️</span>
            <h2 className="text-lg font-bold text-white">Trim spending to a prudent level</h2>
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
              ({essentialsNote}) are <strong>kept whole</strong>. Only{" "}
              <strong>discretionary</strong> spending — travel, dining, hobbies — is trimmed.
            </p>
          </div>

          {trim.feasible ? (
            <>
              <p>
                Your budget of <strong className="text-white">{fmtCurrency(nowTotal)}/yr</strong> is only about{" "}
                <strong className="text-amber-400">{beforePct}% likely</strong> to last to age {plan.lifeExpectancy}
                {result.depletedAge != null && (
                  <> (it runs short around <strong className="text-amber-400">age {result.depletedAge}</strong> on the central projection)</>
                )}
                . Trimming discretionary to <strong className="text-white">{fmtCurrency(afterTotal)}/yr all in</strong> —
                keeping <strong className="text-emerald-400">{trim.discretionaryKeptPct}%</strong> of it — lifts you to about{" "}
                <strong className="text-white">{afterPct}% likely</strong> to last, allowing for market ups and downs.
              </p>

              <div className="rounded-xl border border-line bg-panel-2 p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  {single ? "Discretionary trim" : "Trim, keeping your spending-smile shape"}
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
                  <div className="font-semibold text-emerald-300">Cuts {fmtCurrency(cut)}/yr ({cutPct}%)</div>
                  <div className="text-xs text-muted">
                    About {afterPct}% likely to last to age {plan.lifeExpectancy}.
                  </div>
                </div>
                <span className="text-2xl" aria-hidden>✅</span>
              </div>

              <p className="text-xs text-muted">
                {single
                  ? "This lowers your flat retirement income target."
                  : "Every lifestage keeps its essentials and is trimmed by the same share of discretionary, so your go-go / slow-go / no-go shape is preserved."}{" "}
                This keeps you about {trim.targetPct}% likely to last — a buffer for market swings, not just the average
                projection. You can fine-tune afterwards.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
                <span className="text-lg" aria-hidden>⚠️</span>
                <p className="text-xs text-slate-200">
                  Trimming spending <strong>can&apos;t get you there on its own</strong>. Even cutting{" "}
                  <strong>all</strong> discretionary spending — living on just your{" "}
                  {fmtCurrency(essentials)}/yr of essentials — you&apos;d still be under the{" "}
                  <strong className="text-amber-300">{trim.targetPct}% mark</strong>
                  {trim.depletedAgeIfEssentialsOnly != null && (
                    <> (your money runs short at age {trim.depletedAgeIfEssentialsOnly})</>
                  )}
                  .
                </p>
              </div>
              <p>
                To get there you&apos;d need to lift the other levers instead —{" "}
                <strong className="text-white">save more</strong>, <strong className="text-white">retire later</strong>,
                or revisit your essential costs. See the three levers above for the amounts each would take.
              </p>
              <p className="text-xs text-muted">
                We won&apos;t trim into your essentials automatically — that&apos;s a call only you should make.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            {trim.feasible ? "Cancel" : "Close"}
          </button>
          {trim.feasible && (
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
