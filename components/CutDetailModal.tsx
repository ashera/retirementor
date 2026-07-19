"use client";

import { useEffect, useMemo, useState } from "react";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan } from "@/lib/au/types";
import { spendBreakdownAtFloor } from "@/lib/au/budget";
import { fmtCurrency } from "@/lib/au/format";
import BudgetCategoryIcon from "@/components/BudgetCategoryIcon";

// What a given cut on the "how flexible would you really be?" ladder actually means,
// category by category. Holds essentials flat and scales discretionary (the way the
// guardrails flex spend), then shows each budget category per month at that level.
export default function CutDetailModal({
  plan,
  config,
  floor,
  survived,
  total,
  kind,
  onClose,
}: {
  plan: RetirementPlan;
  config: EngineConfig;
  floor: number; // target annual spend at this ladder rung
  survived: number;
  total: number;
  kind: "fixed" | "essentials" | "cut";
  onClose: () => void;
}) {
  const [monthly, setMonthly] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bd = useMemo(() => spendBreakdownAtFloor(plan, config, floor), [plan, config, floor]);
  const amt = (annual: number) => fmtCurrency(Math.round(monthly ? annual / 12 : annual));
  const per = monthly ? "/mo" : "/yr";

  const cutPct = bd.fullSpend > 0 ? Math.round(((bd.fullSpend - floor) / bd.fullSpend) * 100) : 0;
  const discCutPct = bd.discretionaryFull > 0 ? Math.round((1 - bd.keptFraction) * 100) : 0;
  const essentials = bd.rows.filter((r) => r.essential);
  const discretionary = bd.rows.filter((r) => !r.essential);
  const essentialTotal = essentials.reduce((s, r) => s + r.annual, 0);
  const discretionaryTotal = discretionary.reduce((s, r) => s + r.annual, 0);

  const heading =
    kind === "fixed"
      ? `Your full plan — ${fmtCurrency(bd.fullSpend)}/yr`
      : kind === "essentials"
        ? `Cutting to the bone — ${fmtCurrency(floor)}/yr`
        : `Cutting ${cutPct}% — ${fmtCurrency(floor)}/yr`;

  const lede =
    kind === "fixed"
      ? "Your spending in full — no cuts. This is what you'd give up in a downturn if you held it here."
      : kind === "essentials"
        ? "Every discretionary dollar gone — only the essentials remain. This is the deepest you could flex."
        : "Essentials hold steady; the whole cut comes out of your discretionary spending.";

  const tone =
    survived === total ? "text-emerald-400" : survived >= Math.ceil(total * 0.6) ? "text-amber-400" : "text-red-400";

  const Row = ({ r }: { r: (typeof bd.rows)[number] }) => {
    const cut = !r.essential && r.annual < r.baselineAnnual;
    return (
      <div className="flex items-center gap-3 py-2">
        <BudgetCategoryIcon categoryKey={r.key} size={16} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-white">{r.label}</div>
          <div className="truncate text-xs text-muted">{r.hint}</div>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <div className={`text-sm font-semibold ${r.annual === 0 ? "text-red-400" : "text-white"}`}>
            {amt(r.annual)}
            <span className="text-xs font-normal text-muted">{per}</span>
          </div>
          {cut ? (
            <div className="text-[11px] text-muted">
              <span className="line-through">{amt(r.baselineAnnual)}</span> · −{Math.round((1 - r.annual / r.baselineAnnual) * 100)}%
            </div>
          ) : (
            <div className="text-[11px] text-emerald-400/80">{r.essential ? "held" : "no cut"}</div>
          )}
        </div>
      </div>
    );
  };

  const SubTotal = ({ label, value, note }: { label: string; value: number; note?: string }) => (
    <div className="flex items-baseline justify-between gap-3 px-1 py-1.5 text-xs">
      <span className="font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className="tabular-nums text-slate-300">
        <span className="font-semibold text-white">{amt(value)}</span>
        <span className="text-muted">{per}</span>
        {note ? <span className="ml-1 text-muted">{note}</span> : null}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">{heading}</h2>
            <p className="mt-0.5 text-xs text-muted">
              Survives <span className={`font-semibold ${tone}`}>{survived} of {total}</span> downturns ·{" "}
              {kind === "fixed" ? "no spending cut" : `discretionary −${discCutPct}%`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-panel-2 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-2.5">
          <p className="text-xs leading-relaxed text-slate-300">{lede}</p>
          <div className="flex shrink-0 rounded-lg bg-panel-2 p-0.5 text-xs">
            {(["monthly", "yearly"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonthly(m === "monthly")}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  (m === "monthly") === monthly ? "bg-panel text-white shadow-sm" : "text-muted hover:text-white"
                }`}
              >
                {m === "monthly" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-3">
          {essentials.length > 0 && (
            <>
              <SubTotal label="Essentials" value={essentialTotal} note="· held steady" />
              <div className="divide-y divide-line/60">
                {essentials.map((r) => (
                  <Row key={r.key} r={r} />
                ))}
              </div>
            </>
          )}
          {discretionary.length > 0 && (
            <>
              <SubTotal
                label="Discretionary"
                value={discretionaryTotal}
                note={discCutPct > 0 ? `· −${discCutPct}%` : "· no cut"}
              />
              <div className="divide-y divide-line/60">
                {discretionary.map((r) => (
                  <Row key={r.key} r={r} />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-line px-6 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-white">Total spending</span>
            <span className="tabular-nums text-lg font-bold text-white">
              {amt(essentialTotal + discretionaryTotal)}
              <span className="text-sm font-normal text-muted">{per}</span>
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            {bd.estimated
              ? "Category split estimated from ASFA Retirement Standard averages for your household. Build your own budget to see your real figures."
              : "From your own budget. Essentials are held flat; the guardrails take the cut from discretionary spending first."}
          </p>
        </div>
      </div>
    </div>
  );
}
