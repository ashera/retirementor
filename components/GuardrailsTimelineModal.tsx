"use client";

import { useMemo, useState } from "react";
import {
  Line,
  LineChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan } from "@/lib/au/types";
import { fmtCurrency, fmtCompact } from "@/lib/au/format";
import { guardrailsTimeline, type GuardrailsTimelinePoint } from "@/lib/au/guardrails";

function SpendTooltip({ active, payload }: { active?: boolean; payload?: { payload: GuardrailsTimelinePoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const tag = p.action === "cut" ? "cut ▼" : p.action === "raise" ? "raise ▲" : p.action === "start" ? "start" : "held";
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold text-white">Age {p.age}</div>
      <div className="tabular-nums text-slate-200">{fmtCurrency(p.spend)}/yr</div>
      <div className="tabular-nums text-muted">rate {(p.rate * 100).toFixed(1)}% · {tag}</div>
    </div>
  );
}

export default function GuardrailsTimelineModal({
  open,
  onClose,
  plan,
  config,
}: {
  open: boolean;
  onClose: () => void;
  plan: RetirementPlan;
  config: EngineConfig;
}) {
  const [view, setView] = useState<"spend" | "rate">("spend");
  const tl = useMemo(() => (open ? guardrailsTimeline(plan, config) : null), [open, plan, config]);
  if (!open || !tl) return null;

  const raiseAge = tl.points.find((p) => p.action === "raise")?.age ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/whatif-icon.png" alt="" aria-hidden className="h-7 w-7 shrink-0" style={{ mixBlendMode: "lighten" }} />
            <h2 className="truncate text-base font-bold text-white">Guardrails: the raise &amp; cut timeline</h2>
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

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-sm text-slate-300">
            An illustration: you retire straight into a {tl.dipYears}-year market downturn (the hardest test), then
            returns run at your assumed average. Here&apos;s how guardrails flex your spending — and why a bad start
            leaves it below where you began for the rest of retirement.
          </p>

          {/* View toggle */}
          <div className="flex gap-1 rounded-lg border border-line bg-panel-2 p-1 text-xs">
            {([
              ["spend", "Spending"],
              ["rate", "Withdrawal rate vs rails"],
            ] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  view === v ? "bg-accent text-ink" : "text-muted hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-line bg-panel-2 p-3">
            <ResponsiveContainer width="100%" height={240}>
              {view === "spend" ? (
                <LineChart data={tl.points} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#232c40" vertical={false} />
                  <XAxis dataKey="age" stroke="#8b97ad" fontSize={11} tickLine={false} axisLine={{ stroke: "#232c40" }} />
                  <YAxis stroke="#8b97ad" fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={fmtCompact} />
                  <Tooltip content={<SpendTooltip />} />
                  <ReferenceLine y={tl.start} stroke="#94a3b8" strokeDasharray="5 4" label={{ value: `Started ${fmtCompact(tl.start)}`, position: "insideTopLeft", fill: "#94a3b8", fontSize: 10 }} />
                  <ReferenceLine y={tl.floor} stroke="#f59e0b" strokeDasharray="5 4" label={{ value: `Floor ${fmtCompact(tl.floor)}`, position: "insideBottomLeft", fill: "#f59e0b", fontSize: 10 }} />
                  {tl.pensionAge != null && (
                    <ReferenceLine x={tl.pensionAge} stroke="#a78bfa" strokeDasharray="4 3" label={{ value: "Age Pension", position: "top", fill: "#a78bfa", fontSize: 10 }} />
                  )}
                  <Line type="stepAfter" dataKey="spend" stroke="#34d399" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              ) : (
                <LineChart data={tl.points.map((p) => ({ ...p, ratePct: +(p.rate * 100).toFixed(2) }))} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#232c40" vertical={false} />
                  <XAxis dataKey="age" stroke="#8b97ad" fontSize={11} tickLine={false} axisLine={{ stroke: "#232c40" }} />
                  <YAxis stroke="#8b97ad" fontSize={11} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    formatter={(v: number) => [`${v}%`, "Withdrawal rate"]}
                    labelFormatter={(l) => `Age ${l}`}
                    contentStyle={{ background: "#0f1520", border: "1px solid #232c40", borderRadius: 8, fontSize: 12 }}
                  />
                  <ReferenceLine y={+(tl.upperRail * 100).toFixed(2)} stroke="#f87171" strokeDasharray="5 4" label={{ value: "Cut above", position: "insideTopRight", fill: "#f87171", fontSize: 10 }} />
                  <ReferenceLine y={+(tl.lowerRail * 100).toFixed(2)} stroke="#34d399" strokeDasharray="5 4" label={{ value: "Raise below", position: "insideBottomRight", fill: "#34d399", fontSize: 10 }} />
                  {tl.pensionAge != null && (
                    <ReferenceLine x={tl.pensionAge} stroke="#a78bfa" strokeDasharray="4 3" label={{ value: "Age Pension", position: "top", fill: "#a78bfa", fontSize: 10 }} />
                  )}
                  <Line type="monotone" dataKey="ratePct" stroke="#38bdf8" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* Why it stays low */}
          <div className="space-y-3 text-sm text-slate-300">
            <h3 className="font-semibold text-white">Why it takes so long to recover</h3>
            <ol className="space-y-2">
              <li className="flex gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-red-500/15 px-1.5 text-[11px] font-semibold text-red-400">1</span>
                <span>
                  <strong className="text-white">Cuts cascade fast.</strong> As the downturn drops your portfolio, your
                  withdrawal rate climbs past the upper rail ({(tl.upperRail * 100).toFixed(1)}%), so spending steps down
                  ~10% a year — from {fmtCurrency(tl.start)} to your {fmtCurrency(tl.floor)} floor in just a few years.
                  Each cut helps, but the shrinking balance keeps the rate high.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-violet-500/15 px-1.5 text-[11px] font-semibold text-violet-400">2</span>
                <span>
                  <strong className="text-white">The Age Pension does the real recovery{tl.pensionAge != null ? `, at ${tl.pensionAge}` : ""}.</strong>{" "}
                  It covers a big slice of your spending, so the draw <em>on your portfolio</em> — the rate the rails
                  watch — drops below the lower rail ({(tl.lowerRail * 100).toFixed(1)}%){raiseAge != null ? `, earning a raise at ${raiseAge}` : ""}.
                  Not the market — the pension.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-slate-500/20 px-1.5 text-[11px] font-semibold text-slate-300">3</span>
                <span>
                  <strong className="text-white">Then it plateaus — below where you started</strong> (around{" "}
                  {fmtCurrency(tl.plateauSpend)}). The early crash <em>permanently</em> shrank your portfolio, so the
                  rate never drifts low enough again to justify climbing all the way back. That&apos;s
                  sequence-of-returns risk: guardrails keep you safe by adapting, but a bad start means spending less for
                  good — not a temporary dip.
                </span>
              </li>
            </ol>
            <p className="rounded-lg border border-line bg-ink/40 px-3 py-2 text-xs text-muted">
              The rails are set from your <em>initial</em> rate on your <em>initial</em> balance. Once a crash resets
              your wealth lower, spending safely at the reduced level is exactly right — a full recovery would mean
              overspending a portfolio that never recovered. Guardrails are working; the loss is real.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
