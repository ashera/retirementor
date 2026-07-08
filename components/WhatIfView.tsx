"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan, SimResult } from "@/lib/au/types";
import { DEFAULT_PLAN } from "@/lib/au/types";
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
import CompareChart, { type CompareSeries } from "@/components/CompareChart";
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

/** A single "how much better off" figure that works whether the plan lasts or
 *  runs short: money left at the end, minus any spending it couldn't fund. */
function planValue(res: SimResult): number {
  const final = res.rows.length ? res.rows[res.rows.length - 1].total : 0;
  let shortfall = 0;
  for (const r of res.rows) {
    // In funded years spending was fully met (however — including any work income
    // that isn't a drawdown on the row), so there's no shortfall. Only unfunded
    // years (assets exhausted) leave spending unmet.
    if (r.funded) continue;
    const provided = r.agePension + r.superDrawn + r.outsideDrawn + Math.max(0, r.rentIncome);
    shortfall += Math.max(0, r.spending - provided);
  }
  return final - shortfall;
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
    if (!baseline || !baseRes) return {} as Record<string, { years: number; dollars: number }>;
    const denom = annualSpend(baseline);
    const life = baseline.lifeExpectancy;
    const baseScore = lastsScore(baseRes, denom, life);
    const baseVal = planValue(baseRes);
    const out: Record<string, { years: number; dollars: number }> = {};
    for (const card of catalog) {
      const single = card.apply(baseline, resolveValues(card, values[card.id]));
      const res = simulate(single, config);
      out[card.id] = { years: lastsScore(res, denom, life) - baseScore, dollars: planValue(res) - baseVal };
    }
    return out;
  }, [baseline, baseRes, catalog, values, config]);

  if (!baseline || !baseRes || !compRes || !composed) return <div className="min-h-screen bg-ink" />;

  const changed = active.size > 0;
  const series: CompareSeries[] = [
    { id: "baseline", label: "Baseline", color: "#64748b", result: baseRes },
    ...(changed ? [{ id: "composed", label: "With strategies", color: "#34d399", result: compRes }] : []),
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
        <h2 className="mb-4 font-semibold text-white">Balance over time (today&apos;s dollars)</h2>
        <CompareChart series={series} />
        <div className="mt-3 flex flex-wrap gap-4">
          {series.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5 text-xs text-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
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
                    delta={marginal[card.id] ?? { years: 0, dollars: 0 }}
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
  values,
  onToggle,
  onParam,
}: {
  card: StrategyCard;
  on: boolean;
  delta: { years: number; dollars: number };
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
          {card.params.map((pm) => (
            <Field
              key={pm.key}
              label={pm.label}
              value={values[pm.key]}
              onChange={(v) => onParam(pm.key, v)}
              min={pm.min}
              max={pm.max}
              step={pm.step}
              prefix={pm.prefix}
              suffix={pm.suffix}
            />
          ))}
        </div>
      )}
    </div>
  );
}
