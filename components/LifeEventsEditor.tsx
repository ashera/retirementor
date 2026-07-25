"use client";

import { fmtCurrency } from "@/lib/au/format";
import type { LifeEvent } from "@/lib/au/types";

// The "committed" bucket of the What-If hub: a user-managed list of one-off
// cashflows the user EXPECTS to happen (inheritance, a big trip, helping the kids).
// Unlike the exploratory strategy cards, these live on the base plan — they're part
// of the projection, not a toggle. Editing them replaces the whole array via
// onChange; the host puts it on `baseline.lifeEvents`, so it flows into the composed
// chart, Monte Carlo, stress test and save automatically.

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
}: {
  events: LifeEvent[];
  minAge: number;
  maxAge: number;
  defaultAge: number;
  onChange: (events: LifeEvent[]) => void;
}) {
  const update = (id: string, patch: Partial<LifeEvent>) =>
    onChange(events.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id: string) => onChange(events.filter((e) => e.id !== id));
  const add = (kind: LifeEvent["kind"]) =>
    onChange([
      ...events,
      {
        id: newId(),
        kind,
        amount: kind === "income" ? 100_000 : 30_000,
        atAge: Math.min(maxAge, Math.max(minAge, Math.round(defaultAge))),
        label: kind === "income" ? "Inheritance" : "Big trip",
      },
    ]);

  const valid = events.filter((e) => e.amount > 0);
  const totalIn = valid.filter((e) => e.kind === "income").reduce((s, e) => s + e.amount, 0);
  const totalOut = valid.filter((e) => e.kind === "expense").reduce((s, e) => s + e.amount, 0);

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-semibold text-white">
            <span aria-hidden>📌</span> Life events
            <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[11px] font-medium text-muted">committed</span>
          </h3>
          <p className="mt-0.5 text-sm text-muted">
            One-off amounts you <span className="text-slate-200">expect</span> to happen — an inheritance, a big trip,
            helping the kids. They&apos;re part of your plan, not a what-if.
          </p>
        </div>
        {valid.length > 0 && (
          <div className="shrink-0 text-right text-xs text-muted">
            {totalIn > 0 && <div className="text-accent">+{fmtCurrency(totalIn)} in</div>}
            {totalOut > 0 && <div className="text-amber-300">−{fmtCurrency(totalOut)} out</div>}
          </div>
        )}
      </div>

      {events.length > 0 && (
        <div className="mt-3 space-y-2">
          {events.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel-2 px-3 py-2"
            >
              <input
                value={e.label ?? ""}
                onChange={(ev) => update(e.id, { label: ev.target.value })}
                placeholder={e.kind === "income" ? "e.g. Inheritance" : "e.g. Big trip"}
                className="min-w-[7rem] flex-1 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm text-white outline-none focus:border-accent"
              />
              <Segmented value={e.kind} onChange={(kind) => update(e.id, { kind })} />
              <div className="flex items-center gap-1 rounded-lg border border-line bg-panel px-2 py-1.5 text-sm">
                <span className="text-muted">$</span>
                <input
                  type="number"
                  min={0}
                  step={5_000}
                  value={e.amount}
                  onChange={(ev) => update(e.id, { amount: Math.max(0, Number(ev.target.value) || 0) })}
                  className="w-24 bg-transparent text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-line bg-panel px-2 py-1.5 text-sm">
                <span className="text-muted">at age</span>
                <input
                  type="number"
                  min={minAge}
                  max={maxAge}
                  value={e.atAge}
                  onChange={(ev) =>
                    update(e.id, { atAge: Math.min(maxAge, Math.max(minAge, Math.round(Number(ev.target.value) || minAge))) })
                  }
                  className="w-14 bg-transparent text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <button
                type="button"
                onClick={() => remove(e.id)}
                aria-label="Remove event"
                title="Remove"
                className="ml-auto shrink-0 rounded-lg border border-line px-2 py-1.5 text-muted transition hover:border-red-400/50 hover:text-red-400"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => add("income")}
          className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition hover:bg-accent/20"
        >
          + Money in (windfall)
        </button>
        <button
          type="button"
          onClick={() => add("expense")}
          className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-sm font-medium text-amber-300 transition hover:bg-amber-400/20"
        >
          + Money out (one-off expense)
        </button>
      </div>
    </div>
  );
}
