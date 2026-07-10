"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan } from "@/lib/au/types";
import { DEFAULT_PLAN, hasStaggeredRetirement, personRetirementAge } from "@/lib/au/types";
import { simulate } from "@/lib/au/simulate";
import { runMonteCarlo } from "@/lib/au/montecarlo";
import { retirementGoal } from "@/lib/au/goal";
import { initialWithdrawal } from "@/lib/au/withdrawal";
import { fmtCurrency } from "@/lib/au/format";
import { track } from "@/lib/analytics";
import type { SavedPlan } from "@/app/actions/plans";
import CompareChart, { type CompareSeries } from "@/components/CompareChart";
import VariantEditor, { type CompareColumn } from "@/components/VariantEditor";

const COLORS = ["#34d399", "#38bdf8", "#f59e0b", "#a78bfa", "#f472b6", "#22d3ee"];
const STORE = "au-retirement-compare";
const PLAN_KEY = "au-retirement-plan";

export default function CompareView({ config, savedPlans }: { config: EngineConfig; savedPlans: SavedPlan[] }) {
  const [current, setCurrent] = useState<RetirementPlan | null>(null);
  const [added, setAdded] = useState<CompareColumn[]>([]);
  const [variantOpen, setVariantOpen] = useState(false);
  const idRef = useRef(1);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLAN_KEY);
      setCurrent(raw ? { ...DEFAULT_PLAN, ...JSON.parse(raw) } : DEFAULT_PLAN);
    } catch {
      setCurrent(DEFAULT_PLAN);
    }
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) setAdded(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (cols: CompareColumn[]) => {
    setAdded(cols);
    try {
      localStorage.setItem(STORE, JSON.stringify(cols));
    } catch {
      /* ignore */
    }
  };

  const columns: CompareColumn[] = useMemo(() => {
    const cur: CompareColumn[] = current ? [{ id: "current", label: "Current", plan: current, kind: "current" }] : [];
    return [...cur, ...added].slice(0, 5);
  }, [current, added]);

  const computed = useMemo(
    () =>
      columns.map((c, i) => {
        const result = simulate(c.plan, config);
        const mc = runMonteCarlo(c.plan, config);
        return {
          ...c,
          color: COLORS[i % COLORS.length],
          result,
          mc,
          goal: retirementGoal(c.plan),
          wr: initialWithdrawal(result),
        };
      }),
    [columns, config],
  );

  const addSaved = (sp: SavedPlan) => {
    const id = `s${idRef.current++}`;
    persist([...added, { id, label: sp.name, plan: { ...DEFAULT_PLAN, ...sp.data }, kind: "saved" }]);
    track("Compare: saved added");
  };
  const addVariant = (label: string, plan: RetirementPlan) => {
    const id = `v${idRef.current++}`;
    persist([...added, { id, label, plan, kind: "variant" }]);
    track("Compare: variant added");
  };
  const remove = (id: string) => persist(added.filter((c) => c.id !== id));

  const series: CompareSeries[] = computed.map((c) => ({ id: c.id, label: c.label, color: c.color, result: c.result }));

  // Sortable "money lasts" — higher is better.
  const lastsVal = (c: (typeof computed)[number]) => (c.result.lastsToLifeExpectancy ? c.plan.lifeExpectancy + 1 : (c.result.depletedAge ?? 0));

  const rows: MetricRow[] = [
    { label: "Household", input: true, cell: (c) => (c.plan.household === "couple" ? "Couple" : "Single") },
    { label: "Retirement age", input: true, cell: (c) => (hasStaggeredRetirement(c.plan) ? `${c.plan.retirementAge} & ${personRetirementAge(c.plan, 1)}` : `${c.plan.retirementAge}`) },
    { label: "Annual spend", input: true, cell: (c) => `${fmtCurrency(Math.round(c.goal.total))}/yr` },
    { label: "Investment return", input: true, cell: (c) => `${c.plan.investmentReturn}%` },
    { label: "Plan until age", input: true, cell: (c) => `${c.plan.lifeExpectancy}` },
    { label: "Super at retirement", cell: (c) => fmtCurrency(c.result.superAtRetirement), best: "max", metric: (c) => c.result.superAtRetirement },
    { label: "Money lasts", cell: (c) => (c.result.lastsToLifeExpectancy ? `to ${c.plan.lifeExpectancy}+` : `to ${c.result.depletedAge}`), best: "max", metric: lastsVal },
    { label: "Likely to last", cell: (c) => `${Math.round(c.mc.successRate * 100)}%`, best: "max", metric: (c) => c.mc.successRate },
    { label: "Withdrawal rate (yr 1)", cell: (c) => (c.wr ? `${(c.wr.rate * 100).toFixed(1)}%` : "—"), best: "min", metric: (c) => c.wr?.rate ?? Infinity },
    { label: "Age Pension from", cell: (c) => (c.result.firstAgePensionAge === null ? "—" : `age ${c.result.firstAgePensionAge}`) },
  ];

  const availableSaved = savedPlans.filter((sp) => !added.some((a) => a.kind === "saved" && a.label === sp.name));

  if (!current) return <div className="min-h-screen bg-ink" />;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href="/" className="text-sm font-medium text-muted hover:text-white">← Back to planner</Link>
      </div>

      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">Compare scenarios</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Put plans side by side — your current plan, any saved scenarios, and quick &ldquo;what-if&rdquo;
          variants (retire later, spend less, a different return). The best value in each row is highlighted.
        </p>
      </header>

      {/* Add controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setVariantOpen(true)}
          className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm font-semibold text-accent transition hover:bg-accent/20"
        >
          + What-if variant
        </button>
        {availableSaved.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              const sp = savedPlans.find((s) => s.id === e.target.value);
              if (sp) addSaved(sp);
            }}
            className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm font-medium text-slate-200"
          >
            <option value="">+ Add a saved scenario…</option>
            {availableSaved.map((sp) => (
              <option key={sp.id} value={sp.id}>{sp.name}</option>
            ))}
          </select>
        )}
        {columns.length >= 5 && <span className="text-xs text-muted">Up to 5 scenarios.</span>}
      </div>

      {/* Metrics table */}
      <div className="mb-6 overflow-x-auto rounded-2xl border border-line bg-panel">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="sticky left-0 z-10 bg-panel px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted">Metric</th>
              {computed.map((c) => (
                <th key={c.id} className="min-w-[130px] px-4 py-3 text-left">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="truncate font-semibold text-white">{c.label}</span>
                    {c.kind !== "current" && (
                      <button onClick={() => remove(c.id)} aria-label={`Remove ${c.label}`} className="ml-auto text-muted hover:text-white">✕</button>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted">{c.kind === "current" ? "your plan" : c.kind}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const bestSet = row.best && row.metric ? bestIndices(computed.map(row.metric), row.best) : new Set<number>();
              return (
                <tr key={row.label} className={`border-b border-line/60 ${row.input ? "" : "bg-panel-2/30"}`}>
                  <td className="sticky left-0 z-10 bg-panel px-4 py-2.5 text-left text-muted">{row.label}</td>
                  {computed.map((c, i) => {
                    const differs = row.input && i > 0 && row.cell(c) !== row.cell(computed[0]);
                    const isBest = bestSet.has(i);
                    return (
                      <td
                        key={c.id}
                        className={`px-4 py-2.5 tabular-nums ${
                          isBest ? "font-bold text-accent" : differs ? "font-semibold text-white" : "text-slate-200"
                        }`}
                      >
                        {row.cell(c)}
                        {isBest && <span className="ml-1 text-[10px] text-accent">✓</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Overlaid balance chart */}
      <div className="rounded-2xl border border-line bg-panel p-6">
        <h2 className="mb-4 font-semibold text-white">Balance over time (today&apos;s dollars)</h2>
        <CompareChart series={series} />
        <div className="mt-3 flex flex-wrap gap-4">
          {computed.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5 text-xs text-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
              {c.label}
            </span>
          ))}
        </div>
      </div>

      {variantOpen && (
        <VariantEditor bases={columns} onSave={addVariant} onClose={() => setVariantOpen(false)} />
      )}
    </div>
  );
}

interface MetricRow {
  label: string;
  input?: boolean;
  cell: (c: ComputedColumn) => string;
  best?: "max" | "min";
  metric?: (c: ComputedColumn) => number;
}
type ComputedColumn = {
  id: string;
  label: string;
  plan: RetirementPlan;
  kind: CompareColumn["kind"];
  color: string;
  result: ReturnType<typeof simulate>;
  mc: ReturnType<typeof runMonteCarlo>;
  goal: ReturnType<typeof retirementGoal>;
  wr: ReturnType<typeof initialWithdrawal>;
};

/** Indices of the best value(s). Empty when nothing differentiates the columns
 *  (≤1 column, or every value is equal) so we don't flag a false "winner". */
function bestIndices(values: number[], dir: "max" | "min"): Set<number> {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length <= 1) return new Set();
  const best = dir === "max" ? Math.max(...finite) : Math.min(...finite);
  const worst = dir === "max" ? Math.min(...finite) : Math.max(...finite);
  if (best === worst) return new Set(); // no differentiation
  const set = new Set<number>();
  values.forEach((v, i) => {
    if (Number.isFinite(v) && v === best) set.add(i);
  });
  return set;
}
