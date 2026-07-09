"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan, SimResult } from "@/lib/au/types";
import { DEFAULT_PLAN, getInvestmentProperties } from "@/lib/au/types";
import { simulate } from "@/lib/au/simulate";
import { runMonteCarlo } from "@/lib/au/montecarlo";
import { fmtCurrency } from "@/lib/au/format";
import { track } from "@/lib/analytics";
import type { SavedPlan } from "@/app/actions/plans";
import { savePlan } from "@/app/actions/plans";
import {
  buildStrategyCatalog,
  applyStrategies,
  resolveValues,
  GROUP_LABEL,
  type StrategyCard,
  type StrategyGroup,
} from "@/lib/au/strategies";
import RetirementChart from "@/components/RetirementChart";
import IncomeChart from "@/components/IncomeChart";
import YearDetailModal from "@/components/YearDetailModal";
import IncomeYearModal from "@/components/IncomeYearModal";
import Field from "@/components/Field";

const PLAN_KEY = "au-retirement-plan";
const GROUP_ORDER: StrategyGroup[] = ["home", "mortgage", "property", "timing", "work"];

const annualSpend = (p: RetirementPlan) =>
  Math.max(1, p.spendingMode === "stages" ? p.spendingStages.goGo : p.targetSpending);

/** A single continuous "how long does it last" score so we can show deltas even
 *  when both plans reach life expectancy (life + years of buffer left at the end).
 *  Uses a fixed denominator/life so strategies stay comparable. */
function lastsScore(res: SimResult, denom: number, life: number): number {
  if (!res.lastsToLifeExpectancy) return res.depletedAge ?? 0;
  const finalTotal = res.rows.length ? res.rows[res.rows.length - 1].total : 0;
  return life + finalTotal / denom;
}

const lastsLabel = (res: SimResult, plan: RetirementPlan) =>
  res.lastsToLifeExpectancy ? `to ${plan.lifeExpectancy}+` : `to ${res.depletedAge}`;

// How well off a plan leaves you, split into money left at the end and total
// spending it couldn't fund. Only unfunded years count toward the shortfall
// (funded years met their spending, including any work income that isn't a row
// drawdown). "How much better off" overall = final − shortfall.
function planParts(res: SimResult): { final: number; shortfall: number } {
  const final = res.rows.length ? res.rows[res.rows.length - 1].total : 0;
  let shortfall = 0;
  for (const r of res.rows) {
    if (r.funded) continue;
    const provided = r.agePension + r.superDrawn + r.outsideDrawn + Math.max(0, r.rentIncome);
    shortfall += Math.max(0, r.spending - provided);
  }
  return { final, shortfall };
}

interface Marginal {
  years: number;
  dollars: number; // combined "better off"
  moneyLeft: number; // change in money left at the end
  shortfallAvoided: number; // reduction in unfunded spending
}

/** Compact signed dollar delta, or null when too small to bother showing. */
function fmtDelta(d: number): string | null {
  const a = Math.abs(d);
  if (a < 2_000) return null;
  const mag = a >= 1_000_000 ? `$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}m` : `$${Math.round(a / 1_000)}k`;
  return `${d > 0 ? "+" : "−"}${mag}`;
}

