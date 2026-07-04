"use client";

import type { RetirementPlan } from "@/lib/au/types";
import { fmtCurrency } from "@/lib/au/format";

const ARTICLE =
  "https://www.caresuper.com.au/members/advice-and-resources/education-hub/how-retirement-goes-from-go-go-to-no-go";

/**
 * Explains the retirement "spending smile" — the go-go / slow-go / no-go
 * lifestages — with this plan's stage ages and amounts. Opened from the
 * lifestage pill on the Retirement income card.
 */
export default function LifestageModal({
  open,
  onClose,
  plan,
}: {
  open: boolean;
  onClose: () => void;
  plan: RetirementPlan;
}) {
  if (!open) return null;
  const s = plan.spendingStages;
  const staged = plan.spendingMode === "stages";

  const stages = [
    {
      key: "Go-go",
      ageFrom: plan.retirementAge,
      ageTo: s.slowGoAge,
      amount: s.goGo,
      color: "#34d399",
      blurb:
        "The active early years — travel, hobbies, dining out and helping family. Discretionary spending is typically at its highest.",
    },
    {
      key: "Slow-go",
      ageFrom: s.slowGoAge,
      ageTo: s.noGoAge,
      amount: s.slowGo,
      color: "#f59e0b",
      blurb:
        "You gradually slow down — less big travel and fewer paid activities — so discretionary spending eases while the essentials stay much the same.",
    },
    {
      key: "No-go",
      ageFrom: s.noGoAge,
      ageTo: plan.lifeExpectancy,
      amount: s.noGo,
      color: "#a78bfa",
      blurb:
        "Life is mostly closer to home, so discretionary spending is at its lowest — though health and aged-care costs can climb later on.",
    },
  ];

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
            <strong className="text-white">&ldquo;retirement spending smile&rdquo;</strong>. Most
            people spend more in the active early years and taper off as they age.
            Planners describe this in three lifestages:
          </p>

          <div className="space-y-2">
            {stages.map((st) => (
              <div key={st.key} className="rounded-xl border border-line bg-panel-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: st.color }} aria-hidden />
                    <span className="font-semibold text-white">{st.key} years</span>
                    <span className="text-xs text-muted">
                      ages {st.ageFrom}–{st.ageTo}
                    </span>
                  </div>
                  {staged && (
                    <span className="font-semibold tabular-nums text-accent">
                      {fmtCurrency(st.amount)}/yr
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">{st.blurb}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted">
            In this model, <strong className="text-slate-300">essentials stay roughly flat</strong>{" "}
            while <strong className="text-slate-300">discretionary</strong> spending (travel, dining,
            hobbies) steps down through the slow-go and no-go years. Health and
            aged-care costs, which can rise late in life, are not included.
          </p>

          {staged ? (
            <p className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-muted">
              Your Retirement income goal shows the <strong className="text-accent">Go-go</strong>{" "}
              figure — the first and highest stage.
            </p>
          ) : (
            <p className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs">
              Your plan currently uses <strong>flat</strong> spending. Switch to
              staged spending in &ldquo;Edit plan&rdquo; or the budget builder to
              model the smile.
            </p>
          )}

          <a
            href={ARTICLE}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-xs text-accent hover:underline"
          >
            Read more about go-go / slow-go / no-go →
          </a>
        </div>
      </div>
    </div>
  );
}
