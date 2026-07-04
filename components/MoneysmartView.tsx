"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import AdminTabs from "@/components/AdminTabs";
import { fmtCurrency } from "@/lib/au/format";
import type { EngineConfig } from "@/lib/au/config";
import {
  DEFAULT_MS_INPUT,
  MONEYSMART_URL,
  MS_POINTS,
  computeAppPoints,
  worksheet,
  type MsCheck,
  type MsPlanInput,
  type MsUnit,
} from "@/lib/au/scenarios/moneysmart";
import { deleteMoneysmartCheck, saveMoneysmartCheck } from "@/app/actions/moneysmart";

const DEFAULT_TOL: Record<MsUnit, number> = { money: 5, age: 2 };
const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const showVal = (unit: MsUnit, v: number) => (unit === "money" ? fmtCurrency(v) : `age ${v}`);

type EvalResult =
  | { state: "pending" }
  | { state: "pass" | "fail"; diff: number; pct?: number; ms: number };

function evaluate(unit: MsUnit, appVal: number, msRaw: string, tolRaw: string): EvalResult {
  const ms = parseFloat(msRaw);
  if (!Number.isFinite(ms)) return { state: "pending" };
  const tol = Number.isFinite(parseFloat(tolRaw)) ? parseFloat(tolRaw) : DEFAULT_TOL[unit];
  const diff = ms - appVal;
  if (unit === "age") return { state: Math.abs(diff) <= tol ? "pass" : "fail", diff, ms };
  const pct = appVal !== 0 ? (Math.abs(diff) / Math.abs(appVal)) * 100 : diff === 0 ? 0 : 999;
  return { state: pct <= tol ? "pass" : "fail", diff, pct, ms };
}

function Num({
  label, value, onChange, prefix, suffix, step = 1,
}: {
  label: string; value: number; onChange: (v: number) => void; prefix?: string; suffix?: string; step?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      <div className="flex items-center gap-1 rounded-lg border border-line bg-panel px-2 py-1.5">
        {prefix && <span className="text-xs text-muted">{prefix}</span>}
        <input
          type="number" value={Number.isNaN(value) ? "" : value} step={step}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full bg-transparent text-sm font-semibold tabular-nums text-white outline-none"
        />
        {suffix && <span className="text-xs text-muted">{suffix}</span>}
      </div>
    </label>
  );
}

