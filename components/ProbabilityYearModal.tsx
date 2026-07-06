"use client";

import { fmtCompact, fmtCurrency } from "@/lib/au/format";
import type { FanPoint } from "@/lib/au/montecarlo";
import type { RetirementPlan } from "@/lib/au/types";

function NavBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg px-2 py-1.5 text-muted transition hover:bg-panel-2 hover:text-white disabled:opacity-30"
    >
      {label}
    </button>
  );
}

/**
 * Explains the spread of outcomes at one age on the probabilistic (fan) chart —
 * bridging the single "central" line in the deterministic sections to the range
 * of futures the Monte Carlo simulation produces, and why that range exists.
 */
export default function ProbabilityYearModal({
  age,
  point,
  central,
  iterations,
  plan,
  onClose,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: {
  age: number;
  point: FanPoint;
  central: number | null;
  iterations: number;
  plan: RetirementPlan;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  const { p10, p50, p90, solvent } = point;
  const solventPct = Math.round(solvent * 100);
  const runShortPct = 100 - solventPct;
  const retired = age >= plan.retirementAge;
  const yearsOut = Math.max(0, age - Math.max(...plan.people.map((pp) => pp.currentAge)));

  // Position markers within the p10–p90 range for the little spread bar.
  const range = Math.max(1, p90 - p10);
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - p10) / range) * 100));
  const centralInRange = central != null && central >= p10 && central <= p90;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-accent">
              Range of outcomes
            </div>
            <h2 className="mt-0.5 text-lg font-bold text-white">
              Age {age}{" "}
              <span className="text-sm font-medium text-muted">
                · {retired ? "in retirement" : "still saving"}
              </span>
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <NavBtn label="←" onClick={onPrev} disabled={!canPrev} />
            <NavBtn label="→" onClick={onNext} disabled={!canNext} />
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-muted transition hover:bg-panel-2 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-sm text-slate-300">
          <p>
            The earlier charts show a single <strong className="text-white">central line</strong> —
            the path if every year earned exactly your {plan.investmentReturn}% assumption. Real
            markets don&apos;t do that. Across{" "}
            <strong className="text-white">{iterations.toLocaleString()} simulated futures</strong>,
            here&apos;s the range of what your savings could be worth at age {age}.
          </p>

          {/* Spread bar */}
          <div className="rounded-xl border border-line bg-panel-2 p-4">
            <div className="relative mt-1 h-3 rounded-full bg-gradient-to-r from-amber-500/30 via-emerald-500/25 to-emerald-400/40">
              {/* median marker */}
              <span
                className="absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-emerald-400"
                style={{ left: `${pos(p50)}%` }}
                title="Median"
              />
              {/* central (deterministic) marker */}
              {centralInRange && (
                <span
                  className="absolute top-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-white"
                  style={{ left: `${pos(central!)}%` }}
                  title="Central estimate"
                />
              )}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-muted">
              <span>worst 10%: {fmtCompact(p10)}</span>
              <span>best 10%: {fmtCompact(p90)}</span>
            </div>
            <div className="mt-3 space-y-1.5">
              <Row label="Best 10% of futures" value={`${fmtCurrency(Math.round(p90))} or more`} dot="bg-emerald-400" />
              <Row label="Middle (median)" value={fmtCurrency(Math.round(p50))} dot="bg-emerald-500" strong />
              <Row
                label="Worst 10% of futures"
                value={p10 > 1 ? `${fmtCurrency(Math.round(p10))} or less` : "nothing left"}
                dot="bg-amber-500"
              />
              {central != null && (
                <div className="mt-1 flex items-center justify-between gap-4 border-t border-line pt-2">
                  <span className="flex items-center gap-2 text-slate-200">
                    <span className="h-3 w-0.5 bg-white" />
                    Central estimate (the line in the earlier charts)
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-white">
                    {fmtCurrency(Math.round(central))}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Solvency */}
          <div
            className={`rounded-xl border px-4 py-3 ${
              runShortPct > 0
                ? "border-amber-500/25 bg-amber-500/5"
                : "border-accent/25 bg-accent/5"
            }`}
          >
            {runShortPct > 0 ? (
              <p className="text-slate-200">
                <strong className="text-white">{solventPct}%</strong> of these futures still have
                savings at age {age}. The other <strong className="text-amber-300">{runShortPct}%</strong>{" "}
                have already run short — living on the Age Pension floor (still an income, just below
                your target).
              </p>
            ) : (
              <p className="text-slate-200">
                In <strong className="text-white">every</strong> simulated future you still have
                savings at age {age}.
              </p>
            )}
          </div>

          {/* Why the spread */}
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Why the spread?
            </h3>
            <p className="text-slate-300">
              Each year we draw a return around your {plan.investmentReturn}% assumption with about
              ±{plan.returnVolatility}% of year-to-year swing. A run of good years compounds upward;
              a run of bad ones compounds downward — and the further out you go, the more these
              differences stack up. That&apos;s why the range is narrow near today and fans out over
              the {yearsOut > 0 ? `${yearsOut} years` : "years"} to age {age}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, dot, strong }: { label: string; value: string; dot: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 text-slate-200">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        {label}
      </span>
      <span className={`shrink-0 tabular-nums ${strong ? "font-bold text-white" : "font-semibold text-slate-100"}`}>
        {value}
      </span>
    </div>
  );
}
