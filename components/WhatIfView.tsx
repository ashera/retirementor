"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan, SimResult, WhatIfSaved } from "@/lib/au/types";
import { DEFAULT_PLAN, getInvestmentProperties } from "@/lib/au/types";
import { simulate } from "@/lib/au/simulate";
import { runMonteCarlo, MC_CONFIDENCE_TARGET as SAFE_TARGET, MC_CONFIDENCE_MC as SAFE_MC } from "@/lib/au/montecarlo";
import { fmtCurrency } from "@/lib/au/format";
import { rowNetWorth } from "@/lib/au/networth";
import { track } from "@/lib/analytics";
import type { SavedPlan } from "@/app/actions/plans";
import { savePlan } from "@/app/actions/plans";
import {
  buildStrategyCatalog,
  applyStrategies,
  resolveValues,
  maxSustainableSpend,
  maxSpendForConfidence,
  essentialsFloor,
  GROUP_LABEL,
  type StrategyCard,
  type StrategyGroup,
} from "@/lib/au/strategies";
import RetirementChart from "@/components/RetirementChart";
import IncomeChart from "@/components/IncomeChart";
import YearDetailModal from "@/components/YearDetailModal";
import IncomeYearModal from "@/components/IncomeYearModal";
import AssumptionsModal from "@/components/AssumptionsModal";
import Field from "@/components/Field";

const PLAN_KEY = "au-retirement-plan";
const WHATIF_KEY = "au-whatif-board"; // persists the board selection across visits
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
  years: number; // change in how long the money lasts (a "lasts to" score, incl. end buffer)
  moneyLeft: number; // change in liquid super + savings left at life expectancy
  shortfallAvoided: number; // reduction in unfunded spending
  netWorth: number; // change in total net worth (incl. home + property) at life expectancy
  takeHomeNow: number; // working-year take-home pay with this lever alone (salary-sacrifice hit)
}

/** Compact signed dollar delta, or null when too small to bother showing. */
function fmtDelta(d: number): string | null {
  const a = Math.abs(d);
  if (a < 2_000) return null;
  const mag = a >= 1_000_000 ? `$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}m` : `$${Math.round(a / 1_000)}k`;
  return `${d > 0 ? "+" : "−"}${mag}`;
}

