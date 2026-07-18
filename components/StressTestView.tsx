"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan } from "@/lib/au/types";
import { DEFAULT_PLAN } from "@/lib/au/types";
import type { SavedPlan } from "@/app/actions/plans";
import { runStressTest, type StressEraResult } from "@/lib/au/stresstest";
import { fmtCurrency } from "@/lib/au/format";
import { track } from "@/lib/analytics";
import StressChart from "@/components/StressChart";

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
        <div className="flex min-w-0 items-center gap-3">
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
            <div className="truncate text-xs text-muted">{era.blurb}</div>
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

  const result = useMemo(() => (plan ? runStressTest(plan, config) : null), [plan, config]);
  const life = plan?.lifeExpectancy ?? 90;

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
    <div className="mx-auto max-w-3xl px-5 py-8">
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
          {/* Headline scorecard */}
          <div className={`mb-5 rounded-2xl border ${toneRing} bg-panel p-5`}>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Survival scorecard</div>
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
          </div>

          {/* Ranked, worst-first */}
          <ul className="mb-5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
            {result.eras.map((era) => (
              <Row
                key={era.id}
                era={era}
                life={life}
                selected={selectedId === era.id}
                onSelect={() => setSelectedId((cur) => (cur === era.id ? null : era.id))}
              />
            ))}
          </ul>

          <StressChart result={result} selectedId={selectedId} />

          <p className="mt-4 text-xs text-muted">
            Each era replays its actual year-by-year real returns from the moment you retire, at full historical
            severity, then reverts to your assumed return once the era&apos;s data runs out. Past performance isn&apos;t a
            guarantee of the future; US market history is used as a proxy. General information only — not financial advice.
          </p>
        </>
      )}
    </div>
  );
}
