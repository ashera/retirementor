"use client";

import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan, SimResult } from "@/lib/au/types";
import type { WhatWillItTake } from "@/lib/au/goalseek";
import { simulate } from "@/lib/au/simulate";
import { fmtCurrency } from "@/lib/au/format";

const floorTo = (v: number, step: number) => Math.max(0, Math.floor(v / step) * step);

/**
 * Build the spending patch that trims the budget down to the largest sustainable
 * amount (`gs.maxSpend`, the living-cost figure). Flat plans set the target
 * directly; staged plans scale all three lifestages by the same factor so the
 * "spending smile" shape is preserved. Exported so the caller applies the exact
 * same change the modal previews.
 */
export function trimPatch(plan: RetirementPlan, gs: WhatWillItTake): Partial<RetirementPlan> {
  const maxSpend = gs.maxSpend ?? 0;
  if (plan.spendingMode !== "stages") return { targetSpending: maxSpend };
  const f = gs.currentSpend > 0 ? maxSpend / gs.currentSpend : 0;
  return {
    spendingStages: {
      ...plan.spendingStages,
      goGo: maxSpend, // currentSpend === goGo, so goGo × f === maxSpend
      slowGo: floorTo(plan.spendingStages.slowGo * f, 100),
      noGo: floorTo(plan.spendingStages.noGo * f, 100),
    },
  };
}

function Line({
  label,
  from,
  to,
  strong,
  border,
}: {
  label: string;
  from?: number;
  to: number;
  strong?: boolean;
  border?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${border ? "border-t border-line pt-1.5" : ""}`}>
      <span className={strong ? "font-semibold text-slate-200" : "text-muted"}>{label}</span>
      <span className="flex items-baseline gap-2 tabular-nums">
        {from !== undefined && (
          <span className="text-muted line-through decoration-slate-500">{fmtCurrency(from)}</span>
        )}
        <span className={`${strong ? "font-semibold text-white" : "text-emerald-400"}`}>{fmtCurrency(to)}/yr</span>
      </span>
    </div>
  );
}

/**
 * "Help me trim spending" — previews the automatic budget trim that makes the
 * plan fund its spending all the way to life expectancy (the "money lasts"
 * goal), then applies it. Reads the sustainable spend from the goal-seek result
 * and, for staged budgets, scales every lifestage by the same factor.
 */
export default function TrimSpendingModal({
  open,
  onClose,
  onApply,
  plan,
  config,
  result,
  gs,
  loanCost,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (patch: Partial<RetirementPlan>) => void;
  plan: RetirementPlan;
  config: EngineConfig;
  result: SimResult;
  gs: WhatWillItTake;
  loanCost: number;
}) {
  if (!open || gs.maxSpend == null) return null;

  const isStaged = plan.spendingMode === "stages";
  const maxSpend = gs.maxSpend;
  const patch = trimPatch(plan, gs);
  const trimmed = { ...plan, ...patch };
  const after = simulate(trimmed, config);

  const st = plan.spendingStages;
  const ts = trimmed.spendingStages;

  // Totals include any ongoing home-loan cost, which the trim leaves untouched.
  const nowTotal = gs.currentSpend + loanCost;
  const trimmedTotal = maxSpend + loanCost;
  const cut = Math.max(0, gs.currentSpend - maxSpend);
  const cutPct = nowTotal > 0 ? Math.round((cut / nowTotal) * 100) : 0;

  const apply = () => {
    onApply(patch);
    onClose();
  };

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
          <p>
            On the central (average-return) projection your budget of{" "}
            <strong className="text-white">{fmtCurrency(nowTotal)}/yr</strong>{" "}
            {result.depletedAge != null ? (
              <>runs out at <strong className="text-amber-400">age {result.depletedAge}</strong>.</>
            ) : (
              <>doesn&apos;t quite reach age {plan.lifeExpectancy}.</>
            )}{" "}
            Trimming it to{" "}
            <strong className="text-emerald-400">{fmtCurrency(trimmedTotal)}/yr</strong>{" "}
            keeps your money going all the way to{" "}
            <strong className="text-white">age {plan.lifeExpectancy}</strong>.
          </p>

          <div className="rounded-xl border border-line bg-panel-2 p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {isStaged ? "Trim, keeping your spending-smile shape" : "New spending target"}
            </div>
            <div className="space-y-1.5">
              {isStaged ? (
                <>
                  <Line label={`Go-go (from ${plan.retirementAge})`} from={st.goGo} to={ts.goGo} />
                  <Line label={`Slow-go (from ${st.slowGoAge})`} from={st.slowGo} to={ts.slowGo} />
                  <Line label={`No-go (from ${st.noGoAge})`} from={st.noGo} to={ts.noGo} />
                </>
              ) : (
                <Line label="Living costs" from={gs.currentSpend} to={maxSpend} />
              )}
              {loanCost > 0 && <Line label="Home loan (unchanged)" to={loanCost} />}
              <Line label="Headline budget" from={nowTotal} to={trimmedTotal} strong border />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <div>
              <div className="font-semibold text-emerald-300">
                Cuts {fmtCurrency(cut)}/yr ({cutPct}%)
              </div>
              <div className="text-xs text-muted">
                {after.lastsToLifeExpectancy
                  ? `Your savings now last to age ${plan.lifeExpectancy}.`
                  : `Lasts to age ${after.depletedAge ?? plan.lifeExpectancy}.`}
              </div>
            </div>
            <span className="text-2xl" aria-hidden>
              {after.lastsToLifeExpectancy ? "✅" : "⚠️"}
            </span>
          </div>

          <p className="text-xs text-muted">
            {isStaged
              ? "Every lifestage is scaled by the same amount, so your go-go / slow-go / no-go shape is preserved."
              : "This sets your flat retirement income target."}{" "}
            {loanCost > 0 && "Any home-loan cost is fixed and left unchanged. "}
            Based on the central projection — real returns vary, so check the
            likelihood gauge for the odds. You can fine-tune the number afterwards.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110"
          >
            Apply this budget
          </button>
        </div>
      </div>
    </div>
  );
}
