"use client";

import { useState } from "react";

type Mode = "copy" | "scratch";

/** "New scenario" dialog: choose whether to start from a copy of the current scenario
 *  or from scratch, and give it a name. Presentational — the parent does the create. */
export default function NewScenarioModal({
  currentName,
  existingNames,
  pending,
  canCopy,
  onCreate,
  onClose,
}: {
  currentName: string | null;
  existingNames: string[];
  pending: boolean;
  canCopy: boolean; // false when there's no built plan to copy yet
  onCreate: (name: string, mode: Mode) => void;
  onClose: () => void;
}) {
  const dedupe = (base: string) => {
    if (!existingNames.includes(base)) return base;
    for (let i = 2; ; i++) {
      const candidate = `${base} ${i}`;
      if (!existingNames.includes(candidate)) return candidate;
    }
  };
  const copyDefault = dedupe(`Copy of ${currentName ?? "scenario"}`);
  const scratchDefault = dedupe("New scenario");

  const [mode, setMode] = useState<Mode>(canCopy ? "copy" : "scratch");
  const [name, setName] = useState(canCopy ? copyDefault : scratchDefault);

  const pick = (m: Mode) => {
    setMode(m);
    setName(m === "copy" ? copyDefault : scratchDefault);
  };
  const submit = () => {
    const n = name.trim();
    if (n && !pending) onCreate(n, mode);
  };

  const options: { m: Mode; title: string; desc: string; disabled?: boolean }[] = [
    {
      m: "copy",
      title: "Based on this scenario",
      desc: "Start from a copy of the plan you’re viewing now — then change what you like.",
      disabled: !canCopy,
    },
    {
      m: "scratch",
      title: "Start from scratch",
      desc: "A blank plan you build from the beginning.",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-panel p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">New scenario</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-0.5 text-muted transition hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2">
          {options.map((o) => (
            <button
              key={o.m}
              onClick={() => !o.disabled && pick(o.m)}
              disabled={o.disabled}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                mode === o.m
                  ? "border-accent bg-accent/10"
                  : "border-line bg-panel-2 hover:border-accent/40"
              } ${o.disabled ? "cursor-not-allowed opacity-40" : ""}`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  mode === o.m ? "border-accent" : "border-muted"
                }`}
              >
                {mode === o.m && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">{o.title}</span>
                <span className="block text-xs text-muted">{o.desc}</span>
              </span>
            </button>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Scenario name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            autoFocus
            placeholder="Name this scenario"
            className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-white outline-none focus:border-accent"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-line bg-panel-2 px-4 py-2 text-sm font-medium text-slate-200 transition hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={pending || !name.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create scenario"}
          </button>
        </div>
      </div>
    </div>
  );
}
