"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtCurrency } from "@/lib/au/format";
import type { AgedCarePlan } from "@/lib/au/types";

/** String-backed numeric input (clearable, clamps on blur) — same pattern as
 *  LifeEventsEditor's, so ages/amounts behave consistently across the board. */
function NumberInput({
  value, min, max, onChange, className, ariaLabel,
}: {
  value: number; min: number; max: number; onChange: (n: number) => void; className: string; ariaLabel: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(String(value)); }, [value, focused]);
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
      onBlur={() => { setFocused(false); const next = text === "" ? min : clamp(Number(text)); setText(String(next)); onChange(next); }}
      className={className}
    />
  );
}

/** Generic segmented toggle. */
function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { v: T; l: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-line bg-panel-2 p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`rounded-md px-2.5 py-1 font-medium transition ${value === o.v ? "bg-accent/20 text-accent" : "text-muted hover:text-white"}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

const DEFAULTS: AgedCarePlan = {
  enabled: true,
  framing: "probabilistic",
  careType: "residential",
  entryAge: 85,
  durationYears: 3,
  accommodation: "dap",
  radAmount: 570_000,
  radFundedFrom: "auto",
  homeAction: "keep-vacant",
};

const HOME_LABEL: Record<NonNullable<AgedCarePlan["homeAction"]>, string> = {
  sell: "Sell the home",
  "keep-vacant": "Keep the home",
  "keep-rent": "Keep & rent it",
};
const ACC_LABEL: Record<NonNullable<AgedCarePlan["accommodation"]>, string> = {
  rad: "Lump sum (RAD)", dap: "Daily (DAP)", combo: "A mix",
};

/** A one-line summary for the collapsed pill. */
function summary(ac: AgedCarePlan): string {
  if (ac.careType === "home") return `At-home care from ${ac.entryAge} for ${ac.durationYears} yr${ac.durationYears === 1 ? "" : "s"}`;
  const acc = ACC_LABEL[ac.accommodation ?? "dap"];
  const home = HOME_LABEL[ac.homeAction ?? "keep-vacant"];
  return `Residential from ${ac.entryAge} · ${ac.durationYears} yr${ac.durationYears === 1 ? "" : "s"} · ${acc} · ${home}`;
}

// The "aged care" committed panel of the What-If board: a possible late-life cost
// the user can MODEL and see flow through the plan. Like life events it lives on the
// base plan (baseline.agedCare). Presented as neutral, user-driven scenarios —
// general information, not advice.
export default function AgedCareEditor({
  value, minAge, maxAge, onChange,
}: {
  value: AgedCarePlan | undefined;
  minAge: number;
  maxAge: number;
  onChange: (agedCare: AgedCarePlan | undefined) => void;
}) {
  const enabled = !!value?.enabled;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AgedCarePlan>(value ?? DEFAULTS);

  const start = () => { setDraft(value ?? DEFAULTS); setOpen(true); };
  const save = () => {
    const clean: AgedCarePlan = {
      ...draft,
      enabled: true,
      entryAge: Math.min(maxAge, Math.max(minAge, Math.round(draft.entryAge))),
      durationYears: Math.max(1, Math.round(draft.durationYears)),
    };
    onChange(clean);
    setOpen(false);
  };
  const turnOff = () => { onChange(value ? { ...value, enabled: false } : undefined); setOpen(false); };

  const isResidential = draft.careType === "residential";
  const showRad = isResidential && (draft.accommodation ?? "dap") !== "dap";

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <h3 className="flex items-center gap-2 font-semibold text-white">
        <span aria-hidden>🏥</span> Aged care
        <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[11px] font-medium text-muted">explore</span>
      </h3>
      <p className="mt-0.5 text-xs text-muted">
        A possible late-life cost. Model it to see the effect —{" "}
        <Link href="/learn/aged-care-costs" className="text-accent hover:underline" target="_blank">how it works</Link>. General info, not advice.
      </p>

      {enabled && value ? (
        <button
          type="button"
          onClick={start}
          className="mt-3 flex w-full items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-left text-sm transition hover:border-accent/40"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-rose-400" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-slate-200">{summary(value)}</span>
          <span className="shrink-0 text-xs text-muted">edit</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          className="mt-3 rounded-lg border border-rose-400/40 bg-rose-400/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-400/20"
        >
          + Model aged care
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-panel p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-white">Model aged care</h4>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted transition hover:text-white">✕</button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-muted">Framing</div>
                  <div className="text-[11px] text-muted/70">{draft.framing === "probabilistic" ? "Weighted by the chance you need care" : "Assume a definite care phase"}</div>
                </div>
                <Segmented
                  value={draft.framing}
                  options={[{ v: "probabilistic", l: "If you need it" }, { v: "assume", l: "Assume it" }]}
                  onChange={(framing) => setDraft({ ...draft, framing })}
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted">Care type</span>
                <Segmented
                  value={draft.careType}
                  options={[{ v: "residential", l: "Residential" }, { v: "home", l: "At home" }]}
                  onChange={(careType) => setDraft({ ...draft, careType })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted">From age</label>
                  <NumberInput
                    value={draft.entryAge} min={minAge} max={maxAge}
                    onChange={(n) => setDraft({ ...draft, entryAge: n })}
                    ariaLabel="Entry age"
                    className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-white outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted">For (years)</label>
                  <NumberInput
                    value={draft.durationYears} min={1} max={30}
                    onChange={(n) => setDraft({ ...draft, durationYears: n })}
                    ariaLabel="Duration in years"
                    className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-white outline-none focus:border-accent"
                  />
                </div>
              </div>

              {isResidential && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-medium text-muted">Pay the room as</span>
                      <div className="text-[11px] text-muted/70">Lump sum is refundable; daily is ongoing</div>
                    </div>
                    <Segmented
                      value={draft.accommodation ?? "dap"}
                      options={[{ v: "dap", l: "Daily" }, { v: "rad", l: "Lump sum" }, { v: "combo", l: "Mix" }]}
                      onChange={(accommodation) => setDraft({ ...draft, accommodation })}
                    />
                  </div>

                  {showRad && (
                    <div>
                      <label className="block text-xs font-medium text-muted">Room price (RAD)</label>
                      <div className="mt-1 flex items-center gap-1 rounded-lg border border-line bg-panel-2 px-2.5 py-2">
                        <span className="text-muted">$</span>
                        <NumberInput
                          value={draft.radAmount ?? 570_000} min={0} max={5_000_000}
                          onChange={(n) => setDraft({ ...draft, radAmount: n })}
                          ariaLabel="Room price (RAD)"
                          className="w-full bg-transparent text-white outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted">The family home</span>
                    <Segmented
                      value={draft.homeAction ?? "keep-vacant"}
                      options={[{ v: "keep-vacant", l: "Keep" }, { v: "keep-rent", l: "Keep & rent" }, { v: "sell", l: "Sell" }]}
                      onChange={(homeAction) => setDraft({ ...draft, homeAction })}
                    />
                  </div>
                </>
              )}

              <p className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-[11px] leading-relaxed text-muted">
                Figures are estimates from a 2026 vintage of indexed rates and don&apos;t reflect a care assessment or
                your circumstances. This is general information, not advice — see{" "}
                <Link href="/learn/aged-care-funding" className="text-accent hover:underline" target="_blank">Paying for aged care</Link>{" "}
                and the government&apos;s My Aged Care service.
              </p>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              {enabled ? (
                <button onClick={turnOff} className="rounded-lg border border-line px-3 py-2 text-sm text-muted transition hover:border-red-400/50 hover:text-red-400">
                  Turn off
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button onClick={() => setOpen(false)} className="rounded-lg border border-line px-3 py-2 text-sm text-slate-200 transition hover:border-accent/50">
                  Cancel
                </button>
                <button onClick={save} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft">
                  {enabled ? "Save" : "Add"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
