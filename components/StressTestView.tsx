"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan } from "@/lib/au/types";
import { DEFAULT_PLAN } from "@/lib/au/types";
import type { SavedPlan } from "@/app/actions/plans";
import { runStressTest, STRESS_ERAS, type StressEraResult } from "@/lib/au/stresstest";
import { essentialsFloor } from "@/lib/au/strategies";
import { fmtCurrency } from "@/lib/au/format";
import { track } from "@/lib/analytics";
import StressChart from "@/components/StressChart";
import AssumptionsModal from "@/components/AssumptionsModal";

// Tongue-in-cheek "the machine is doing something" lines, one per era, shown while
// each stress test "runs". Purely theatrical.
const QUIPS: Record<string, string> = {
  "1929": "Dusting off the ledgers from 1929…",
  "1937": "Bracing for the double dip…",
  "1966": "Adjusting for a decade of inflation, one loaf of bread at a time…",
  "1973": "Counting the oil barrels in case someone missed a few…",
  "2000": "Waiting for dial-up to reconnect to your pets.com shares…",
  "2008": "Politely asking the bank for your money back…",
  "2022": "Watching shares and bonds fall together, awkwardly…",
};

const PLAN_KEY = "au-retirement-plan";
const SAVED_ID_KEY = "au-retirement-saved-id";

