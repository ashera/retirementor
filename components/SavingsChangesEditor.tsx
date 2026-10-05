"use client";

import { useEffect, useState } from "react";
import { fmtCurrency } from "@/lib/au/format";
import type { SavingsChange } from "@/lib/au/types";

/** String-backed numeric input (clearable, clamps on blur) — same as IncomeStreamsEditor. */
function NumberInput({
  value,
  min,
  max,
  step = 1,
  onChange,
  className,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  className: string;
  ariaLabel: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n / step) * step));
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
        setText(raw);
        if (raw !== "") onChange(clamp(Number(raw)));
      }}
      onBlur={() => {
        setFocused(false);
        const next = text === "" ? min : clamp(Number(text));
        setText(String(next));
        onChange(next);
      }}
      className={className}
    />
  );
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `sc-${Math.floor(performance.now() * 1000)}-${Math.round(performance.now() % 1000)}`;
  }
}

/**
 * Step changes to how much is saved outside super during the working years — "save
 * more once the kids leave home / the mortgage clears", or less while paying school
 * fees. Each change sets a NEW annual savings amount from a chosen age onward; they
 * compose (latest reached wins). A committed plan input (lives on the base plan next
 * to income streams), today's dollars.
 */
export default function SavingsChangesEditor({
  changes,
  baseSavings,
  minAge,
  maxAge,
  defaultAge,
  onChange,
}: {
  changes: SavingsChange[];
  baseSavings: number; // the base annualOutsideSavings, shown as the starting point
  minAge: number;
  maxAge: number;
  defaultAge: number;
  onChange: (changes: SavingsChange[]) => void;
}) {
  const clampAge = (a: number) => Math.min(maxAge, Math.max(minAge, Math.round(a)));
  const sorted = [...changes].sort((a, b) => a.atAge - b.atAge);

  const add = () =>
    onChange([
      ...changes,
      { id: newId(), atAge: clampAge(defaultAge), amount: Math.max(0, Math.round(baseSavings) || 0) },
    ]);
  const update = (id: string, patch: Partial<SavingsChange>) =>
    onChange(changes.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const remove = (id: string) => onChange(changes.filter((c) => c.id !== id));

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <h3 className="flex items-center gap-2 font-semibold text-white">
        <span aria-hidden>📈</span> Savings changes
        <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[11px] font-medium text-muted">optional</span>
      </h3>
      <p className="mt-0.5 text-xs text-muted">
        Save more (or less) from a certain age — e.g. once the{" "}
        <span className="text-slate-200">kids leave home</span> or the{" "}
        <span className="text-slate-200">mortgage is paid off</span>. Starts from{" "}
        <span className="tabular-nums text-slate-200">{fmtCurrency(baseSavings)}/yr</span>. Applies during your
        working years — up to age <span className="tabular-nums text-slate-200">{maxAge}</span>, your last year
        before retirement.
      </p>

      {sorted.length > 0 && (
        <div className="mt-3 space-y-2">
          {sorted.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm">
              <span className="text-muted">From age</span>
              <NumberInput
                value={c.atAge}
                min={minAge}
                max={maxAge}
                onChange={(atAge) => update(c.id, { atAge })}
                ariaLabel="From age"
                className="w-16 rounded-lg border border-line bg-panel px-2 py-1.5 text-center tabular-nums text-white outline-none focus:border-accent"
              />
              <span className="text-muted">save</span>
              <span className="text-muted">$</span>
              <NumberInput
                value={c.amount}
                min={0}
                max={500_000}
                step={500}
                onChange={(amount) => update(c.id, { amount })}
                ariaLabel="Save per year from this age"
                className="w-28 rounded-lg border border-line bg-panel px-2 py-1.5 text-right tabular-nums text-white outline-none focus:border-accent"
              />
              <span className="text-muted">/yr</span>
              <button
                type="button"
                onClick={() => remove(c.id)}
                className="ml-auto rounded-lg px-2 py-1 text-xs font-medium text-muted transition hover:text-red-400"
                aria-label="Remove this savings change"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={add}
          className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-400/20"
        >
          + Add a savings change
        </button>
      </div>
    </div>
  );
}