// Annual-income deltas are smaller than the balance deltas above, so they get
// their own finer formatter: dollars (not $k), rounded to the nearest $100, with
// a lower noise floor. Returns null when the change isn't worth showing.
function fmtDeltaYr(d: number): string | null {
  const a = Math.abs(d);
  if (a < 300) return null;
  return `${d > 0 ? "+" : "−"}${fmtCurrency(Math.round(a / 100) * 100)}/yr`;
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
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  // Don't persist the board until after the initial restore has been applied,
  // so the empty first render can't clobber the saved selection.
  const persistReady = useRef(false);

  useEffect(() => {
    let cur: RetirementPlan = DEFAULT_PLAN;
    try {
      const raw = localStorage.getItem(PLAN_KEY);
      if (raw) cur = { ...DEFAULT_PLAN, ...JSON.parse(raw) };
    } catch {}
    setCurrent(cur);

    // (B) "Edit in What-If": /what-if?edit=<planId> reopens that saved
    // scenario's exact strategy selection. (A) Otherwise restore the last board
    // state from localStorage so returning to the page keeps your work.
    let restore: WhatIfSaved | undefined;
    try {
      const editId = new URLSearchParams(window.location.search).get("edit");
      const editPlan = editId ? savedPlans.find((s) => s.id === editId) : undefined;
      if (editPlan?.data.whatIf) {
        restore = editPlan.data.whatIf;
        window.history.replaceState(null, "", "/what-if"); // don't re-trigger on refresh
      } else {
        const raw = localStorage.getItem(WHATIF_KEY);
        if (raw) restore = JSON.parse(raw) as WhatIfSaved;
      }
    } catch {}

    if (restore) {
      if (restore.baselineId) setBaselineId(restore.baselineId);
      setActive(new Set(restore.active ?? []));
      setValues(restore.values ?? {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the board selection (Part A). Skips the very first run so the empty
  // initial state doesn't overwrite what we're about to restore above.
  useEffect(() => {
    if (!persistReady.current) {
      persistReady.current = true;
      return;
    }
    try {
      localStorage.setItem(WHATIF_KEY, JSON.stringify({ baselineId, active: [...active], values }));
    } catch {}
  }, [baselineId, active, values]);

  const baseline: RetirementPlan | null = useMemo(() => {
    if (!current) return null;
    if (baselineId === "current") return current;
    const sp = savedPlans.find((s) => s.id === baselineId);
    return sp ? { ...DEFAULT_PLAN, ...sp.data } : current;
  }, [current, baselineId, savedPlans]);

  const catalog = useMemo(() => (baseline ? buildStrategyCatalog(baseline) : []), [baseline]);

  // Switching the baseline resets the toggles (its catalog differs). This is an
  // explicit handler, not an effect, so restoring a saved selection on mount
  // (which sets baselineId) does NOT wipe the restored toggles.
  const switchBaseline = (id: string) => {
    setBaselineId(id);
    setActive(new Set());
    setValues({});
    setSaveMsg(null);
  };

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
    const baseTermNW = baseRes.rows.length ? rowNetWorth(baseRes.rows[baseRes.rows.length - 1]) : 0;
    const out: Record<string, Marginal> = {};
    for (const card of catalog) {
      const single = card.apply(baseline, resolveValues(card, values[card.id]));
      const res = simulate(single, config);
      const parts = planParts(res);
      const moneyLeft = parts.final - baseParts.final;
      const shortfallAvoided = baseParts.shortfall - parts.shortfall;
      const termNW = res.rows.length ? rowNetWorth(res.rows[res.rows.length - 1]) : 0;
      out[card.id] = {
        years: lastsScore(res, denom, life) - baseScore,
        moneyLeft,
        shortfallAvoided,
        netWorth: termNW - baseTermNW,
        takeHomeNow: res.rows[0]?.takeHome ?? 0,
      };
    }
    return out;
  }, [baseline, baseRes, catalog, values, config]);

  // "You could spend up to $X" — the highest spend that still lasts to life
  // expectancy, solved on the plan with the OTHER active levers applied (so it
  // reflects the rest of the scenario) and independent of the spend slider itself.
  const otherValsKey = useMemo(() => {
    const o: Record<string, Record<string, number>> = { ...values };
    delete o["adjust-spending"];
    return JSON.stringify(o);
  }, [values]);
  const spendSustainable = useMemo(() => {
    if (!baseline) return null;
    const others = new Set(active);
    others.delete("adjust-spending");
    return maxSustainableSpend(applyStrategies(baseline, catalog, others, values), config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseline, catalog, active, otherValsKey, config]);

  // Essentials floor held by the Adjust discretionary spending lever (from the
  // plan's budget, or an ASFA 'modest' fallback). The spend slider can't go below it.
  const essentials = useMemo(() => (baseline ? essentialsFloor(baseline, config) : 0), [baseline, config]);

  // Prudent "safe spend" = highest spend with ≥ SAFE_TARGET Monte Carlo success.
  // Heavy (bisected MC), so debounced off the interaction path with a pending
  // pulse — same pattern as the composed MC above.
  const [safeSpend, setSafeSpend] = useState<number | null>(null);
  const [safePending, setSafePending] = useState(false);
  useEffect(() => {
    if (!baseline) return;
    setSafePending(true);
    const others = new Set(active);
    others.delete("adjust-spending");
    const base = applyStrategies(baseline, catalog, others, values);
    const id = setTimeout(() => {
      setSafeSpend(maxSpendForConfidence(base, config, SAFE_TARGET, SAFE_MC));
      setSafePending(false);
    }, 450);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseline, catalog, active, otherValsKey, config]);

  // Per-lever "affordable income" — the change in the most you could sustainably
  // spend each YEAR that this strategy buys you (isolated from the baseline, like
  // the chips above). A full max-sustainable-spend bisection per card is heavy, so
  // it's debounced off the interaction path with a pending pulse. This uses the
  // deterministic central projection; the prudent (85% Monte Carlo) figure lives
  // on the Adjust-spending card and the "spend up to" lever.
  const valsKey = useMemo(() => JSON.stringify(values), [values]);
  const [affordable, setAffordable] = useState<Record<string, number>>({});
  const [affordablePending, setAffordablePending] = useState(false);
  useEffect(() => {
    if (!baseline) return;
    setAffordablePending(true);
    const id = setTimeout(() => {
      const baseMax = maxSustainableSpend(baseline, config);
      const out: Record<string, number> = {};
      for (const card of catalog) {
        const single = card.apply(baseline, resolveValues(card, values[card.id]));
        out[card.id] = maxSustainableSpend(single, config) - baseMax;
      }
      setAffordable(out);
      setAffordablePending(false);
    }, 500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseline, catalog, valsKey, config]);

  if (!baseline || !baseRes || !compRes || !composed) return <div className="min-h-screen bg-ink" />;

  const changed = active.size > 0;

  // Net worth trajectory: total wealth (super + outside + home + property) across
  // retirement, plus the terminal estate at life expectancy. The sparkline spans
  // the retirement window (earliest retirement age → life) on one CPI basis.
  const nwLife = composed.lifeExpectancy;
  const nwStart = Math.min(baseRes.retirementAge, compRes.retirementAge);
  const nwSeries = (res: SimResult) =>
    res.rows.filter((r) => r.age >= nwStart).map((r) => ({ age: r.age, v: rowNetWorth(r) }));
  const baseNW = nwSeries(baseRes);
  const compNW = nwSeries(compRes);
  const baseTermNW = baseNW.length ? baseNW[baseNW.length - 1].v : 0;
  const compTermNW = compNW.length ? compNW[compNW.length - 1].v : 0;

  // Legend for the income-sources view (only the bands the composed plan uses).
  const composedWorking = Math.max(...composed.people.map((pp) => pp.currentAge)) < composed.retirementAge;
  const incomeLegend = [
    ...(composedWorking ? [{ c: "#facc15", l: "Take-home pay" }] : []),
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
    // Store the board selection alongside the composed plan so the scenario can
    // be reopened and tweaked later via "Edit in What-If".
    const whatIf: WhatIfSaved = { active: [...active], values, baselineId };
    const res = await savePlan(name, { ...composed, whatIf });
    setSaving(false);
    if (res.error) setSaveMsg(res.error);
    else {
      setSaveMsg(`Saved “${name}” — reopen it any time from the dashboard (“Edit in What-If”).`);
      setSaveName("");
      track("What-if saved");
    }
  };

  // Show TTR only once the (composed) retirement age clears 60 — so it also
  // appears when the Retire later lever opens a working-past-60 window, and hides
  // again if retirement drops back to 60 or below.
  const cardVisible = (c: StrategyCard) => !(c.id === "ttr" && composed.retirementAge <= 60);
  const groups = GROUP_ORDER.map((g) => ({
    group: g,
    cards: catalog.filter((c) => c.group === g && cardVisible(c)),
  })).filter((x) => x.cards.length > 0);

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href="/" className="text-sm font-medium text-muted hover:text-white">← Back to planner</Link>
        {savedPlans.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted">
            Baseline:
            <select
              value={baselineId}
              onChange={(e) => switchBaseline(e.target.value)}
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
        <p className="mt-3 flex max-w-2xl items-start gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-slate-300">
          <span aria-hidden>🧪</span>
          <span>
            This is a safe sandbox — experimenting here <strong className="text-white">never changes your saved
            plan</strong>. It just starts from it. Like a combination? <strong className="text-white">Save it as a
            scenario</strong> below to keep a separate copy.
          </span>
        </p>
        <button
          type="button"
          onClick={() => setAssumptionsOpen(true)}
          className="mt-2 text-sm font-medium text-accent hover:underline"
        >
          🔍 See the assumptions behind these numbers
        </button>
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

      {/* Net worth trajectory */}
      <div className="mb-6 rounded-2xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Net worth at {nwLife}
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              {changed ? (
                <>
                  <span className="text-lg text-muted line-through">{fmtCurrency(baseTermNW)}</span>
                  <span aria-hidden className="text-muted">→</span>
                  <span className="text-2xl font-bold tabular-nums text-white">{fmtCurrency(compTermNW)}</span>
                  <span className={`text-sm font-semibold tabular-nums ${compTermNW >= baseTermNW ? "text-accent" : "text-amber-400"}`}>
                    {fmtDelta(compTermNW - baseTermNW)}
                  </span>
                </>
              ) : (
                <span className="text-2xl font-bold tabular-nums text-white">{fmtCurrency(baseTermNW)}</span>
              )}
            </div>
            <div className="mt-0.5 text-[11px] text-muted">
              Total wealth — super, savings, home &amp; property — through retirement
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Sparkline
              series={changed ? [baseNW, compNW] : [compNW]}
              colors={changed ? ["#94a3b8", "#34d399"] : ["#34d399"]}
            />
            {changed && (
              <div className="flex gap-3 text-[10px] text-muted">
                <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 bg-[#94a3b8]" />Before</span>
                <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 bg-[#34d399]" />After</span>
              </div>
            )}
          </div>
        </div>
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
            <IncomeChart result={compRes} height={300} animate={false} minDrawdownBands={config.minDrawdownBands} onSelectYear={setSelectedYear} />
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
              Dotted lines mark where super&apos;s minimum drawdown rate steps up (5% → 6% → 7%…), which can shift the
              super-vs-savings mix. Click a year to see why it&apos;s that amount.
            </p>
          </>
        ) : (
          <>
            <RetirementChart
              result={compRes}
              baseline={(chartView === "balance" || chartView === "networth") && changed ? baseRes : null}
              baselineLabel="Before"
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
                ...((chartView === "balance" || chartView === "networth") && changed ? [{ c: "#94a3b8", l: "Before" }] : []),
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
                    delta={marginal[card.id] ?? { years: 0, moneyLeft: 0, shortfallAvoided: 0, netWorth: 0, takeHomeNow: 0 }}
                    incomeDelta={affordable[card.id] ?? null}
                    incomePending={affordablePending}
                    life={baseline.lifeExpectancy}
                    baseTakeHome={baseRes.rows[0]?.takeHome ?? 0}
                    values={resolveValues(card, values[card.id])}
                    onToggle={() => toggle(card)}
                    onParam={(k, v) => setParam(card.id, k, v)}
                    sustainable={
                      card.id === "adjust-spending" && spendSustainable != null
                        ? {
                            essentials,
                            stretch: spendSustainable,
                            safe: safeSpend,
                            safePending,
                            targetPct: Math.round(SAFE_TARGET * 100),
                            life: baseline.lifeExpectancy,
                            startedPct: baseMc != null ? Math.round(baseMc * 100) : null,
                            nowPct: compMc != null ? Math.round(compMc * 100) : null,
                            likelihoodPending: mcPending,
                            onSetSafe: () => {
                              if (safeSpend != null) setParam("adjust-spending", "spend", safeSpend);
                            },
                          }
                        : undefined
                    }
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
        <p className="mt-2 text-xs text-muted">
          Saves a separate copy — your dashboard plan stays exactly as it is.
        </p>
        {!signedIn && <p className="mt-2 text-xs text-muted">Sign in to save scenarios to your account.</p>}
        {saveMsg && <p className="mt-2 text-xs text-accent">{saveMsg}</p>}
      </div>

      <AssumptionsModal open={assumptionsOpen} onClose={() => setAssumptionsOpen(false)} config={config} plan={composed} />


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

// Tiny overlaid line chart of net worth over the retirement window. The last
// series is drawn solid + bold (the composed plan); earlier series are dashed
// (the baseline ghost). Y is scaled to the data range so the shape reads clearly.
function Sparkline({
  series,
  colors,
  width = 240,
  height = 56,
}: {
  series: { age: number; v: number }[][];
  colors: string[];
  width?: number;
  height?: number;
}) {
  const all = series.flat();
  if (all.length < 2) return <div style={{ width, height }} />;
  const ages = all.map((p) => p.age);
  const vals = all.map((p) => p.v);
  const [minAge, maxAge] = [Math.min(...ages), Math.max(...ages)];
  const [minV, maxV] = [Math.min(...vals), Math.max(...vals)];
  const pad = 4;
  const x = (age: number) => pad + (maxAge === minAge ? 0 : (age - minAge) / (maxAge - minAge)) * (width - 2 * pad);
  const y = (v: number) => height - pad - (maxV === minV ? 0 : (v - minV) / (maxV - minV)) * (height - 2 * pad);
  return (
    <svg width={width} height={height} role="img" aria-label="Net worth trajectory">
      {series.map((s, i) => {
        const last = i === series.length - 1;
        return (
          <polyline
            key={i}
            fill="none"
            stroke={colors[i]}
            strokeWidth={last ? 2 : 1.5}
            strokeDasharray={last ? undefined : "3 3"}
            strokeLinejoin="round"
            points={s.map((p) => `${x(p.age)},${y(p.v)}`).join(" ")}
          />
        );
      })}
    </svg>
  );
}

function ImpactBreakdown({ delta, incomeDelta, life }: { delta: Marginal; incomeDelta: number | null; life: number }) {
  const nwDiffers = Math.abs(delta.netWorth - delta.moneyLeft) >= 2_000;
  const incomeStr = incomeDelta != null ? fmtDeltaYr(incomeDelta) : null;
  const rows = [
    ...(incomeStr ? [{ label: "Income you could afford", sub: "most you could safely spend / yr", str: incomeStr, v: incomeDelta! }] : []),
    { label: `Spendable funds at ${life}`, sub: "liquid super + savings", v: delta.moneyLeft },
    { label: "Spending shortfall avoided", sub: "spending you can now cover", v: delta.shortfallAvoided },
    ...(nwDiffers ? [{ label: `Net worth at ${life}`, sub: "adds your home & property", v: delta.netWorth }] : []),
  ].filter((r) => "str" in r || Math.abs(r.v) >= 2_000);
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">On its own — the impact</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4 py-0.5">
          <span className="text-muted">
            {r.label}
            <span className="ml-1 text-[10px] text-muted/70">{r.sub}</span>
          </span>
          <span className={`shrink-0 font-semibold tabular-nums ${r.v > 0 ? "text-accent" : "text-amber-400"}`}>{"str" in r ? r.str : fmtDelta(r.v)}</span>
        </div>
      ))}
    </div>
  );
}

function DeltaChip({
  years,
  moneyLeft,
  netWorth,
  incomeDelta,
  incomePending,
  life,
}: {
  years: number;
  moneyLeft: number;
  netWorth: number;
  incomeDelta: number | null;
  incomePending: boolean;
  life: number;
}) {
  const yAbs = Math.abs(years);
  const yStr = yAbs < 0.05 ? null : `${years > 0 ? "+" : "−"}${yAbs >= 10 ? Math.round(yAbs) : yAbs.toFixed(1)} yrs`;
  const nwStr = fmtDelta(netWorth);
  const incStr = incomeDelta != null ? fmtDeltaYr(incomeDelta) : null;
  // Only surface the liquid "money left" when it meaningfully differs from net
  // worth (i.e. asset levers move the home/property) — otherwise it's redundant.
  const mlStr = Math.abs(moneyLeft - netWorth) >= 2_000 ? fmtDelta(moneyLeft) : null;
  if (!yStr && !mlStr && !nwStr && !incStr) return <span className="text-xs text-muted">≈ no change</span>;
  const tone = (v: number) => (v > 0 ? "text-accent" : "text-amber-400");
  const Line = ({ label, value, v, title, pending }: { label: string; value: string; v: number; title: string; pending?: boolean }) => (
    <span className={`flex items-baseline justify-end gap-1.5 ${pending ? "animate-pulse opacity-60" : ""}`} title={title}>
      <span className="text-[10px] font-normal text-muted">{label}</span>
      <span className={tone(v)}>{value}</span>
    </span>
  );
  return (
    <span className="shrink-0 space-y-0.5 text-right text-xs font-semibold tabular-nums">
      {yStr && <Line label="Money lasts" value={yStr} v={years} title="On its own, how much longer your super + savings cover your spending." />}
      {incStr && (
        <Line
          label="Income you could afford"
          value={incStr}
          v={incomeDelta!}
          pending={incomePending}
          title={`On its own, how much this lever changes the most you could sustainably spend each year — the yearly income headroom it buys (central projection, to age ${life}).`}
        />
      )}
      {mlStr && (
        <Line
          label={`Spendable funds at ${life}`}
          value={mlStr}
          v={moneyLeft}
          title={`Your liquid, spendable money — super + savings — left at age ${life}. (Net worth below also counts your home & property, so a downsize lifts this while barely changing net worth: it frees home equity into spendable funds, it isn't new wealth.)`}
        />
      )}
      {nwStr && (
        <Line label={`Net worth at ${life}`} value={nwStr} v={netWorth} title={`Total wealth — spendable funds (super + savings) PLUS your home & any property — at age ${life}.`} />
      )}
    </span>
  );
}

function StrategyCardRow({
  card,
  on,
  delta,
  incomeDelta,
  incomePending,
  life,
  baseTakeHome,
  values,
  onToggle,
  onParam,
  sustainable,
}: {
  card: StrategyCard;
  on: boolean;
  delta: Marginal;
  incomeDelta: number | null; // Δ affordable income /yr (null until first computed)
  incomePending: boolean;
  life: number;
  baseTakeHome: number;
  values: Record<string, number>;
  onToggle: () => void;
  onParam: (key: string, v: number) => void;
  sustainable?: {
    essentials: number; // needs floor held fixed — the slider's lower bound
    stretch: number; // deterministic max (assumed return) — the slider ceiling
    safe: number | null; // prudent MC-based safe spend (null while first computing)
    safePending: boolean;
    targetPct: number;
    life: number;
    startedPct: number | null; // MC success at the current (baseline) spend — the anchor
    nowPct: number | null; // MC success at the chosen spend (composed)
    likelihoodPending: boolean;
    onSetSafe: () => void;
  };
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
        <DeltaChip years={delta.years} moneyLeft={delta.moneyLeft} netWorth={delta.netWorth} incomeDelta={incomeDelta} incomePending={incomePending} life={life} />
      </div>

      {on && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {card.blurb && <p className="text-xs text-muted">{card.blurb}</p>}
          <ImpactBreakdown delta={delta} incomeDelta={incomeDelta} life={life} />
          {card.params.map((pm) => {
            // A param can cap itself against the card's other live values (e.g.
            // the downsizer contribution can't exceed the equity actually freed).
            const cap = pm.dynamicMax ? pm.dynamicMax(values) : Infinity;
            let effMax = Math.min(pm.max, cap);
            let effMin = pm.min;
            // Spend slider: floor at essentials (only the discretionary portion
            // above it flexes) and let it reach the deterministic max ("stretch").
            if (sustainable && pm.key === "spend") {
              const step = pm.step || 1_000;
              effMin = Math.max(effMin, Math.round(sustainable.essentials / step) * step);
              if (sustainable.stretch > effMax) effMax = Math.ceil(sustainable.stretch / step) * step;
            }
            const hint =
              pm.dynamicMax != null
                ? `Downsizing frees about ${fmtCurrency(Math.max(0, cap))} — the rest goes to savings.`
                : pm.hint;
            return (
              <Field
                key={pm.key}
                label={pm.label}
                value={Math.min(Math.max(values[pm.key], effMin), effMax)}
                onChange={(v) => onParam(pm.key, v)}
                min={effMin}
                max={effMax}
                step={pm.step}
                prefix={pm.prefix}
                suffix={pm.suffix}
                hint={hint}
              />
            );
          })}
          {/* Live take-home hit while working (only shows when the lever moves it). */}
          {baseTakeHome > 0 && Math.round(delta.takeHomeNow) !== Math.round(baseTakeHome) && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs">
              <span className="text-muted">Take-home pay while working</span>
              <span className="tabular-nums">
                <span className="text-muted line-through">{fmtCurrency(baseTakeHome)}</span>{" "}
                <span className="text-muted">→</span>{" "}
                <span className={`font-semibold ${delta.takeHomeNow >= baseTakeHome ? "text-accent" : "text-amber-400"}`}>
                  {fmtCurrency(delta.takeHomeNow)}/yr
                </span>
              </span>
            </div>
          )}
          {/* Essentials held + the discretionary portion being flexed. */}
          {sustainable && (
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs">
              <span className="text-muted">
                Essentials held: <span className="font-semibold text-slate-300">{fmtCurrency(sustainable.essentials)}/yr</span>
              </span>
              <span className="text-muted">
                Discretionary:{" "}
                <span className="font-semibold text-slate-300">
                  {fmtCurrency(Math.max(0, values.spend - sustainable.essentials))}/yr
                </span>
              </span>
            </div>
          )}
          {card.note && (
            <p className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs text-slate-300">
              {card.note(values)}
            </p>
          )}
          {sustainable && (
            <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs">
              {/* Likelihood at the current spend (anchor) → at the chosen spend */}
              <div className="mb-1.5 flex items-center gap-1.5 border-b border-line pb-1.5">
                <span className="text-muted">Likely to last:</span>
                {sustainable.startedPct != null ? (
                  <>
                    <span className="font-semibold tabular-nums text-slate-200" title="At your current spending">
                      {sustainable.startedPct}%
                    </span>
                    {sustainable.nowPct != null && sustainable.nowPct !== sustainable.startedPct && (
                      <>
                        <span className="text-muted">→</span>
                        <span
                          className={`font-semibold tabular-nums ${sustainable.nowPct >= sustainable.startedPct ? "text-accent" : "text-amber-400"}`}
                          title="At the spend you've chosen"
                        >
                          {sustainable.nowPct}%
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  <span className="text-muted">…</span>
                )}
                {sustainable.likelihoodPending && (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-label="updating" />
                )}
                <span className="ml-auto text-[10px] text-muted">chance of lasting to {sustainable.life}</span>
              </div>
              {sustainable.safe == null && sustainable.safePending ? (
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  Finding your safe spend…
                </span>
              ) : sustainable.safe != null && sustainable.safe <= 10_000 ? (
                <span className="text-amber-400">
                  Even minimal spending is under {sustainable.targetPct}% likely to last to {sustainable.life} — try other
                  levers first.
                </span>
              ) : sustainable.safe != null ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-300">
                      Safe spend: up to{" "}
                      <span className="font-semibold text-accent">{fmtCurrency(sustainable.safe)}/yr</span> — about{" "}
                      {sustainable.targetPct}% likely to last to {sustainable.life}.
                      {sustainable.safePending && (
                        <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent align-middle" />
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={sustainable.onSetSafe}
                      className="shrink-0 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 font-semibold text-accent transition hover:bg-accent/20"
                    >
                      Set to safe
                    </button>
                  </div>
                  <div className="mt-1 text-[11px] text-muted">
                    On steady average returns it stretches to ~{fmtCurrency(sustainable.stretch)}/yr, but with little
                    buffer for market swings.
                  </div>
                  {values.spend > sustainable.safe + 500 && (
                    <div className="mt-1 text-amber-400">
                      Above your safe spend — &ldquo;Likely to last&rdquo; falls from here.
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