function Row({
  era,
  life,
  selected,
  onSelect,
}: {
  era: StressEraResult;
  life: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const yrsShort = life - (era.depletionAge ?? life);
  // Three outcomes: lasts (funded every year), recovered (a temporary funding gap —
  // e.g. the bridge to super ran dry — then back on its feet), or ran dry (permanent).
  const state = era.lasts ? "lasts" : era.recovered ? "recovered" : "dry";
  const badge = { lasts: "✓", recovered: "!", dry: "✕" }[state];
  const badgeClass = {
    lasts: "bg-emerald-500/15 text-emerald-400",
    recovered: "bg-amber-500/15 text-amber-400",
    dry: "bg-red-500/15 text-red-400",
  }[state];
  const rowBg = { lasts: "", recovered: "bg-amber-500/[0.04]", dry: "bg-red-500/[0.04]" }[state];
  return (
    <li className={rowBg}>
      <button
        onClick={onSelect}
        aria-expanded={selected}
        className={`flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-left text-sm transition ${
          selected ? "bg-accent/[0.06]" : "hover:bg-white/[0.02]"
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${badgeClass}`}
            aria-hidden
          >
            {badge}
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-white">{era.label}</div>
            <div className={`text-xs text-muted ${selected ? "" : "truncate"}`}>{era.blurb}</div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {state === "lasts" ? (
            <div className="font-semibold text-emerald-400">lasts to {life}+</div>
          ) : state === "recovered" ? (
            <div className="font-semibold text-amber-400">short at {era.depletionAge}</div>
          ) : (
            <div className="font-semibold text-red-400">runs out at {era.depletionAge}</div>
          )}
          <div className="text-xs text-muted">
            {state === "lasts"
              ? era.cutYears > 0
                ? `${era.cutYears} yr${era.cutYears === 1 ? "" : "s"} below plan (low ${fmtCurrency(Math.round(era.minLivingSpend))})`
                : `dips to ${fmtCurrency(Math.max(0, Math.round(era.minBalance)))} at ${era.minAge}`
              : state === "recovered"
                ? `${era.unfundedYears} lean yr${era.unfundedYears === 1 ? "" : "s"}, then recovers`
                : `${yrsShort} yr${yrsShort === 1 ? "" : "s"} short of ${life}`}
          </div>
        </div>
      </button>
      {selected && (
        <>
          <dl className="grid grid-cols-3 gap-2 border-t border-line bg-black/10 px-4 py-3 text-center text-xs">
            <div>
              <dt className="text-muted">Worst drawdown</dt>
              <dd className="mt-0.5 font-semibold text-white">−{Math.round(era.maxDrawdownPct)}%</dd>
            </div>
            <div>
              <dt className="text-muted">Lowest balance</dt>
              <dd className="mt-0.5 font-semibold text-white">
                {fmtCurrency(Math.max(0, Math.round(era.minBalance)))} <span className="font-normal text-muted">at {era.minAge}</span>
              </dd>
            </div>
            <div>
              <dt className="text-muted">Ends with</dt>
              <dd className="mt-0.5 font-semibold text-white">{fmtCurrency(Math.max(0, Math.round(era.finalBalance)))}</dd>
            </div>
          </dl>
          {era.recovered && (
            <div className="border-t border-line bg-amber-500/[0.06] px-4 py-2 text-center text-xs text-amber-300/90">
              A {era.unfundedYears}-year funding gap at age {era.depletionAge}: your accessible savings ran dry before super unlocked, so those years couldn&apos;t be fully funded — but the plan recovered and ended with money left.
            </div>
          )}
          {era.cutYears > 0 && (
            <div className="border-t border-line bg-amber-500/[0.06] px-4 py-2 text-center text-xs text-amber-300/90">
              The cost of flexing: spending stayed below plan for {era.cutYears} year{era.cutYears === 1 ? "" : "s"}, bottoming at {fmtCurrency(Math.round(era.minLivingSpend))} (−{Math.round(era.deepestCutPct)}%).
            </div>
          )}
        </>
      )}
    </li>
  );
}

export default function StressTestView({
  config,
  savedPlans,
  sharedPlan = null,
}: {
  config: EngineConfig;
  savedPlans: SavedPlan[];
  // Public read-only view (a share link or a curated /scenario/<slug> demo):
  // stress-test THIS scenario instead of the viewer's own stored plan. `basePath`
  // is this view's root (e.g. "/s/<token>" or "/scenario/<slug>") for the back link.
  sharedPlan?: { plan: RetirementPlan; name: string; basePath: string } | null;
}) {
  const shared = !!sharedPlan;
  const [plan, setPlan] = useState<RetirementPlan | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  useEffect(() => {
    if (sharedPlan) {
      setPlan({ ...DEFAULT_PLAN, ...sharedPlan.plan });
      setSavedName(sharedPlan.name);
      track("Stress test viewed");
      return;
    }
    try {
      const raw = localStorage.getItem(PLAN_KEY);
      if (raw) setPlan({ ...DEFAULT_PLAN, ...JSON.parse(raw) });
      const id = localStorage.getItem(SAVED_ID_KEY);
      if (id) setSavedName(savedPlans.find((s) => s.id === id)?.name ?? null);
    } catch {
      /* no stored plan → empty state */
    }
    track("Stress test viewed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Run the battery both ways — fixed spending vs flexible (Guyton-Klinger
  // guardrails) — since downturns are exactly where flexing spend earns its keep.
  const fixed = useMemo(() => (plan ? runStressTest({ ...plan, guardrails: undefined }, config) : null), [plan, config]);
  const flex = useMemo(
    () => (plan ? runStressTest({ ...plan, guardrails: plan.guardrails ?? {} }, config) : null),
    [plan, config],
  );
  const [mode, setMode] = useState<"fixed" | "flex">("fixed");
  // Default to the scenario's own setting once the plan loads.
  useEffect(() => {
    if (plan) setMode(plan.guardrails ? "flex" : "fixed");
  }, [plan]);

  const result = mode === "flex" ? flex : fixed;
  const uplift = fixed && flex ? flex.survived - fixed.survived : 0;
  // The era where flexing demanded the deepest spending cut — the honest "catch".
  const worstFlexCut = useMemo(
    () => (flex ? flex.eras.filter((e) => e.cutYears > 0).sort((a, b) => b.deepestCutPct - a.deepestCutPct)[0] ?? null : null),
    [flex],
  );

  // The flexibility ladder: how many eras survive at a few "how far would you cut?"
  // floors — from cutting to the bone (essentials) down to not cutting at all
  // (fixed). Makes the adherence risk concrete: your safety depends on how deep a
  // cut you'd actually accept. (Deterministic sims, so re-running is cheap.)
  const ladder = useMemo(() => {
    if (!plan || !fixed || !flex) return null;
    const spend = plan.spendingMode === "stages" ? plan.spendingStages.goGo : plan.targetSpending;
    if (spend <= 0) return null;
    const ess = essentialsFloor(plan, config);
    const survivedAt = (floorPct: number) => runStressTest({ ...plan, guardrails: { floorPct } }, config).survived;
    const cutPct = (floor: number) => Math.max(0, Math.round(((spend - floor) / spend) * 100));
    return {
      total: fixed.total,
      rows: [
        { floor: ess, cutPct: cutPct(ess), survived: survivedAt(0), essentials: true },
        { floor: Math.max(ess, Math.round(0.8 * spend)), cutPct: cutPct(Math.max(ess, 0.8 * spend)), survived: survivedAt(80) },
        { floor: Math.max(ess, Math.round(0.9 * spend)), cutPct: cutPct(Math.max(ess, 0.9 * spend)), survived: survivedAt(90) },
        { floor: spend, cutPct: 0, survived: fixed.survived, fixed: true },
      ],
    };
  }, [plan, config, fixed, flex]);
  const life = plan?.lifeExpectancy ?? 90;

  // Theatrical run: reveal the eras one at a time (chronologically), each taking a
  // random 5–10s to "test", with commentary in a modal. `step` = eras completed.
  const [step, setStep] = useState(0);
  const running = !!result && step < STRESS_ERAS.length;
  const revealedIds = useMemo(() => new Set(STRESS_ERAS.slice(0, step).map((e) => e.id)), [step]);
  const current = step < STRESS_ERAS.length ? STRESS_ERAS[step] : null;
  useEffect(() => {
    if (!result || step >= STRESS_ERAS.length) return;
    const delay = 2000; // 2s per test
    const t = setTimeout(() => setStep((s) => s + 1), delay);
    return () => clearTimeout(t);
  }, [step, result]);
  const skip = () => setStep(STRESS_ERAS.length);

  const tone =
    result == null
      ? "muted"
      : result.survived === result.total
        ? "emerald"
        : result.survived >= Math.ceil(result.total * 0.6)
          ? "amber"
          : "red";
  const toneText = { emerald: "text-emerald-400", amber: "text-amber-400", red: "text-red-400", muted: "text-muted" }[tone];
  const toneRing = { emerald: "border-emerald-500/30", amber: "border-amber-500/30", red: "border-red-500/30", muted: "border-line" }[tone];

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href={sharedPlan ? sharedPlan.basePath : "/"} className="text-sm font-medium text-muted hover:text-white">
          ← Back to {shared ? "the scenario" : "planner"}
        </Link>
        <span className="text-sm text-muted">
          Testing <span className="font-semibold text-slate-200">{savedName ?? "your working scenario"}</span>
        </span>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">
          <span aria-hidden>🏛</span> Historical stress test
        </h1>
        <p className="mt-1 text-sm text-muted">
          How your plan would have held up if you&apos;d retired at {plan?.retirementAge ?? "…"} straight into each
          major market downturn of the last century — the returns as they actually happened, at full severity.
        </p>
      </header>

      {!plan || !result ? (
        <div className="rounded-2xl border border-line bg-panel p-6 text-center">
          <p className="text-sm text-muted">
            Build or load a plan first, then come back to stress-test it.
          </p>
          <Link
            href={sharedPlan ? sharedPlan.basePath : "/"}
            className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft"
          >
            ← Go to the {shared ? "scenario" : "planner"}
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
            {/* Left: headline + ranked list */}
            <div className="min-w-0 space-y-4">
              <div className={`rounded-2xl border ${running ? "border-line" : toneRing} bg-panel p-5`}>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">Survival scorecard</div>
                {running ? (
                  <>
                    <div className="mt-1 text-3xl font-bold text-amber-300">
                      Running… {step}/{result.total}
                    </div>
                    <p className="mt-1 text-sm text-muted">Replaying each major downturn against your plan.</p>
                  </>
                ) : (
                  <>
                    <div className={`mt-1 text-3xl font-bold ${toneText}`}>
                      Survived {result.survived} of {result.total}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {result.survived === result.total
                        ? "Your plan lasts to life expectancy through every downturn on record — a resilient plan."
                        : result.worst
                          ? result.worst.recovered
                            ? `No downturn wipes you out — but ${result.worst.label} leaves ${result.worst.unfundedYears} year${result.worst.unfundedYears === 1 ? "" : "s"} around age ${result.worst.depletionAge} you couldn't fully fund before the plan recovers.`
                            : `${result.worst.label} is the one that breaks it — your money runs out at age ${result.worst.depletionAge}.`
                          : ""}
                    </p>
                  </>
                )}
              </div>

              {/* Ranked, worst-first — revealed as each era's test completes. */}
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
                {result.eras
                  .filter((era) => revealedIds.has(era.id))
                  .map((era) => (
                    <Row
                      key={era.id}
                      era={era}
                      life={life}
                      selected={selectedId === era.id}
                      onSelect={() => setSelectedId((cur) => (cur === era.id ? null : era.id))}
                    />
                  ))}
                {running && (
                  <li className="px-4 py-3 text-center text-xs text-muted">testing the rest…</li>
                )}
              </ul>
            </div>

            {/* Right: spending strategy + chart + disclosure, sticky on wide screens */}
            <div className="min-w-0 space-y-4 lg:sticky lg:top-6">
              {/* Fixed vs flexible spending — same card size as the scorecard.
                  Hidden until the run finishes (its counts summarise every era). */}
              {!running && fixed && flex && (
                <div className="rounded-2xl border border-line bg-panel p-5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">Spending strategy</div>
                  <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl border border-line bg-panel-2 p-1 text-sm">
                    <button
                      onClick={() => setMode("fixed")}
                      className={`rounded-lg px-3 py-1.5 text-center font-medium transition ${mode === "fixed" ? "bg-panel text-white shadow-sm" : "text-muted hover:text-white"}`}
                    >
                      Fixed · {fixed.survived}/{fixed.total}
                    </button>
                    <button
                      onClick={() => setMode("flex")}
                      className={`rounded-lg px-3 py-1.5 text-center font-medium transition ${mode === "flex" ? "bg-panel text-white shadow-sm" : "text-muted hover:text-white"}`}
                    >
                      Flexible · {flex.survived}/{flex.total}
                    </button>
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    {mode === "flex"
                      ? "Flexible spending (Guyton-Klinger guardrails) trims your drawdown about 10% after the market falls, and lets it rise again after strong years — but never below your essentials. That flex is what carries a plan through a bad run of returns."
                      : "Fixed spending draws the same amount every year, whatever the markets do. Simple and predictable — but a bad run of returns early in retirement can drain the pot before it recovers."}
                  </p>
                  {uplift > 0 && (
                    <p className="mt-2 text-sm font-medium text-emerald-400">
                      <span aria-hidden>💡</span> Flexing spending survives {uplift} more of these downturn{uplift === 1 ? "" : "s"}.
                    </p>
                  )}
                  {mode === "flex" && worstFlexCut && uplift > 0 && (
                    <p className="mt-2 text-sm text-amber-300/90">
                      <span aria-hidden>⚠</span> The catch: it only works if you actually make the cuts. In the toughest run
                      ({worstFlexCut.label}) that meant {worstFlexCut.cutYears} year
                      {worstFlexCut.cutYears === 1 ? "" : "s"} below plan, bottoming at{" "}
                      {fmtCurrency(Math.round(worstFlexCut.minLivingSpend))} (−{Math.round(worstFlexCut.deepestCutPct)}%).
                    </p>
                  )}
                  {mode === "flex" && worstFlexCut && uplift === 0 && fixed && (
                    <p className="mt-2 text-sm text-muted">
                      Fixed spending already lasts through all {fixed.total} here, so flexing doesn&apos;t add safety — it
                      just trims your spending in the downturns anyway (up to {worstFlexCut.cutYears} years below plan,
                      down to {fmtCurrency(Math.round(worstFlexCut.minLivingSpend))}).
                    </p>
                  )}
                </div>
              )}

              <StressChart result={result} selectedId={selectedId} revealed={revealedIds} />
            </div>
          </div>

          {/* Flexibility ladder — how survival depends on how far you'd actually cut.
              Only meaningful for flexible spending. */}
          {mode === "flex" && ladder && (
            <div className="mt-5 rounded-2xl border border-line bg-panel p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">How flexible would you really be?</div>
              <p className="mt-1 text-sm text-muted">
                &ldquo;Survives&rdquo; assumes you actually make the cuts. The less you&apos;d cut in a downturn, the fewer
                you get through — the risk a Monte Carlo can&apos;t see.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ladder.rows.map((r, i) => {
                  const tone =
                    r.survived === ladder.total ? "text-emerald-400" : r.survived >= Math.ceil(ladder.total * 0.6) ? "text-amber-400" : "text-red-400";
                  return (
                    <div key={i} className="rounded-xl border border-line bg-panel-2 p-3 text-center">
                      <div className={`text-2xl font-bold ${tone}`}>
                        {r.survived}
                        <span className="text-base font-medium text-muted">/{ladder.total}</span>
                      </div>
                      <div className="mt-0.5 text-sm font-semibold text-white">
                        {fmtCurrency(r.floor)}
                        <span className="text-xs font-normal text-muted">/yr</span>
                      </div>
                      <div className="text-[11px] text-muted">
                        {"fixed" in r && r.fixed ? "won't cut" : "essentials" in r && r.essentials ? `to the bone (−${r.cutPct}%)` : `cut to −${r.cutPct}%`}
                      </div>
                    </div>
                  );
                })}
              </div>
              {ladder.rows[0].survived > ladder.rows[3].survived ? (
                <p className="mt-3 text-sm text-amber-300/90">
                  <span aria-hidden>⚠</span> The gap from {ladder.rows[0].survived}/{ladder.total} to{" "}
                  {ladder.rows[3].survived}/{ladder.total} is how much of your safety rests on cutting hard in a downturn —
                  the part a Monte Carlo just assumes you&apos;ll do.
                </p>
              ) : (
                <p className="mt-3 text-sm text-emerald-400/90">
                  <span aria-hidden>✓</span> This plan lasts through every downturn even without cutting — its safety
                  doesn&apos;t hinge on how flexible you&apos;d be.
                </p>
              )}
            </div>
          )}

          {/* Methodology / disclosure — spans both columns. */}
          <div className="mt-5 rounded-2xl border border-line bg-panel p-4">
            <p className="text-xs text-muted">
              Each era replays its actual year-by-year real returns from the moment you retire — the crashes and the
              recoveries as they happened — then reverts to your assumed return once the era&apos;s data runs out
              (1928–2025 US market history, used as a proxy for a globally-diversified portfolio, so the era years use
              history&apos;s return level rather than your dashboard assumption). Past performance is not a guarantee of
              future performance. General information only — not financial advice.{" "}
              <button onClick={() => setAssumptionsOpen(true)} className="font-medium text-accent hover:underline">
                Assumptions &amp; limitations →
              </button>
            </p>
          </div>
        </>
      )}

      {/* Theatrical "running the tests" modal. */}
      {running && current && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-2xl border border-line bg-panel p-6 text-center shadow-2xl">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              Stress test {step + 1} of {STRESS_ERAS.length}
            </div>
            <div className="mt-2 text-xl font-bold text-white">{current.label}</div>
            <p className="mt-1 text-sm text-muted">{current.blurb}</p>
            <div className="mt-5 flex items-center justify-center gap-2.5 text-sm font-medium text-accent">
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />
              <span>
                {QUIPS[current.id] ?? "Crunching the numbers…"}
                <span className="ml-0.5 inline-block animate-pulse">▍</span>
              </span>
            </div>
            <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${(step / STRESS_ERAS.length) * 100}%` }}
              />
            </div>
            <button onClick={skip} className="mt-4 text-xs text-muted transition hover:text-white">
              Skip the theatrics →
            </button>
          </div>
        </div>
      )}

      {plan && (
        <AssumptionsModal open={assumptionsOpen} onClose={() => setAssumptionsOpen(false)} config={config} plan={plan} />
      )}
    </div>
  );
}
