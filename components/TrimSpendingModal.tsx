"use client";

import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan, SimResult } from "@/lib/au/types";
import { simulate } from "@/lib/au/simulate";
import { trimSpending } from "@/lib/au/goalseek";
import { fmtCurrency } from "@/lib/au/format";

/**
 * "Help me trim spending" — previews the automatic budget trim that makes the
 * plan fund its spending all the way to life expectancy (the "money lasts"
 * goal). It PROTECTS the essentials floor and reduces only discretionary
 * spending; if even zero discretionary can't last, it says so plainly rather
 * than eating into essentials. Applies the change on confirm.
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
  if (!open) return null;

  const trim = trimSpending(plan, config);
  const { essentials, essentialsEstimated, loanCost, stages } = trim;
  const single = stages.length === 1; // flat plan → one "Retirement" row

  // Headline totals (include any unchanged home-loan cost).
  const nowLiving = stages[0]?.totalBefore ?? 0; // go-go / flat headline
  const afterLiving = stages[0]?.totalAfter ?? 0;
  const nowTotal = nowLiving + loanCost;
  const afterTotal = afterLiving + loanCost;
  const cut = Math.max(0, nowLiving - afterLiving);
  const cutPct = nowTotal > 0 ? Math.round((cut / nowTotal) * 100) : 0;

  const after = trim.feasible ? simulate({ ...plan, ...trim.patch }, config) : null;

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
            <h2 className="text-lg font-bold text-white">Trim spending to make it last</h2>
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
                On the central (average-return) projection your budget of{" "}
                <strong className="text-white">{fmtCurrency(nowTotal)}/yr</strong>{" "}
                {result.depletedAge != null ? (
                  <>runs out at <strong className="text-amber-400">age {result.depletedAge}</strong>.</>
                ) : (
                  <>doesn&apos;t quite reach age {plan.lifeExpectancy}.</>
                )}{" "}
                Keeping <strong className="text-emerald-400">{trim.discretionaryKeptPct}% of your discretionary</strong>{" "}
                spend — {fmtCurrency(afterTotal)}/yr all in — makes it last to{" "}
                <strong className="text-white">age {plan.lifeExpectancy}</strong>.
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
                    {after?.lastsToLifeExpectancy
                      ? `Your savings now last to age ${plan.lifeExpectancy}.`
                      : `Lasts to age ${after?.depletedAge ?? plan.lifeExpectancy}.`}
                  </div>
                </div>
                <span className="text-2xl" aria-hidden>{after?.lastsToLifeExpectancy ? "✅" : "⚠️"}</span>
              </div>

              <p className="text-xs text-muted">
                {single
                  ? "This lowers your flat retirement income target."
                  : "Every lifestage keeps its essentials and is trimmed by the same share of discretionary, so your go-go / slow-go / no-go shape is preserved."}{" "}
                Based on the central projection — real returns vary, so check the
                likelihood gauge for the odds. You can fine-tune afterwards.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
                <span className="text-lg" aria-hidden>⚠️</span>
                <p className="text-xs text-slate-200">
                  Trimming spending <strong>can&apos;t fix this on its own</strong>. Even cutting{" "}
                  <strong>all</strong> discretionary spending — living on just your{" "}
                  {fmtCurrency(essentials)}/yr of essentials — your money still runs out at{" "}
                  <strong className="text-amber-300">age {trim.depletedAgeIfEssentialsOnly ?? plan.lifeExpectancy}</strong>.
                </p>
              </div>
              <p>
                To reach age {plan.lifeExpectancy} you&apos;d need to lift the other
                levers instead — <strong className="text-white">save more</strong>,{" "}
                <strong className="text-white">retire later</strong>, or revisit your
                essential costs. See the three levers above for the amounts each would take.
              </p>
              <p className="text-xs text-muted">
                We won&apos;t trim into your essentials automatically — that&apos;s a call
                only you should make.
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
