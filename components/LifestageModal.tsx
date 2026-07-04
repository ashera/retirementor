"use client";

import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan } from "@/lib/au/types";
import { fmtCurrency } from "@/lib/au/format";
import { lifestageBreakdown } from "@/lib/au/lifestages";

const ARTICLE =
  "https://www.caresuper.com.au/members/advice-and-resources/education-hub/how-retirement-goes-from-go-go-to-no-go";

const STAGE_META: Record<string, { color: string; blurb: string }> = {
  "Go-go": {
    color: "#34d399",
    blurb: "The active early years — travel, hobbies, dining out and helping family. Discretionary spending is typically at its highest.",
  },
  "Slow-go": {
    color: "#f59e0b",
    blurb: "You gradually slow down — less big travel and fewer paid activities — so discretionary spending eases while the essentials stay much the same.",
  },
  "No-go": {
    color: "#a78bfa",
    blurb: "Life is mostly closer to home, so discretionary spending is at its lowest — though health and aged-care costs can climb later on.",
  },
};

function Row({
  label,
  value,
  tone = "muted",
  strong,
  border,
}: {
  label: string;
  value: number;
  tone?: "muted" | "slate" | "amber";
  strong?: boolean;
  border?: boolean;
}) {
  const valueTone = tone === "amber" ? "text-amber-400" : strong ? "text-white" : "text-slate-200";
  return (
    <div className={`flex justify-between gap-4 ${border ? "border-t border-line pt-1" : ""}`}>
      <span className={strong ? "font-semibold text-slate-200" : "text-muted"}>{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold " : ""}${valueTone}`}>
        {fmtCurrency(value)}/yr
      </span>
    </div>
  );
}

/**
 * Explains the retirement "spending smile" — the go-go / slow-go / no-go
 * lifestages — breaking each stage into Essentials, Discretionary and any Home
 * loan. Opened from the lifestage pill on the Retirement income card.
 */
export default function LifestageModal({
  open,
  onClose,
  plan,
  config,
}: {
  open: boolean;
  onClose: () => void;
  plan: RetirementPlan;
  config: EngineConfig;
}) {
  if (!open) return null;
  const staged = plan.spendingMode === "stages";
  const { rows, essentials, estimated, goal } = lifestageBreakdown(plan, config);
  const stages = rows.map((r) => ({ ...r, ...STAGE_META[r.key] }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2">
            <span aria-hidden>🛤️</span>
            <h2 className="text-lg font-bold text-white">Retirement lifestages</h2>
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
            Spending in retirement usually isn&apos;t flat — research on real
            retiree budgets shows it follows a{" "}
            <strong className="text-white">&ldquo;retirement spending smile&rdquo;</strong>.{" "}
            <strong className="text-slate-200">Essentials stay roughly flat</strong>, while{" "}
            <strong className="text-slate-200">discretionary</strong> spending
            (travel, dining, hobbies) tapers as you age:
          </p>

          <div className="space-y-2">
            {stages.map((st) => (
              <div key={st.key} className="rounded-xl border border-line bg-panel-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: st.color }} aria-hidden />
                    <span className="font-semibold text-white">{st.key} years</span>
                    <span className="text-xs text-muted">ages {st.ageFrom}–{st.ageTo}</span>
                  </div>
                  {staged && (
                    <span className="font-semibold tabular-nums text-accent">{fmtCurrency(st.total)}/yr</span>
                  )}
                </div>
                {staged && (
                  <div className="mt-2 space-y-1 text-[11px]">
                    <Row label="Essentials" value={essentials} />
                    <Row label="Discretionary" value={st.discretionary} tone="slate" />
                    {st.loan > 0 && <Row label="Home loan" value={st.loan} tone="amber" />}
                    <Row label="Total" value={st.total} strong border />
                  </div>
                )}
                <p className="mt-1.5 text-xs text-muted">{st.blurb}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted">
            {staged
              ? estimated
                ? "The essential/discretionary split is estimated from the ASFA Retirement Standard — build a budget to use your own category amounts."
                : "The essential/discretionary split comes from your budget."
              : "Your plan currently uses flat spending — switch to staged spending in “Edit plan” or the budget builder to model the smile."}{" "}
            Essentials are held flat in today&apos;s dollars; discretionary steps down each stage.
            {goal.loanKind === "cleared" &&
              " Your home loan is cleared at retirement with a super lump sum, so it isn't an ongoing cost."}
            {goal.loanKind === "pi" && goal.payoffAge &&
              ` Your home loan of ${fmtCurrency(goal.loanCost)}/yr is added on top until it clears at age ${goal.payoffAge}.`}
            {goal.loanKind === "io" &&
              ` Your interest-only home loan of ${fmtCurrency(goal.loanCost)}/yr is added on top for life.`}
          </p>

          <a href={ARTICLE} target="_blank" rel="noreferrer" className="inline-block text-xs text-accent hover:underline">
            Read more about go-go / slow-go / no-go →
          </a>
        </div>
      </div>
    </div>
  );
}
