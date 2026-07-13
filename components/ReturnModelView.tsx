"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  BarChart, Bar, Cell, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip,
} from "recharts";
import AdminTabs from "@/components/AdminTabs";
import { setReturnModel } from "@/app/actions/admin";
import { fmtCurrency } from "@/lib/au/format";
import type { HistoricalStats } from "@/lib/au/historicalReturns";

type Model = "gaussian" | "bootstrap";
interface PreviewRow { spend: number; gaussian: number; bootstrap: number }

const pct = (x: number, dp = 1) => `${(x * 100).toFixed(dp)}%`;
const UP = "#34d399";
const DOWN = "#f87171";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-white">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export default function ReturnModelView({
  model, blockYears, stats, series, preview, sampleOutside,
  staleCount = 0, feedbackCount = 0, adviserCount = 0,
}: {
  model: Model;
  blockYears: number;
  stats: HistoricalStats;
  series: { year: number; real: number }[];
  preview: PreviewRow[];
  sampleOutside: number;
  staleCount?: number;
  feedbackCount?: number;
  adviserCount?: number;
}) {
  const [sel, setSel] = useState<Model>(model);
  const [block, setBlock] = useState(blockYears);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const dirty = sel !== model || block !== blockYears;
  const save = () =>
    start(async () => {
      const r = await setReturnModel(sel, block);
      setMsg(r.ok ? "Saved — the live planner now uses this model." : r.error ?? "Failed.");
      setTimeout(() => setMsg(null), 3500);
    });

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-white">← Planner</Link>
        <span className="text-muted">admin</span>
      </div>

      <AdminTabs active="returns" staleCount={staleCount} feedbackCount={feedbackCount} adviserCount={adviserCount} />

      <header className="mb-6">
        <h1 className="text-xl font-semibold text-white">Monte Carlo return model</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          How the likelihood engine <em>sequences</em> future returns. <strong className="text-slate-200">Gaussian</strong> draws
          each year independently from the plan&apos;s mean &amp; volatility. <strong className="text-slate-200">Historical
          bootstrap</strong> uses the same mean &amp; volatility but takes its year-to-year sequence from real market
          history (block-resampled), restoring the mean-reversion and volatility-clustering that independent draws
          destroy over a long retirement. <strong className="text-slate-200">Only the sequencing differs</strong> — the
          likelihood stays consistent with the plan&apos;s own return assumptions. Applies to every user&apos;s projection.
        </p>
      </header>

      {/* Active-model control */}
      <section className="mb-8 rounded-xl border border-line bg-panel p-5">
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-wide text-muted">Active model</div>
            <div className="inline-flex rounded-lg border border-line bg-panel-2 p-1">
              {(["gaussian", "bootstrap"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setSel(m)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                    sel === m ? "bg-accent text-ink" : "text-muted hover:text-white"
                  }`}
                >
                  {m === "gaussian" ? "Gaussian" : "Historical bootstrap"}
                </button>
              ))}
            </div>
          </div>

          <div className={sel === "bootstrap" ? "" : "pointer-events-none opacity-40"}>
            <label className="mb-2 block text-[11px] uppercase tracking-wide text-muted">Block length (years)</label>
            <input
              type="number" min={1} max={40} value={block}
              onChange={(e) => setBlock(Math.round(+e.target.value))}
              className="w-24 rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-right tabular-nums text-white outline-none focus:border-accent"
            />
          </div>

          <div className="ml-auto flex items-center gap-3">
            {msg && <span className="text-xs text-muted">{msg}</span>}
            <button
              onClick={save}
              disabled={!dirty || pending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition disabled:opacity-40"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">
          Currently live: <strong className="text-slate-200">{model === "gaussian" ? "Gaussian" : `Historical bootstrap · ${blockYears}-year blocks`}</strong>.
          Blocks stitch runs of consecutive years; shorter blocks approach independent draws, longer blocks preserve
          whole market cycles (a full boom/bust). ~10 years is a good middle.
        </p>
      </section>

      {/* Historical data */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-white">Historical data · real equity total returns</h2>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Coverage" value={`${stats.n} yrs`} sub={`${stats.startYear}–${stats.endYear}`} />
          <Stat label="Mean (compound)" value={pct(stats.geoMean)} sub={`${pct(stats.arithMean)} arithmetic`} />
          <Stat label="Volatility" value={pct(stats.vol)} sub="std dev, real" />
          <Stat label="Best year" value={pct(stats.best.real, 0)} sub={String(stats.best.year)} />
          <Stat label="Worst year" value={pct(stats.worst.real, 0)} sub={String(stats.worst.year)} />
          <Stat label="Down years" value={`${stats.negativeYears}`} sub={`of ${stats.n}`} />
        </div>

        <div className="rounded-xl border border-line bg-panel p-4">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
              <XAxis
                dataKey="year" tick={{ fill: "#94a3b8", fontSize: 11 }}
                ticks={[1930, 1945, 1960, 1975, 1990, 2005, 2020]} tickLine={false} axisLine={{ stroke: "#334155" }}
              />
              <YAxis
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`} tick={{ fill: "#94a3b8", fontSize: 11 }}
                tickLine={false} axisLine={false} width={40}
              />
              <ReferenceLine y={0} stroke="#475569" />
              <Tooltip
                cursor={{ fill: "rgba(148,163,184,0.08)" }}
                contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#e2e8f0" }}
                formatter={(v: number) => [pct(v), "Real return"]}
              />
              <Bar dataKey="real" isAnimationActive={false}>
                {series.map((d) => (
                  <Cell key={d.year} fill={d.real >= 0 ? UP : DOWN} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-muted">
            S&amp;P 500 annual total return deflated by US CPI (Damodaran, NYU Stern · usinflationcalculator.com),
            {" "}{stats.startYear}–{stats.endYear}. US is a proxy: the longest clean series, and AU/global equities are
            highly correlated. Swap an AU series into <code className="text-slate-300">lib/au/historicalReturns.ts</code> to change it.
            {" "}<strong className="text-slate-300">The model uses only the SHAPE of this series</strong> — standardised to
            zero-mean, unit-variance and re-expressed at each plan&apos;s own return &amp; volatility — so history&apos;s
            {" "}~{pct(stats.geoMean)} / ~{pct(stats.vol)} levels are <em>not</em> imposed on anyone&apos;s plan.
          </p>
        </div>
      </section>

      {/* Preview */}
      <section className="mb-10">
        <h2 className="mb-1 text-sm font-semibold text-white">How the models compare</h2>
        <p className="mb-3 text-xs text-muted">
          Chance the money lasts to age 90 for a single homeowner retiring at 45 with {fmtCurrency(sampleOutside)} outside
          super (all equity), at three spend levels — same plan, each model.
        </p>
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-medium">Annual spend</th>
                <th className="px-4 py-2.5 text-right font-medium">Gaussian</th>
                <th className="px-4 py-2.5 text-right font-medium">Historical bootstrap</th>
                <th className="px-4 py-2.5 text-right font-medium">Difference</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r) => {
                const d = r.bootstrap - r.gaussian;
                return (
                  <tr key={r.spend} className="border-b border-line/50 last:border-0">
                    <td className="px-4 py-2.5 tabular-nums text-slate-200">{fmtCurrency(r.spend)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white">{r.gaussian}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white">{r.bootstrap}%</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${d > 0 ? "text-emerald-400" : d < 0 ? "text-red-400" : "text-muted"}`}>
                      {d > 0 ? "+" : ""}{d} pts
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          Both models use the plan&apos;s own mean &amp; volatility, so they land close. The bootstrap tends to run a
          touch higher because real markets mean-revert over a long horizon — independent Gaussian draws manufacture
          ruinous streaks history never actually produced.
        </p>
      </section>
    </main>
  );
}