function StatusPill({ state }: { state: "pass" | "fail" | "pending" }) {
  const map = {
    pass: "bg-emerald-500/15 text-emerald-400",
    fail: "bg-red-500/15 text-red-400",
    pending: "bg-slate-500/15 text-slate-400",
  };
  const label = state === "pass" ? "✓ within tolerance" : state === "fail" ? "✗ out of tolerance" : "— enter value";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[state]}`}>{label}</span>;
}

// ── A saved check, re-compared against the CURRENT engine ────────────────────
function SavedCheck({ check, config }: { check: MsCheck; config: EngineConfig }) {
  const [pending, start] = useTransition();
  const app = useMemo(() => computeAppPoints(check.input, config), [check.input, config]);
  const rows = MS_POINTS.map((p) => {
    const cp = check.points.find((x) => x.key === p.key);
    if (!cp) return null;
    const ev = evaluate(p.unit, app[p.key], String(cp.moneysmart), String(cp.tolerancePct));
    return { p, cp, appVal: app[p.key], ev };
  }).filter(Boolean) as { p: (typeof MS_POINTS)[number]; cp: MsCheck["points"][number]; appVal: number; ev: ReturnType<typeof evaluate> }[];
  const allPass = rows.every((r) => r.ev.state === "pass");

  return (
    <section className="rounded-2xl border border-line bg-panel-2 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-white">{check.name}</h3>
          <p className="text-[11px] text-muted">Recorded {new Date(check.savedAt).toLocaleDateString("en-AU")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${allPass ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
            {allPass ? "engine matches Moneysmart" : "engine drifted"}
          </span>
          <button
            onClick={() => start(() => deleteMoneysmartCheck(check.key))}
            disabled={pending}
            className="rounded-lg px-2 py-1 text-xs text-muted transition hover:text-red-400 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-panel text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-1.5 text-left font-medium">Point</th>
              <th className="px-3 py-1.5 text-right font-medium">Moneysmart</th>
              <th className="px-3 py-1.5 text-right font-medium">Engine (now)</th>
              <th className="px-3 py-1.5 text-right font-medium">Tol.</th>
              <th className="px-3 py-1.5 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.p.key} className="border-t border-line">
                <td className="px-3 py-1.5 text-slate-200">{r.p.label}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-white">{showVal(r.p.unit, r.cp.moneysmart)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">{showVal(r.p.unit, r.appVal)}</td>
                <td className="px-3 py-1.5 text-right text-xs text-muted">{r.cp.tolerancePct}{r.p.unit === "money" ? "%" : "y"}</td>
                <td className="px-3 py-1.5 text-right"><StatusPill state={r.ev.state} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {check.notes && <p className="mt-2 text-xs text-muted">{check.notes}</p>}
    </section>
  );
}

export default function MoneysmartView({
  email, staleCount, checks, config,
}: {
  email: string; staleCount: number; checks: MsCheck[]; config: EngineConfig;
}) {
  const [input, setInput] = useState<MsPlanInput>(DEFAULT_MS_INPUT);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [entered, setEntered] = useState<Record<string, { value: string; tol: string }>>(
    () => Object.fromEntries(MS_POINTS.map((p) => [p.key, { value: "", tol: String(DEFAULT_TOL[p.unit]) }])),
  );
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);

  const app = useMemo(() => computeAppPoints(input, config), [input, config]);
  const sheet = useMemo(() => worksheet(input, config), [input, config]);

  const set = (patch: Partial<MsPlanInput>) => setInput((p) => ({ ...p, ...patch }));
  const setPerson = (i: number, patch: Partial<MsPlanInput["people"][number]>) =>
    setInput((p) => ({ ...p, people: p.people.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const setHousehold = (hh: "single" | "couple") =>
    setInput((p) => ({
      ...p, household: hh,
      people: hh === "couple" && p.people.length === 1
        ? [p.people[0], { currentAge: p.people[0].currentAge, salary: 70_000, superBalance: 200_000 }]
        : hh === "single" ? [p.people[0]] : p.people,
    }));
  const setEnt = (key: string, patch: Partial<{ value: string; tol: string }>) =>
    setEntered((e) => ({ ...e, [key]: { ...e[key], ...patch } }));

  const canSave = name.trim() !== "" && MS_POINTS.some((p) => entered[p.key].value.trim() !== "");

  const save = () => {
    const check: MsCheck = {
      key: slug(name), name: name.trim(), input,
      points: MS_POINTS.filter((p) => entered[p.key].value.trim() !== "").map((p) => ({
        key: p.key,
        moneysmart: parseFloat(entered[p.key].value),
        tolerancePct: Number.isFinite(parseFloat(entered[p.key].tol)) ? parseFloat(entered[p.key].tol) : DEFAULT_TOL[p.unit],
      })),
      notes: notes.trim(),
      savedAt: new Date().toISOString(),
    };
    start(async () => {
      await saveMoneysmartCheck(check);
      setSaved(check.name);
    });
  };

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-white">← Planner</Link>
        <span className="text-muted">{email} · admin</span>
      </div>
      <AdminTabs active="moneysmart" staleCount={staleCount} />

      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">Backoffice · Moneysmart</div>
        <h1 className="mt-1 text-3xl font-bold text-white">External oracle — Moneysmart cross-check</h1>
        <p className="mt-2 max-w-3xl text-muted">
          The analytical scenario tests share this engine&apos;s assumptions, so they can&apos;t catch where the
          <em> model </em>is simplified (fees, Division 293, the Transfer Balance Cap). Moneysmart (ASIC&apos;s
          government calculator) is genuinely independent. Build a persona, follow the worksheet to enter it into
          Moneysmart, transcribe the results, and save — a saved check becomes a committed, external-anchored test.
        </p>
      </header>

      {/* 1. Build */}
      <section className="mb-5 rounded-2xl border border-line bg-panel p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-accent">1 · Build the persona</h2>
        <div className="mb-3 flex gap-1 rounded-lg border border-line bg-panel-2 p-1 text-sm w-fit">
          {(["single", "couple"] as const).map((hh) => (
            <button key={hh} onClick={() => setHousehold(hh)}
              className={`rounded-md px-4 py-1 font-semibold capitalize transition ${input.household === hh ? "bg-accent text-ink" : "text-muted hover:text-white"}`}>
              {hh}
            </button>
          ))}
        </div>
        {input.people.map((p, i) => (
          <div key={i} className="mb-3 grid grid-cols-3 gap-3">
            <Num label={`Age${input.household === "couple" ? (i ? " (partner)" : " (you)") : ""}`} value={p.currentAge} onChange={(v) => setPerson(i, { currentAge: v })} suffix="yrs" />
            <Num label="Salary" value={p.salary} onChange={(v) => setPerson(i, { salary: v })} prefix="$" step={1000} />
            <Num label="Super today" value={p.superBalance} onChange={(v) => setPerson(i, { superBalance: v })} prefix="$" step={1000} />
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Num label="Retire at" value={input.retirementAge} onChange={(v) => set({ retirementAge: v })} suffix="yrs" />
          <Num label="Retirement income" value={input.targetSpending} onChange={(v) => set({ targetSpending: v })} prefix="$" step={1000} />
          <Num label="Return" value={input.investmentReturn} onChange={(v) => set({ investmentReturn: v })} suffix="%" step={0.1} />
          <Num label="Inflation" value={input.inflation} onChange={(v) => set({ inflation: v })} suffix="%" step={0.1} />
          <Num label="Outside super" value={input.outsideSuper} onChange={(v) => set({ outsideSuper: v })} prefix="$" step={1000} />
          <Num label="Planning age" value={input.lifeExpectancy} onChange={(v) => set({ lifeExpectancy: v })} suffix="yrs" />
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">Home</span>
            <button onClick={() => set({ homeowner: !input.homeowner })}
              className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm font-semibold text-white">
              {input.homeowner ? "Owner" : "Renter"}
            </button>
          </label>
        </div>
      </section>

      {/* 2. Worksheet */}
      <section className="mb-5 rounded-2xl border border-line bg-panel p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">2 · Enter it into Moneysmart</h2>
          <a href={MONEYSMART_URL} target="_blank" rel="noreferrer"
            className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent transition hover:bg-accent/20">
            Open Moneysmart Retirement Planner ↗
          </a>
        </div>
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
          <div className="mb-1 font-semibold">First, align the assumptions so the two are comparable:</div>
          <ul className="space-y-1">
            {sheet.align.map((a) => <li key={a} className="flex gap-2"><span>•</span><span>{a}</span></li>)}
          </ul>
        </div>
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <tbody>
              {sheet.lines.map((l, i) => (
                <tr key={i} className={`border-b border-line last:border-0 ${l.warn ? "bg-amber-500/5" : ""}`}>
                  <td className="px-3 py-2 text-muted">{l.field}</td>
                  <td className="px-3 py-2 text-right font-semibold text-white">
                    {l.enter}
                    {l.note && <div className="mt-0.5 text-left text-[11px] font-normal text-amber-300">{l.note}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Compare & save */}
      <section className="mb-8 rounded-2xl border border-line bg-panel p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-accent">3 · Transcribe results &amp; compare</h2>
        <div className="space-y-2.5">
          {MS_POINTS.map((p) => {
            const e = entered[p.key];
            const ev = evaluate(p.unit, app[p.key], e.value, e.tol);
            return (
              <div key={p.key} className="rounded-xl border border-line bg-panel-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-white">{p.label}</div>
                  <StatusPill state={ev.state} />
                </div>
                <p className="mb-2 text-[11px] text-muted">{p.hint}</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-accent">This engine</div>
                    <div className="text-sm font-bold tabular-nums text-white">{showVal(p.unit, app[p.key])}</div>
                  </div>
                  <label>
                    <span className="text-[10px] uppercase tracking-wide text-muted">Moneysmart {p.unit === "money" ? "$" : "age"}</span>
                    <input value={e.value} onChange={(ev2) => setEnt(p.key, { value: ev2.target.value })} type="number" placeholder="—"
                      className="w-full rounded-lg border border-line bg-panel px-2 py-1 text-sm font-semibold tabular-nums text-white outline-none focus:border-accent/50" />
                  </label>
                  <label>
                    <span className="text-[10px] uppercase tracking-wide text-muted">Tolerance {p.unit === "money" ? "%" : "yrs"}</span>
                    <input value={e.tol} onChange={(ev2) => setEnt(p.key, { tol: ev2.target.value })} type="number"
                      className="w-full rounded-lg border border-line bg-panel px-2 py-1 text-sm tabular-nums text-white outline-none focus:border-accent/50" />
                  </label>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted">Difference</div>
                    <div className="text-sm font-semibold tabular-nums text-slate-200">
                      {ev.state === "pending" ? "—" : p.unit === "money"
                        ? `${ev.diff! >= 0 ? "+" : "−"}${fmtCurrency(Math.abs(Math.round(ev.diff!)))} (${ev.pct!.toFixed(1)}%)`
                        : `${ev.diff! >= 0 ? "+" : "−"}${Math.abs(ev.diff!)} yr`}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">Scenario name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Moneysmart — Single 55, $300k super"
              className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-white outline-none focus:border-accent/50" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">Notes (Moneysmart version, caveats)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Moneysmart FY2026-27, fees set to 0"
              className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-white outline-none focus:border-accent/50" />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={save} disabled={!canSave || pending}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft disabled:opacity-40">
            {pending ? "Saving…" : "Save as external-anchored test →"}
          </button>
          {saved && <span className="text-xs text-emerald-400">Saved “{saved}” — it&apos;s now a committed test.</span>}
        </div>
      </section>

      {/* Saved checks */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        Saved external checks ({checks.length}) — re-compared against the current engine
      </h2>
      {checks.length === 0 ? (
        <div className="rounded-2xl border border-line bg-panel-2 p-8 text-center text-muted">
          None yet. Build a persona above, run it through Moneysmart, and save the results.
        </div>
      ) : (
        <div className="space-y-3">
          {checks.map((c) => <SavedCheck key={c.key} check={c} config={config} />)}
        </div>
      )}
    </main>
  );
}
