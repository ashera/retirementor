"use client";

import { useEffect, useRef, useState } from "react";
import { fmtCurrency } from "@/lib/au/format";
import type { LifeEvent } from "@/lib/au/types";

/** A string-backed numeric input: you can clear it (no forced "0" or leading
 *  zeros), leading zeros are stripped as you type, and it clamps to [min, max] on
 *  blur. Fixes the "can't clear the amount → 0900000" controlled-number-input bug. */
function NumberInput({
  value,
  min,
  max,
  onChange,
  className,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  className: string;
  ariaLabel: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  // Reflect external value changes (opening a different event) — but not mid-type.
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

// The "committed" bucket of the What-If board: a user-managed list of one-off
// cashflows the user EXPECTS (inheritance, a big trip, helping the kids). Unlike
// the exploratory strategies these live on the base plan. The column shows a
// COMPACT list; adding or editing an event opens a modal form.

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `le-${Math.floor(performance.now() * 1000)}-${Math.round(performance.now() % 1000)}`;
  }
}

function Segmented({ value, onChange }: { value: LifeEvent["kind"]; onChange: (v: LifeEvent["kind"]) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-panel-2 p-0.5 text-xs">
      {(
        [
          { v: "income" as const, l: "Money in" },
          { v: "expense" as const, l: "Money out" },
        ]
      ).map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`rounded-md px-2.5 py-1 font-medium transition ${
            value === o.v
              ? o.v === "income"
                ? "bg-accent/20 text-accent"
                : "bg-amber-400/20 text-amber-300"
              : "text-muted hover:text-white"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

export default function LifeEventsEditor({
  events,
  minAge,
  maxAge,
  defaultAge,
  onChange,
  autoOpenId,
}: {
  events: LifeEvent[];
  minAge: number;
  maxAge: number;
  defaultAge: number;
  onChange: (events: LifeEvent[]) => void;
  autoOpenId?: string; // deep-link: open this event's edit modal on mount (once)
}) {
  // The event currently open in the add/edit modal (a draft; only committed on Save).
  const [draft, setDraft] = useState<LifeEvent | null>(null);

  // A dashboard chip can link here to edit one specific event — open it straight away.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || !autoOpenId) return;
    const ev = events.find((e) => e.id === autoOpenId);
    if (ev) {
      setDraft(ev);
      autoOpened.current = true;
    }
  }, [autoOpenId, events]);
  const isNew = draft != null && !events.some((e) => e.id === draft.id);

  const clampAge = (a: number) => Math.min(maxAge, Math.max(minAge, Math.round(a)));
  const startAdd = (kind: LifeEvent["kind"]) =>
    setDraft({
      id: newId(),
      kind,
      amount: kind === "income" ? 100_000 : 30_000,
      atAge: clampAge(defaultAge),
      label: kind === "income" ? "Inheritance" : "Big trip",
    });
  const save = () => {
    if (!draft) return;
    // Clamp on save (typing is left unclamped so multi-digit ages are enterable).
    const clean: LifeEvent = { ...draft, atAge: clampAge(draft.atAge), amount: Math.max(0, draft.amount) };
    onChange(events.some((e) => e.id === clean.id) ? events.map((e) => (e.id === clean.id ? clean : e)) : [...events, clean]);
    setDraft(null);
  };
  const remove = (id: string) => {
    onChange(events.filter((e) => e.id !== id));
    setDraft(null);
  };

  const shown = events.filter((e) => e.amount > 0 || draft?.id === e.id);

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <h3 className="flex items-center gap-2 font-semibold text-white">
        <span aria-hidden>📌</span> Life events
        <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[11px] font-medium text-muted">committed</span>
      </h3>
      <p className="mt-0.5 text-xs text-muted">
        One-off amounts you <span className="text-slate-200">expect</span> — an inheritance, a big trip. Part of your plan.
      </p>

      {shown.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {shown.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setDraft(e)}
              className="flex w-full items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-left text-sm transition hover:border-accent/40"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${e.kind === "income" ? "bg-accent" : "bg-amber-400"}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-slate-200">
                {e.label?.trim() || (e.kind === "income" ? "Windfall" : "Expense")}
              </span>
              <span className={`shrink-0 tabular-nums ${e.kind === "income" ? "text-accent" : "text-amber-300"}`}>
                {e.kind === "income" ? "+" : "−"}
                {fmtCurrency(e.amount)}
              </span>
              <span className="shrink-0 text-xs text-muted">at {e.atAge}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => startAdd("income")}
          className="rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20"
        >
          + Money in
        </button>
        <button
          type="button"
          onClick={() => startAdd("expense")}
          className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-400/20"
        >
          + Money out
        </button>
      </div>

      {/* Add / edit modal */}
      {draft && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDraft(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-line bg-panel p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-white">{isNew ? "Add a life event" : "Edit life event"}</h4>
              <button onClick={() => setDraft(null)} aria-label="Close" className="text-muted transition hover:text-white">
                ✕
              </button>
            </div>

            <label className="mt-4 block text-xs font-medium text-muted">Label</label>
            <input
              value={draft.label ?? ""}
              onChange={(ev) => setDraft({ ...draft, label: ev.target.value })}
              placeholder={draft.kind === "income" ? "e.g. Inheritance" : "e.g. Big trip"}
              className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-white outline-none focus:border-accent"
            />

            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted">Direction</span>
              <Segmented value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind })} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted">Amount</label>
                <div className="mt-1 flex items-center gap-1 rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-sm">
                  <span className="text-muted">$</span>
                  <NumberInput
                    value={draft.amount}
                    min={0}
                    max={100_000_000}
                    onChange={(n) => setDraft({ ...draft, amount: n })}
                    ariaLabel="Amount"
                    className="w-full bg-transparent text-white outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted">At age</label>
                <NumberInput
                  value={draft.atAge}
                  min={minAge}
                  max={maxAge}
                  onChange={(n) => setDraft({ ...draft, atAge: n })}
                  ariaLabel="At age"
                  className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-sm text-white outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              {!isNew ? (
                <button
                  onClick={() => remove(draft.id)}
                  className="rounded-lg border border-line px-3 py-2 text-sm text-muted transition hover:border-red-400/50 hover:text-red-400"
                >
                  Remove
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setDraft(null)}
                  className="rounded-lg border border-line px-3 py-2 text-sm text-slate-200 transition hover:border-accent/50"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={!(draft.amount > 0)}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft disabled:opacity-50"
                >
                  {isNew ? "Add" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
