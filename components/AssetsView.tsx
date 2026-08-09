"use client";

import { useState } from "react";
import Link from "next/link";
import type { RetirementPlan } from "@/lib/au/types";
import { getIncomeStreams, getInvestmentProperties, startingSuperBalances } from "@/lib/au/types";
import { fmtCurrency } from "@/lib/au/format";

export interface AgePoint {
  age: number; // oldest member's age this year
  superTotal: number;
  savings: number; // outside-super
  homeValue: number;
  homeEquity: number; // homeValue less any mortgage
  propertyEquity: number; // combined investment-property net equity
  drLoan: number; // debt-recycling loan balance (already netted into savings/net worth)
  working: boolean; // accumulation phase (still earning)
  homeToOutside: number; // freed home-downsize equity routed to outside this year
  propToOutside: number; // property-sale proceeds routed to outside this year
  properties: { value: number; loan: number }[]; // per investment property, at this age (sold → 0/0)
}

interface Item {
  label: string;
  value: number;
  sub?: string;
}

function Row({ label, value, sub, tone = "text-slate-200", strong = false }: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${strong ? "border-t border-line pt-2" : ""}`}>
      <span className={`text-sm ${strong ? "font-semibold text-white" : "text-slate-300"}`}>
        {label}
        {sub && <span className="mt-0.5 block text-[11px] text-muted">{sub}</span>}
      </span>
      <span className={`shrink-0 text-sm tabular-nums ${strong ? "font-bold text-white" : tone}`}>{value}</span>
    </div>
  );
}

export default function AssetsView({ name, plan, points }: { name: string; plan: RetirementPlan; points: AgePoint[] }) {
  const [i, setI] = useState(0);
  const last = points.length - 1;
  const idx = Math.min(Math.max(i, 0), last);
  const p = points[idx];

  const isCouple = plan.household === "couple";
  const props = getInvestmentProperties(plan);
  const streams = getIncomeStreams(plan);
  const superSplit = startingSuperBalances(plan);
  const isToday = idx === 0;
  const homeLoan = Math.max(0, p.homeValue - p.homeEquity);
  const propName = (n: number) => props[n].name?.trim() || (props.length > 1 ? `Investment property ${n + 1}` : "Investment property");

  // Per-person ages at the selected point (the axis is the oldest member's age).
  const oldestCur = Math.max(...plan.people.map((pp) => pp.currentAge));
  const t = p.age - oldestCur;
  const you = plan.people[0].currentAge + t;
  const partner = isCouple ? plan.people[1].currentAge + t : null;

  // ── Assets ──────────────────────────────────────────────────────────────────
  const assets: Item[] = [];
  if (p.superTotal > 0) {
    assets.push({
      label: "Super",
      value: p.superTotal,
      sub: isToday && isCouple ? `you ${fmtCurrency(superSplit[0] ?? 0)} · partner ${fmtCurrency(superSplit[1] ?? 0)}` : undefined,
    });
  }
  if (p.savings > 0) {
    // Name where the savings came from — outside super often builds even with $0 of
    // annual savings (reinvested property rent while working; downsize / sale proceeds
    // routed to savings; leftover super drawdown in retirement).
    const sources: string[] = [];
    if (p.working) {
      if ((plan.annualOutsideSavings ?? 0) > 0) sources.push("your annual savings");
      if (props.some((pr) => pr.strategy !== "sell")) sources.push("reinvested property rent");
    }
    if (points.slice(0, idx + 1).some((pt) => pt.homeToOutside > 1)) sources.push("home downsize proceeds");
    if (points.slice(0, idx + 1).some((pt) => pt.propToOutside > 1)) sources.push("property sale proceeds");
    if (sources.length === 0 && !p.working) sources.push("reinvested income & super-drawdown surplus");
    assets.push({
      label: "Savings (outside super)",
      value: p.savings,
      sub: sources.length ? `incl. ${sources.join(" · ")}` : undefined,
    });
  }
  if (p.homeValue > 0) {
    assets.push({
      label: "Home",
      value: p.homeValue,
      sub: homeLoan > 0 ? `net equity ${fmtCurrency(p.homeEquity)} after the home loan` : "owned outright — exempt from the assets test",
    });
  }
  // Each investment property shown at its gross market value (its loan is a separate
  // liability below).
  p.properties.forEach((pp, n) => {
    if (pp.value > 0) {
      assets.push({
        label: propName(n),
        value: pp.value,
        sub: `${props[n].grossYield}% gross yield${pp.loan > 0 ? " · loan shown in liabilities" : ""}`,
      });
    }
  });

  // ── Liabilities ─────────────────────────────────────────────────────────────
  const liabilities: Item[] = [];
  if (homeLoan > 0) {
    const m = plan.mortgage;
    liabilities.push({
      label: "Home loan",
      value: homeLoan,
      sub: m ? `${m.interestRate}% · ${m.type === "interest_only" ? "interest-only" : "principal & interest"}` : undefined,
    });
  }
  p.properties.forEach((pp, n) => {
    if (pp.loan > 0) liabilities.push({ label: `${propName(n)} loan`, value: pp.loan, sub: `${props[n].loanRate}% · interest-only` });
  });

  const totalAssets = assets.reduce((s, a) => s + a.value, 0);
  const totalLiab = liabilities.reduce((s, a) => s + a.value, 0);
  const net = totalAssets - totalLiab;

  const activeStreams = streams.filter((s) => p.age >= s.fromAge && (!s.untilAge || p.age <= s.untilAge));
  const dr = plan.debtRecycle;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/" className="text-sm font-medium text-muted transition hover:text-white">← Back to planner</Link>

      <header className="mt-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Assets &amp; liabilities</div>
        <h1 className="mt-1 text-3xl font-bold text-white">{name}</h1>
        <p className="mt-2 text-sm text-muted">
          Your balance sheet through the plan, in today&apos;s dollars. Use the age slider to see how it changes over time.
        </p>
      </header>

      {/* Age navigator — steps by the eldest member's age. */}
      <div className="mt-6 rounded-2xl border border-line bg-panel-2 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setI(idx - 1)}
            disabled={idx === 0}
            aria-label="Previous age"
            className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm text-muted transition hover:border-accent/50 hover:text-white disabled:opacity-30"
          >
            ←
          </button>
          <div className="text-center">
            <div className="text-lg font-bold text-white">
              Age {p.age}
              {isToday && <span className="ml-1.5 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">today</span>}
            </div>
            {isCouple && <div className="text-[11px] text-muted">you {you} · partner {partner}</div>}
          </div>
          <button
            onClick={() => setI(idx + 1)}
            disabled={idx === last}
            aria-label="Next age"
            className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm text-muted transition hover:border-accent/50 hover:text-white disabled:opacity-30"
          >
            →
          </button>
        </div>
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={idx}
          onChange={(e) => setI(Number(e.target.value))}
          aria-label="Age"
          className="mt-3 w-full"
        />
        <div className="mt-0.5 flex justify-between text-[10px] text-muted">
          <span>{points[0].age}</span>
          <span>{points[last].age}</span>
        </div>
      </div>

      {/* Net worth hero */}
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-2xl border border-accent/30 bg-accent/5 px-5 py-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Net worth at {p.age}</div>
          <div className="mt-0.5 text-3xl font-bold tabular-nums text-white">{fmtCurrency(net)}</div>
        </div>
        <div className="text-sm tabular-nums text-muted">
          {fmtCurrency(totalAssets)} in assets{totalLiab > 0 ? <> <span aria-hidden>−</span> {fmtCurrency(totalLiab)} in liabilities</> : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {/* Assets */}
        <section className="rounded-2xl border border-line bg-panel-2 p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-200">Assets</h2>
          {assets.length === 0 ? (
            <p className="py-2 text-xs text-muted">No assets at this age.</p>
          ) : (
            <>
              {assets.map((a, n) => (
                <Row key={n} label={a.label} value={fmtCurrency(a.value)} sub={a.sub} tone="text-emerald-300" />
              ))}
              <Row label="Total assets" value={fmtCurrency(totalAssets)} strong />
            </>
          )}
        </section>

        {/* Liabilities */}
        <section className="rounded-2xl border border-line bg-panel-2 p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-200">Liabilities</h2>
          {liabilities.length === 0 ? (
            <p className="py-2 text-xs text-muted">No loans at this age.</p>
          ) : (
            <>
              {liabilities.map((l, n) => (
                <Row key={n} label={l.label} value={`−${fmtCurrency(l.value)}`} sub={l.sub} tone="text-rose-300" />
              ))}
              <Row label="Total liabilities" value={`−${fmtCurrency(totalLiab)}`} strong />
            </>
          )}
        </section>
      </div>

      {/* Income streams active at the selected age. */}
      {streams.length > 0 && (
        <section className="mt-4 rounded-2xl border border-line bg-panel-2 p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-200">Income streams at age {p.age}</h2>
          <p className="mb-1 text-[11px] text-muted">Ongoing income (a pension, annuity or distribution) — not a balance, so not in net worth above.</p>
          {activeStreams.length === 0 ? (
            <p className="py-1 text-xs text-muted">None active at this age.</p>
          ) : (
            activeStreams.map((s, n) => (
              <Row
                key={s.id || n}
                label={s.label?.trim() || `Income stream ${n + 1}`}
                value={`${fmtCurrency(s.perYear)}/yr`}
                sub={`from age ${s.fromAge}${s.untilAge ? ` to ${s.untilAge}` : " for life"}${s.indexed ? "" : " · not indexed"}`}
                tone="text-teal-300"
              />
            ))
          )}
        </section>
      )}

      {/* Debt recycling — a planned geared loan; its balance is already netted into savings above. */}
      {dr && dr.perYear > 0 && (
        <section className="mt-4 rounded-2xl border border-line bg-panel-2 p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-200">Planned strategy — debt recycling</h2>
          <Row
            label="Geared share investment (deductible loan)"
            value={`${fmtCurrency(dr.perYear)}/yr`}
            sub={`borrowed at ${dr.loanRatePct}% until age ${dr.untilAge}${p.drLoan > 0 ? ` — loan balance at ${p.age}: ${fmtCurrency(p.drLoan)} (already netted into savings)` : ""}`}
            tone="text-amber-300"
          />
        </section>
      )}

      <p className="mt-6 text-[11px] leading-snug text-muted">
        Projected with your plan&apos;s assumptions, in today&apos;s dollars. Your home and any investment properties are
        shown at their market value, with each loan listed separately as a liability, so net worth reflects your equity.
        Super and savings are the combined balances at each age.
      </p>
    </main>
  );
}
