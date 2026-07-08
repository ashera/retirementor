"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan, SimResult } from "@/lib/au/types";
import { DEFAULT_PLAN } from "@/lib/au/types";
import { simulate } from "@/lib/au/simulate";
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

  // Per-card isolated marginal effect on how long the money lasts.
  const marginal = useMemo(() => {
    if (!baseline || !baseRes) return {} as Record<string, number>;
    const denom = annualSpend(baseline);
    const life = baseline.lifeExpectancy;
    const base = lastsScore(baseRes, denom, life);
    const out: Record<string, number> = {};
    for (const card of catalog) {
      const single = card.apply(baseline, resolveValues(card, values[card.id]));
      out[card.id] = lastsScore(simulate(single, config), denom, life) - base;
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
      next.has(card.id) ? next.delete(card.id) : next.add(card.id);
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
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
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
                    delta={marginal[card.id] ?? 0}
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
}: {
  label: string;
  base: string;
  now: string | null;
  better?: boolean;
  worse?: boolean;
}) {
  const tone = better ? "text-accent" : worse ? "text-amber-400" : "text-white";
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
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

function DeltaChip({ delta }: { delta: number }) {
  const abs = Math.abs(delta);
  if (abs < 0.05) return <span className="text-xs text-muted">≈ no change</span>;
  const yrs = abs >= 10 ? Math.round(abs).toString() : abs.toFixed(1);
  const up = delta > 0;
  return (
    <span className={`text-xs font-semibold tabular-nums ${up ? "text-accent" : "text-amber-400"}`}>
      {up ? "+" : "−"}
      {yrs} yrs
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
  delta: number;
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
        <DeltaChip delta={delta} />
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