export default function WhatIfView({
  config,
  savedPlans,
  signedIn,
}: {
  config: EngineConfig;
  savedPlans: SavedPlan[];
  signedIn: boolean;
}) {
  const [current, setCurrent] = useState<RetirementPlan | null>(null);
  const [baselineId, setBaselineId] = useState("current");
  const [active, setActive] = useState<Set<string>>(new Set());
  const [values, setValues] = useState<Record<string, Record<string, number>>>({});
  const [saveName, setSaveName] = useState("");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [chartView, setChartView] = useState<"balance" | "networth" | "income">("balance");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLAN_KEY);
      setCurrent(raw ? { ...DEFAULT_PLAN, ...JSON.parse(raw) } : DEFAULT_PLAN);
    } catch {
      setCurrent(DEFAULT_PLAN);
    }
  }, []);

  const baseline: RetirementPlan | null = useMemo(() => {
    if (!current) return null;
    if (baselineId === "current") return current;
    const sp = savedPlans.find((s) => s.id === baselineId);
    return sp ? { ...DEFAULT_PLAN, ...sp.data } : current;
  }, [current, baselineId, savedPlans]);

  const catalog = useMemo(() => (baseline ? buildStrategyCatalog(baseline) : []), [baseline]);

  // Reset toggles when the baseline changes (its catalog differs).
  useEffect(() => {
    setActive(new Set());
    setValues({});
    setSaveMsg(null);
  }, [baselineId]);

  const composed = useMemo(
    () => (baseline ? applyStrategies(baseline, catalog, active, values) : null),
    [baseline, catalog, active, values],
  );

  const baseRes = useMemo(() => (baseline ? simulate(baseline, config) : null), [baseline, config]);
  const compRes = useMemo(() => (composed ? simulate(composed, config) : null), [composed, config]);

  // Monte Carlo success %. A FIXED seed means baseline and composed run against the
  // same market paths, so the comparison is fair and doesn't jitter as you toggle.
  const MC = { iterations: 1000, seed: 12345 } as const;
  const baseMc = useMemo(
    () => (baseline ? runMonteCarlo(baseline, config, MC).successRate : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseline, config],
  );
  // MC is heavy, so debounce it: only run on the composed plan once toggling settles.
  const [compMc, setCompMc] = useState<number | null>(null);
  const [mcPending, setMcPending] = useState(false);
  useEffect(() => {
    if (!composed) return;
    setMcPending(true);
    const id = setTimeout(() => {
      setCompMc(runMonteCarlo(composed, config, MC).successRate);
      setMcPending(false);
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composed, config]);

  // Per-card isolated marginal effect: how much longer the money lasts, and how
  // much better off overall (dollars).
  const marginal = useMemo(() => {
    if (!baseline || !baseRes) return {} as Record<string, Marginal>;
    const denom = annualSpend(baseline);
    const life = baseline.lifeExpectancy;
    const baseScore = lastsScore(baseRes, denom, life);
    const baseParts = planParts(baseRes);
    const out: Record<string, Marginal> = {};
    for (const card of catalog) {
      const single = card.apply(baseline, resolveValues(card, values[card.id]));
      const res = simulate(single, config);
      const parts = planParts(res);
      const moneyLeft = parts.final - baseParts.final;
      const shortfallAvoided = baseParts.shortfall - parts.shortfall;
      out[card.id] = {
        years: lastsScore(res, denom, life) - baseScore,
        dollars: moneyLeft + shortfallAvoided,
        moneyLeft,
        shortfallAvoided,
      };
    }
    return out;
  }, [baseline, baseRes, catalog, values, config]);

  if (!baseline || !baseRes || !compRes || !composed) return <div className="min-h-screen bg-ink" />;

  const changed = active.size > 0;

  // Legend for the income-sources view (only the bands the composed plan uses).
  const composedWorking = Math.max(...composed.people.map((pp) => pp.currentAge)) < composed.retirementAge;
  const incomeLegend = [
    ...(composedWorking ? [{ c: "#facc15", l: "Salary" }] : []),
    ...(composed.workIncome ? [{ c: "#f472b6", l: "Part-time work" }] : []),
    { c: "#a78bfa", l: "Age Pension" },
    { c: "#34d399", l: "Super" },
    { c: "#38bdf8", l: "Outside super" },
    ...(getInvestmentProperties(composed).length ? [{ c: "#fb923c", l: "Net rent" }] : []),
  ];

  const toggle = (card: StrategyCard) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(card.id)) {
        next.delete(card.id);
        return next;
      }
      // Turning on an exclusive card switches off the others in its group.
      if (card.exclusive) {
        for (const c of catalog) if (c.exclusive === card.exclusive && c.id !== card.id) next.delete(c.id);
      }
      next.add(card.id);
      return next;
    });
  const setParam = (cardId: string, key: string, v: number) =>
    setValues((prev) => ({ ...prev, [cardId]: { ...prev[cardId], [key]: v } }));

  const doSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    const name = saveName.trim() || "What-if scenario";
    const res = await savePlan(name, composed);
    setSaving(false);
    if (res.error) setSaveMsg(res.error);
    else {
      setSaveMsg(`Saved “${name}” — find it on the dashboard and in Compare.`);
      setSaveName("");
      track("What-if saved");
    }
  };

  const groups = GROUP_ORDER.map((g) => ({ group: g, cards: catalog.filter((c) => c.group === g) })).filter(
    (x) => x.cards.length > 0,
  );

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href="/" className="text-sm font-medium text-muted hover:text-white">← Back to planner</Link>
        {savedPlans.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted">
            Baseline:
            <select
              value={baselineId}
              onChange={(e) => setBaselineId(e.target.value)}
              className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm font-medium text-slate-200"
            >
              <option value="current">Current plan</option>
              {savedPlans.map((sp) => (
                <option key={sp.id} value={sp.id}>{sp.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">What if…</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Turn retirement strategies on and off and see the effect on your super, your income, and
          how long it lasts. Each toggle shows its own impact; the numbers up top show them combined.
        </p>
      </header>

      {/* Headline metrics */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Money lasts"
          base={lastsLabel(baseRes, baseline)}
          now={changed ? lastsLabel(compRes, composed) : null}
          better={compRes.lastsToLifeExpectancy && !baseRes.lastsToLifeExpectancy}
          worse={!compRes.lastsToLifeExpectancy && baseRes.lastsToLifeExpectancy}
        />
        <MetricCard
          label="Super at retirement"
          base={fmtCurrency(baseRes.superAtRetirement)}
          now={changed ? fmtCurrency(compRes.superAtRetirement) : null}
          better={compRes.superAtRetirement > baseRes.superAtRetirement + 500}
          worse={compRes.superAtRetirement < baseRes.superAtRetirement - 500}
        />
        <MetricCard
          label="Likely to last"
          base={baseMc != null ? `${Math.round(baseMc * 100)}%` : "…"}
          now={changed && compMc != null ? `${Math.round(compMc * 100)}%` : null}
          better={changed && compMc != null && baseMc != null && compMc > baseMc + 0.005}
          worse={changed && compMc != null && baseMc != null && compMc < baseMc - 0.005}
          pending={changed && mcPending}
        />
      </div>

      {/* Chart */}
      <div className="mb-6 rounded-2xl border border-line bg-panel p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-white">
            {chartView === "balance" ? "Balance over time" : chartView === "networth" ? "Net worth (incl. your home)" : "Income sources"}{" "}
            <span className="text-sm font-normal text-muted">(today&apos;s dollars)</span>
          </h2>
          <div className="flex gap-1 rounded-lg border border-line bg-panel-2 p-1 text-xs">
            {([
              ["balance", "Balance"],
              ["networth", "Net worth"],
              ["income", "Income"],
            ] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setChartView(v)}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  chartView === v ? "bg-accent text-ink" : "text-muted hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {chartView === "income" ? (
          <>
            <IncomeChart result={compRes} height={300} animate={false} onSelectYear={setSelectedYear} />
            <div className="mt-3 flex flex-wrap gap-4">
              {incomeLegend.map((it) => (
                <span key={it.l} className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: it.c }} />
                  {it.l}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              {changed ? "Your income mix with the selected strategies. " : "Where your income comes from each year. "}
              Click a year to see why it&apos;s that amount.
            </p>
          </>
        ) : (
          <>
            <RetirementChart
              result={compRes}
              baseline={chartView === "balance" && changed ? baseRes : null}
              baselineLabel="Baseline"
              showHome={chartView === "networth"}
              onSelectYear={setSelectedYear}
              selectedAge={selectedYear}
              animate={false}
              height={300}
              wageInflationPct={composed.inflation + (config.livingStandardsGrowthPct ?? 0)}
              cpiPct={composed.inflation}
            />
            <div className="mt-3 flex flex-wrap gap-4">
              {[
                ...(chartView === "networth" ? [{ c: "#64748b", l: "Home equity" }] : []),
                ...(chartView === "networth" && getInvestmentProperties(composed).length ? [{ c: "#fb923c", l: "Investment property" }] : []),
                { c: "#34d399", l: "Super" },
                { c: "#38bdf8", l: "Outside super" },
                ...(chartView === "balance" && changed ? [{ c: "#94a3b8", l: "Baseline" }] : []),
              ].map((it) => (
                <span key={it.l} className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: it.c }} />
                  {it.l}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              {chartView === "networth"
                ? "Your assets incl. your home equity (market value less any mortgage) — a downsize reallocates it (home shrinks, savings grow) without losing net worth. "
                : "Tip: "}
              Click a year to break down that year&apos;s money flow.
            </p>
          </>
        )}
      </div>

      {/* Strategy board */}
      {groups.length === 0 ? (
        <p className="rounded-2xl border border-line bg-panel px-4 py-8 text-center text-muted">
          No strategies apply to this scenario yet. Add a mortgage, investment property, or build a
          plan with working years to unlock levers here.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map(({ group, cards }) => (
            <section key={group}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{GROUP_LABEL[group]}</h3>
              <div className="space-y-3">
                {cards.map((card) => (
                  <StrategyCardRow
                    key={card.id}
                    card={card}
                    on={active.has(card.id)}
                    delta={marginal[card.id] ?? { years: 0, dollars: 0, moneyLeft: 0, shortfallAvoided: 0 }}
                    life={baseline.lifeExpectancy}
                    values={resolveValues(card, values[card.id])}
                    onToggle={() => toggle(card)}
                    onParam={(k, v) => setParam(card.id, k, v)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Save */}
      <div className="mt-8 rounded-2xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-slate-200">Like this combination?</span>
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Name this scenario"
            className="min-w-[12rem] flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-white outline-none focus:border-accent"
          />
          <button
            onClick={doSave}
            disabled={saving || !changed}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save as scenario"}
          </button>
        </div>
        {!signedIn && <p className="mt-2 text-xs text-muted">Sign in to save scenarios to your account.</p>}
        {saveMsg && <p className="mt-2 text-xs text-accent">{saveMsg}</p>}
      </div>

      {/* Year explainer for the composed ("with strategies") plan. */}
      {selectedYear != null &&
        (() => {
          const ages = compRes.rows.map((r) => r.age);
          const row = compRes.rows.find((r) => r.age === selectedYear);
          if (!row) return null;
          const min = ages[0];
          const max = ages[ages.length - 1];
          const nav = {
            onClose: () => setSelectedYear(null),
            onPrev: () => setSelectedYear((a) => (a != null ? Math.max(min, a - 1) : a)),
            onNext: () => setSelectedYear((a) => (a != null ? Math.min(max, a + 1) : a)),
            canPrev: selectedYear > min,
            canNext: selectedYear < max,
          };
          return chartView === "income" ? (
            <IncomeYearModal row={row} plan={composed} config={config} {...nav} />
          ) : (
            <YearDetailModal row={row} plan={composed} {...nav} />
          );
        })()}
    </div>
  );
}

function MetricCard({
  label,
  base,
  now,
  better,
  worse,
  pending,
}: {
  label: string;
  base: string;
  now: string | null;
  better?: boolean;
  worse?: boolean;
  pending?: boolean;
}) {
  const tone = better ? "text-accent" : worse ? "text-amber-400" : "text-white";
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
        {pending && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-label="updating" />}
      </div>
      <div className={`mt-1 flex items-baseline gap-2 ${pending ? "opacity-60" : ""}`}>
        {now ? (
          <>
            <span className="text-lg text-muted line-through">{base}</span>
            <span aria-hidden className="text-muted">→</span>
            <span className={`text-2xl font-bold tabular-nums ${tone}`}>{now}</span>
          </>
        ) : (
          <span className="text-2xl font-bold tabular-nums text-white">{base}</span>
        )}
      </div>
    </div>
  );
}

function ImpactBreakdown({ delta, life }: { delta: Marginal; life: number }) {
  const rows = [
    { label: `Money left at ${life}`, v: delta.moneyLeft },
    { label: "Spending shortfall avoided", v: delta.shortfallAvoided },
  ].filter((r) => Math.abs(r.v) >= 2_000);
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">On its own — where the dollars come from</div>
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-4 py-0.5">
          <span className="text-muted">{r.label}</span>
          <span className={`font-semibold tabular-nums ${r.v > 0 ? "text-accent" : "text-amber-400"}`}>{fmtDelta(r.v)}</span>
        </div>
      ))}
    </div>
  );
}

function DeltaChip({ years, dollars }: { years: number; dollars: number }) {
  const yAbs = Math.abs(years);
  const yStr = yAbs < 0.05 ? null : `${years > 0 ? "+" : "−"}${yAbs >= 10 ? Math.round(yAbs) : yAbs.toFixed(1)} yrs`;
  const dStr = fmtDelta(dollars);
  if (!yStr && !dStr) return <span className="text-xs text-muted">≈ no change</span>;
  const tone = (v: number) => (v > 0 ? "text-accent" : "text-amber-400");
  return (
    <span
      className="shrink-0 text-right text-xs font-semibold tabular-nums"
      title="This lever on its own: how much longer the money lasts, and how much better off you are overall (money left at the end, less any spending it couldn't fund)."
    >
      {yStr && <span className={tone(years)}>{yStr}</span>}
      {yStr && dStr && <span className="text-muted"> · </span>}
      {dStr && <span className={tone(dollars)}>{dStr}</span>}
    </span>
  );
}

function StrategyCardRow({
  card,
  on,
  delta,
  life,
  values,
  onToggle,
  onParam,
}: {
  card: StrategyCard;
  on: boolean;
  delta: Marginal;
  life: number;
  values: Record<string, number>;
  onToggle: () => void;
  onParam: (key: string, v: number) => void;
}) {
  return (
    <div className={`rounded-2xl border p-4 transition ${on ? "border-accent/40 bg-accent/5" : "border-line bg-panel"}`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={onToggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-accent" : "bg-line"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
        </button>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <div className="text-sm font-semibold text-white">{card.label}</div>
        </button>
        <DeltaChip years={delta.years} dollars={delta.dollars} />
      </div>

      {on && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {card.blurb && <p className="text-xs text-muted">{card.blurb}</p>}
          <ImpactBreakdown delta={delta} life={life} />
          {card.params.map((pm) => {
            // A param can cap itself against the card's other live values (e.g.
            // the downsizer contribution can't exceed the equity actually freed).
            const cap = pm.dynamicMax ? pm.dynamicMax(values) : Infinity;
            const effMax = Math.min(pm.max, cap);
            const hint =
              pm.dynamicMax != null
                ? `Downsizing frees about ${fmtCurrency(Math.max(0, cap))} — the rest goes to savings.`
                : pm.hint;
            return (
              <Field
                key={pm.key}
                label={pm.label}
                value={Math.min(values[pm.key], effMax)}
                onChange={(v) => onParam(pm.key, v)}
                min={pm.min}
                max={effMax}
                step={pm.step}
                prefix={pm.prefix}
                suffix={pm.suffix}
                hint={hint}
              />
            );
          })}
          {card.note && (
            <p className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs text-slate-300">
              {card.note(values)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
