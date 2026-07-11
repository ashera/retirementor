"use client";

import { useMemo, useState } from "react";
import Field from "@/components/Field";
import { fmtCurrency } from "@/lib/au/format";
import type { RetirementPlan } from "@/lib/au/types";

export interface CompareColumn {
  id: string;
  label: string;
  plan: RetirementPlan;
  kind: "current" | "saved" | "variant";
}

const primarySpend = (p: RetirementPlan) => (p.spendingMode === "stages" ? p.spendingStages.goGo : p.targetSpending);

/** Set the plan's spend, scaling staged amounts proportionally to keep the shape. */
function withSpend(p: RetirementPlan, spend: number): RetirementPlan {
  if (p.spendingMode !== "stages") return { ...p, targetSpending: spend };
  const base = p.spendingStages.goGo || spend || 1;
  const f = spend / base;
  return {
    ...p,
    targetSpending: spend,
    spendingStages: {
      ...p.spendingStages,
      goGo: Math.round(spend),
      slowGo: Math.round(p.spendingStages.slowGo * f),
      noGo: Math.round(p.spendingStages.noGo * f),
    },
  };
}

/** Modal to build a what-if variant by cloning a base column and tweaking levers. */
export default function VariantEditor({
  bases,
  onSave,
  onClose,
}: {
  bases: CompareColumn[];
  onSave: (label: string, plan: RetirementPlan) => void;
  onClose: () => void;
}) {
  const [baseId, setBaseId] = useState(bases[0]?.id ?? "");
  const base = bases.find((b) => b.id === baseId) ?? bases[0];
  const bp = base.plan;

  const [retireAge, setRetireAge] = useState(bp.retirementAge);
  const [spend, setSpend] = useState(Math.round(primarySpend(bp)));
  const [ret, setRet] = useState(bp.investmentReturn);
  const [life, setLife] = useState(bp.lifeExpectancy);
  const [clearLoan, setClearLoan] = useState(bp.mortgage?.strategy === "clear_at_retirement");
  const [label, setLabel] = useState("");

  // Reset the fields when the base changes.
  const rebase = (id: string) => {
    const b = bases.find((x) => x.id === id);
    if (!b) return;
    setBaseId(id);
    setRetireAge(b.plan.retirementAge);
    setSpend(Math.round(primarySpend(b.plan)));
    setRet(b.plan.investmentReturn);
    setLife(b.plan.lifeExpectancy);
    setClearLoan(b.plan.mortgage?.strategy === "clear_at_retirement");
    setLabel("");
  };

  const suggested = useMemo(() => {
    const parts: string[] = [];
    if (retireAge !== bp.retirementAge) parts.push(`Retire ${retireAge}`);
    if (Math.round(spend) !== Math.round(primarySpend(bp))) parts.push(`Spend ${fmtCurrency(spend)}`);
    if (ret !== bp.investmentReturn) parts.push(`${ret}% return`);
    if (life !== bp.lifeExpectancy) parts.push(`to ${life}`);
    if (bp.mortgage && clearLoan !== (bp.mortgage.strategy === "clear_at_retirement")) parts.push(clearLoan ? "clear loan" : "carry loan");
    return parts.length ? parts.join(" · ") : `Copy of ${base.label}`;
  }, [retireAge, spend, ret, life, clearLoan, bp, base.label]);

  const save = () => {
    let plan: RetirementPlan = withSpend({ ...bp, retirementAge: retireAge, investmentReturn: ret, lifeExpectancy: life }, spend);
    if (plan.mortgage) {
      plan = { ...plan, mortgage: { ...plan.mortgage, strategy: clearLoan ? "clear_at_retirement" : "carry" } };
    }
    onSave(label.trim() || suggested, plan);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-bold text-white">Add a what-if variant</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted transition hover:bg-panel-2 hover:text-white">✕</button>
        </div>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          {bases.length > 1 && (
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">Start from</span>
              <select
                value={baseId}
                onChange={(e) => rebase(e.target.value)}
                className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-white"
              >
                {bases.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
            </label>
          )}

          <Field label="Retirement age" value={retireAge} onChange={(v) => setRetireAge(Math.round(v))} min={40} max={75} suffix="yrs" />
          <Field label="Annual spend" value={spend} onChange={(v) => setSpend(Math.round(v))} min={20_000} max={400_000} step={1000} prefix="$" hint="Scales the staged amounts proportionally." />
          <Field label="Investment return (before fees)" value={ret} onChange={setRet} min={1} max={12} step={0.1} suffix="%" hint="Before fees — funds usually quote returns after fees; we deduct fees separately." />
          <Field label="Plan until age" value={life} onChange={(v) => setLife(Math.round(v))} min={75} max={105} suffix="yrs" />

          {bp.mortgage && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-200">Home loan at retirement</span>
              <div className="inline-flex rounded-lg border border-line bg-panel-2 p-1 text-sm">
                <button onClick={() => setClearLoan(false)} className={`rounded-md px-3 py-1 font-semibold ${!clearLoan ? "bg-accent text-ink" : "text-muted"}`}>Carry</button>
                <button onClick={() => setClearLoan(true)} className={`rounded-md px-3 py-1 font-semibold ${clearLoan ? "bg-accent text-ink" : "text-muted"}`}>Clear</button>
              </div>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">Label</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={suggested}
              className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-white placeholder:text-muted"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white">Cancel</button>
          <button onClick={save} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110">Add to comparison</button>
        </div>
      </div>
    </div>
  );
}
