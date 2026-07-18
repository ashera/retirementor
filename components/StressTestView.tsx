"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan } from "@/lib/au/types";
import { DEFAULT_PLAN } from "@/lib/au/types";
import type { SavedPlan } from "@/app/actions/plans";
import { runStressTest, STRESS_ERAS, type StressEraResult } from "@/lib/au/stresstest";
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
  return (
    <li className={era.lasts ? "" : "bg-red-500/[0.04]"}>
      <button
        onClick={onSelect}
        aria-expanded={selected}
        className={`flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-left text-sm transition ${
          selected ? "bg-accent/[0.06]" : "hover:bg-white/[0.02]"
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
              era.lasts ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
            }`}
            aria-hidden
          >
            {era.lasts ? "✓" : "✕"}
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-white">{era.label}</div>
            <div className={`text-xs text-muted ${selected ? "" : "truncate"}`}>{era.blurb}</div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {era.lasts ? (
            <div className="font-semibold text-emerald-400">lasts to {life}+</div>
          ) : (
            <div className="font-semibold text-red-400">runs out at {era.depletionAge}</div>
          )}
          <div className="text-xs text-muted">
            {era.lasts
              ? `dips to ${fmtCurrency(Math.max(0, Math.round(era.minBalance)))} at ${era.minAge}`
              : `${yrsShort} yr${yrsShort === 1 ? "" : "s"} short of ${life}`}
          </div>
        </div>
      </button>
      {selected && (
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
      )}
    </li>
  );
}

export default function StressTestView({
  config,
  savedPlans,
}: {
  config: EngineConfig;
  savedPlans: SavedPlan[];
}) {
  const [plan, setPlan] = useState<RetirementPlan | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  useEffect(() => {
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
  const life = plan?.lifeExpectancy ?? 90;

  // Theatrical run: reveal the eras one at a time (chronologically), each taking a
  // random 5–10s to "test", with commentary in a modal. `step` = eras completed.
  const [step, setStep] = useState(0);
  const running = !!result && step < STRESS_ERAS.length;
  const revealedIds = useMemo(() => new Set(STRESS_ERAS.slice(0, step).map((e) => e.id)), [step]);
  const current = step < STRESS_ERAS.length ? STRESS_ERAS[step] : null;
  useEffect(() => {
    if (!result || step >= STRESS_ERAS.length) return;
    const delay = 5000 + Math.floor(Math.random() * 5000);
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
        <Link href="/" className="text-sm font-medium text-muted hover:text-white">
          ← Back to planner
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
            href="/"
            className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft"
          >
            ← Go to the planner
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
            {/* Left: headline + ranked list */}
            <div className="space-y-4">
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
                          ? `${result.worst.label} is the one that breaks it — your money runs out at age ${result.worst.depletionAge}.`
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
            <div className="space-y-4 lg:sticky lg:top-6">
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
                </div>
              )}

              <StressChart result={result} selectedId={selectedId} revealed={revealedIds} />
            </div>
          </div>

          {/* Methodology / disclosure — spans both columns. */}
          <div className="mt-5 rounded-2xl border border-line bg-panel p-4">
            <p className="text-xs text-muted">
              Each era replays its actual year-by-year real returns from the moment you retire, at full historical
              severity, then reverts to your assumed return once the era&apos;s data runs out (1928–2025 US market
              history, used as a proxy for a globally-diversified portfolio). It stresses the SEQUENCE of returns, not
              your long-run return assumption. Past performance is not a guarantee of future performance. General
              information only — not financial advice.{" "}
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
