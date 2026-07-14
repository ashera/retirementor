"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip,
} from "recharts";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan } from "@/lib/au/types";
import { returnParams, sampleReturnPath, mulberry32 } from "@/lib/au/montecarlo";
import { historicalSeries, historicalStats } from "@/lib/au/historicalReturns";

/**
 * "The returns behind this projection" — shows what the Monte Carlo actually
 * feeds the engine: the plan's own mean & volatility, a handful of example
 * simulated return SEQUENCES drawn exactly the way the 1,000-run likelihood does,
 * and (for the bootstrap model) the real market history whose ups-and-downs
 * sequencing those draws borrow. Read-only; launched from the likelihood section.
 */
const NPATHS = 12;
const pct = (x: number, dp = 0) => `${(x * 100).toFixed(dp)}%`;
const PATH_COLORS = ["#34d399", "#38bdf8", "#a78bfa", "#f59e0b", "#f472b6", "#22d3ee"];

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-white">{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

export default function ReturnSeriesModal({
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
  const [seed, setSeed] = useState(1);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const params = useMemo(() => returnParams(plan, config), [plan, config]);
  const startOldest = Math.max(...plan.people.map((p) => p.currentAge));
  const horizon = Math.max(1, Math.round(plan.lifeExpectancy - startOldest));

  // Example return sequences, drawn the SAME way the 1,000-run Monte Carlo does
  // (same sampler, same params) — reshuffled by re-seeding. Each row is a year;
  // p0..p{N-1} are that year's return in each example path.
  const paths = useMemo(() => {
    const rand = mulberry32(0x51ed * seed + 7);
    const rows = Array.from({ length: horizon + 1 }, (_, t) => {
      const row: Record<string, number> = { age: startOldest + t };
      return row;
    });
    for (let i = 0; i < NPATHS; i++) {
      const { returns } = sampleReturnPath(rand, horizon, params);
      returns.forEach((r, t) => {
        rows[t][`p${i}`] = r; // percent (nominal)
      });
    }
    return rows;
  }, [params, horizon, startOldest, seed]);

  const stats = useMemo(() => historicalStats(), []);
  const series = useMemo(() => historicalSeries(), []);

  if (!open) return null;

  const modelLabel =
    params.model === "bootstrap" ? `Historical bootstrap · ${params.blockYears}-year blocks` : "Gaussian (independent draws)";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Monte Carlo</div>
            <h2 className="mt-0.5 text-lg font-bold text-white">The returns behind this projection</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-xl leading-none text-muted transition hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          <p className="mb-4 text-sm leading-relaxed text-muted">
            The likelihood runs your plan through <strong className="text-slate-200">1,000</strong> different futures. Each
            uses your own return and volatility assumptions but a <em>different</em> year-to-year sequence of ups and
            downs. Here are a few of those sequences, drawn exactly the way the simulation draws them.
          </p>

          {/* Assumptions */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Mean return" value={pct(params.mean / 100, 1)} sub="per year, nominal" />
            <Stat label="Volatility" value={pct(params.sd / 100, 1)} sub="std dev per year" />
            <Stat label="Sequencing model" value={params.model === "bootstrap" ? "Bootstrap" : "Gaussian"} sub={params.model === "bootstrap" ? `${params.blockYears}-yr blocks` : "independent"} />
            <Stat label="Horizon" value={`${horizon} yrs`} sub={`age ${startOldest} → ${plan.lifeExpectancy}`} />
          </div>

          {/* Example return sequences */}
          <section className="mb-6">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">Example return sequences</h3>
              <button
                onClick={() => setSeed((s) => s + 1)}
                className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-accent/50 hover:text-white"
              >
                ↻ Draw new samples
              </button>
            </div>
            <div className="rounded-xl border border-line bg-panel p-4">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={paths} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
                  <XAxis
                    dataKey="age" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false}
                    axisLine={{ stroke: "#334155" }} minTickGap={28}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `${Math.round(v)}%`} tick={{ fill: "#94a3b8", fontSize: 11 }}
                    tickLine={false} axisLine={false} width={40}
                  />
                  <ReferenceLine y={params.mean} stroke="#e2e8f0" strokeDasharray="4 3" strokeOpacity={0.7} />
                  <ReferenceLine y={0} stroke="#475569" />
                  <Tooltip
                    cursor={{ stroke: "rgba(148,163,184,0.25)" }}
                    contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "#e2e8f0" }}
                    labelFormatter={(a) => `Age ${a}`}
                    formatter={(v: number, name) => [`${(+v).toFixed(1)}%`, `Path ${Number(String(name).slice(1)) + 1}`]}
                  />
                  {Array.from({ length: NPATHS }, (_, i) => (
                    <Line
                      key={i} type="linear" dataKey={`p${i}`} dot={false} isAnimationActive={false}
                      stroke={PATH_COLORS[i % PATH_COLORS.length]} strokeWidth={1.25} strokeOpacity={0.55}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <p className="mt-2 text-xs text-muted">
                Each coloured line is one simulated future&apos;s annual returns; the dashed line is your{" "}
                {pct(params.mean / 100, 1)} average. Notice the swings — some sequences string good years together, others
                hit a run of losses early (the sequences that most threaten a retirement). The full run tries 1,000 of these.
              </p>
            </div>
          </section>

          {/* Historical source (bootstrap only) */}
          {params.model === "bootstrap" && (
            <section>
              <h3 className="mb-1 text-sm font-semibold text-white">Where the ups &amp; downs come from</h3>
              <p className="mb-3 text-xs text-muted">
                The bootstrap borrows its year-to-year sequencing from real market history — {stats.n} years of equity
                returns after inflation ({stats.startYear}–{stats.endYear}) — so the swings mean-revert and cluster the way
                markets actually do. Only the <strong className="text-slate-300">shape</strong> is used: it&apos;s
                re-expressed at <em>your</em> {pct(params.mean / 100, 1)} return and {pct(params.sd / 100, 1)} volatility,
                so history&apos;s own {pct(stats.geoMean)} / {pct(stats.vol)} levels aren&apos;t imposed on your plan.
              </p>
              <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Best year" value={pct(stats.best.real)} sub={String(stats.best.year)} />
                <Stat label="Worst year" value={pct(stats.worst.real)} sub={String(stats.worst.year)} />
                <Stat label="Down years" value={`${stats.negativeYears} / ${stats.n}`} sub="losses after inflation" />
                <Stat label="History avg" value={pct(stats.geoMean)} sub={`${pct(stats.vol)} volatility`} />
              </div>
              <div className="rounded-xl border border-line bg-panel p-4">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
                    <XAxis
                      dataKey="year" tick={{ fill: "#94a3b8", fontSize: 11 }}
                      ticks={[1930, 1950, 1970, 1990, 2010]} tickLine={false} axisLine={{ stroke: "#334155" }}
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
                      formatter={(v: number) => [pct(v, 1), "Real return"]}
                    />
                    <Bar dataKey="real" isAnimationActive={false}>
                      {series.map((d) => (
                        <Cell key={d.year} fill={d.real >= 0 ? "#34d399" : "#f87171"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="mt-2 text-[11px] text-muted">
                  S&amp;P 500 annual total return after US inflation (Damodaran, NYU Stern · usinflationcalculator.com),
                  {" "}{stats.startYear}–{stats.endYear}. US is a proxy — the longest clean series, and AU/global equities
                  track it closely.
                </p>
              </div>
            </section>
          )}
        </div>

        <div className="border-t border-line px-6 py-3 text-[11px] text-muted">
          Returns are illustrative, not a forecast. {modelLabel}. The likelihood figure comes from 1,000 such runs.
        </div>
      </div>
    </div>
  );
}
