"use client";

import { useEffect, useState } from "react";
import { fmtCurrency } from "@/lib/au/format";
import type { IncomeStream } from "@/lib/au/types";

/** String-backed numeric input (clearable, clamps on blur) — same as LifeEventsEditor. */
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
    return `is-${Math.floor(performance.now() * 1000)}-${Math.round(performance.now() % 1000)}`;
  }
}

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition ${
        on ? "border-accent/40 bg-accent/10 text-slate-200" : "border-line bg-panel-2 text-muted hover:text-white"
      }`}
    >
      <span>
        <span className="font-medium text-slate-200">{label}</span>
        <span className="block text-[11px] text-muted">{hint}</span>
      </span>
      <span className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${on ? "bg-accent/20 text-accent" : "bg-panel text-muted"}`}>
        {on ? "Yes" : "No"}
      </span>
    </button>
  );
}

/**
 * Recurring income streams — a defined-benefit pension, annuity, or foreign pension
 * (e.g. US Social Security). Lives on the base plan next to life events. Compact list;
 * add/edit opens a modal. Defaults: indexed, taxable, and counted for the Age Pension
 * income test.
 */
export default function IncomeStreamsEditor({
  streams,
  minAge,
  maxAge,
  defaultAge,
  onChange,
}: {
  streams: IncomeStream[];
  minAge: number;
  maxAge: number;
  defaultAge: number;
  onChange: (streams: IncomeStream[]) => void;
}) {
  const [draft, setDraft] = useState<IncomeStream | null>(null);
  const clampAge = (a: number) => Math.min(maxAge, Math.max(minAge, Math.round(a)));

  const startAdd = () =>
    setDraft({
      id: newId(),
      label: "",
      perYear: 0,
      fromAge: clampAge(defaultAge),
      untilAge: undefined,
      indexed: true,
      taxable: true,
      assessable: true,
    });
  const save = () => {
    if (!draft) return;
    const clean: IncomeStream = {
      ...draft,
      fromAge: clampAge(draft.fromAge),
      untilAge: draft.untilAge != null ? clampAge(draft.untilAge) : undefined,
      perYear: Math.max(0, draft.perYear),
      label: draft.label?.trim() || "Income stream",
    };
    onChange(streams.some((s) => s.id === clean.id) ? streams.map((s) => (s.id === clean.id ? clean : s)) : [...streams, clean]);
    setDraft(null);
  };
  const remove = (id: string) => {
    onChange(streams.filter((s) => s.id !== id));
    setDraft(null);
  };

  const shown = streams.filter((s) => s.perYear > 0 || draft?.id === s.id);

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <h3 className="flex items-center gap-2 font-semibold text-white">
        <span aria-hidden>💵</span> Income streams
        <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[11px] font-medium text-muted">committed</span>
      </h3>
      <p className="mt-0.5 text-xs text-muted">
        Ongoing income for life — a <span className="text-slate-200">defined-benefit pension</span>, annuity, or foreign
        pension (e.g. US Social Security). Counts toward the Age Pension income test.
      </p>

      {shown.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {shown.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setDraft(s)}
              className="flex w-full items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-left text-sm transition hover:border-accent/40"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-teal-300" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-slate-200">{s.label?.trim() || "Income stream"}</span>
              <span className="shrink-0 tabular-nums text-teal-300">{fmtCurrency(s.perYear)}/yr</span>
              <span className="shrink-0 text-xs text-muted">
                {s.fromAge}
                {s.untilAge != null ? `–${s.untilAge}` : "+"}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={startAdd}
          className="rounded-lg border border-teal-400/40 bg-teal-400/10 px-2.5 py-1.5 text-xs font-medium text-teal-300 transition hover:bg-teal-400/20"
        >
          + Add income stream
        </button>
      </div>

      {draft && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDraft(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-line bg-panel p-4 shadow-2xl">
            <h4 className="mb-3 font-semibold text-white">Income stream</h4>
            <label className="block text-xs font-medium text-muted">Name</label>
            <input
              type="text"
              value={draft.label ?? ""}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="e.g. US Social Security"
              className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-white outline-none focus:border-accent"
            />

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted">Amount ($/yr, today&apos;s $)</label>
                <NumberInput
                  value={draft.perYear}
                  min={0}
                  max={1_000_000}
                  onChange={(perYear) => setDraft({ ...draft, perYear })}
                  ariaLabel="Amount per year"
                  className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-white outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted">Starts at age</label>
                <NumberInput
                  value={draft.fromAge}
                  min={minAge}
                  max={maxAge}
                  onChange={(fromAge) => setDraft({ ...draft, fromAge })}
                  ariaLabel="Starts at age"
                  className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-white outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={draft.untilAge == null}
                  onChange={(e) => setDraft({ ...draft, untilAge: e.target.checked ? undefined : clampAge(maxAge) })}
                  className="h-4 w-4 accent-teal-500"
                />
                For life
              </label>
              {draft.untilAge != null && (
                <div className="mt-2">
                  <label className="block text-xs font-medium text-muted">Stops at age</label>
                  <NumberInput
                    value={draft.untilAge}
                    min={minAge}
                    max={maxAge}
                    onChange={(untilAge) => setDraft({ ...draft, untilAge })}
                    ariaLabel="Stops at age"
                    className="mt-1 w-32 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-white outline-none focus:border-accent"
                  />
                </div>
              )}
            </div>

            <div className="mt-3 space-y-1.5">
              <Toggle
                on={draft.indexed ?? true}
                onChange={(indexed) => setDraft({ ...draft, indexed })}
                label="Indexed for inflation"
                hint="Keeps its value over time (most DB pensions & US SS). Off = fixed dollars, erodes."
              />
              <Toggle
                on={draft.taxable ?? true}
                onChange={(taxable) => setDraft({ ...draft, taxable })}
                label="Taxable income"
                hint="Taxed as ordinary income. Off for a tax-free source (e.g. an Australian super pension from 60)."
              />
              <Toggle
                on={draft.assessable ?? true}
                onChange={(assessable) => setDraft({ ...draft, assessable })}
                label="Counts for the Age Pension"
                hint="Assessed under the income test (reduces any Age Pension). On for DB & foreign pensions."
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => remove(draft.id)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition hover:text-red-400"
              >
                Remove
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-soft"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
