"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { simulate } from "@/lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "@/lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan, type MortgageStrategy } from "@/lib/au/types";
import { rowNetWorth } from "@/lib/au/networth";
import { fmtCompact, fmtCurrency } from "@/lib/au/format";
import Bert from "@/components/Bert";

// Should you pay the mortgage off at retirement, or keep it? Runs the REAL engine for
// both — so the comparison reflects the Age Pension means test (the family home is
// exempt; super/savings are assessed, so clearing can LIFT your pension), tax, and the
// full drawdown — not just a return-vs-rate rule of thumb.

function Row({
  label, value, min, max, step, onChange, display, hint,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; display: string; hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-sm font-medium text-slate-200">{label}</label>
        <span className="font-mono text-sm font-semibold tabular-nums text-white">{display}</span>
      </div>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full" aria-label={label} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default function MortgageAtRetirementCalculator() {
  const [couple, setCouple] = useState(false);
  const [age, setAge] = useState(65);
  const [superBal, setSuperBal] = useState(700_000);
  const [savings, setSavings] = useState(50_000);
  const [homeValue, setHomeValue] = useState(900_000);
  const [balance, setBalance] = useState(180_000);
  const [rate, setRate] = useState(6);
  const [term, setTerm] = useState(10);
  const [spend, setSpend] = useState(55_000);
  const [ret, setRet] = useState(7);
  const [infl, setInfl] = useState(2.5);
  const [life, setLife] = useState(90);
  const [showAssumptions, setShowAssumptions] = useState(false);
  // Other assessable assets — so the Age Pension (and the uplift from clearing) is real,
  // not an artefact of assuming the household has nothing outside super.
  const [hasProperty, setHasProperty] = useState(false);
  const [propValue, setPropValue] = useState(600_000);
  const [propLoan, setPropLoan] = useState(0);
  const [propYield, setPropYield] = useState(4);

  const r = useMemo(() => {
    // Annual P&I repayment implied by balance / rate / remaining term.
    const i = rate / 100;
    const repay = i > 0 ? (balance * i) / (1 - Math.pow(1 + i, -term)) : balance / Math.max(1, term);
    const people = couple
      ? [
          { ...DEFAULT_PLAN.people[0], currentAge: age, superBalance: Math.round(superBal / 2), salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
          { ...DEFAULT_PLAN.people[0], currentAge: age, superBalance: Math.round(superBal / 2), salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
        ]
      : [{ ...DEFAULT_PLAN.people[0], currentAge: age, superBalance: superBal, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }];

    const plan = (strategy: MortgageStrategy): RetirementPlan => ({
      ...DEFAULT_PLAN,
      household: couple ? "couple" : "single",
      superMode: "individual",
      people,
      homeowner: true,
      outsideSuper: savings,
      annualOutsideSavings: 0,
      retirementAge: age, // retiring now
      spendingMode: "flat",
      targetSpending: spend, // living spend, excludes the mortgage (engine adds that)
      investmentReturn: ret,
      returnVolatility: 11,
      inflation: infl,
      lifeExpectancy: life,
      home: { value: homeValue, growthReal: 2 },
      mortgage: { type: "principal_interest", balance, interestRate: rate, annualRepayment: Math.round(repay), payoffAge: age + term, strategy },
      // An investment property: net equity is asset-tested and its actual net rent is
      // income-tested (not deemed) — the engine handles both, so the pension is right.
      investmentProperties:
        hasProperty && propValue > 0
          ? [{ value: propValue, growthReal: 2, grossYield: propYield, costRatio: 25, loanBalance: propLoan, loanRate: 6, purchasePrice: propValue, strategy: "hold" as const, sellAtAge: life }]
          : undefined,
    });

    const keep = simulate(plan("carry"), cfg);
    const clear = simulate(plan("clear_at_retirement"), cfg);
    const terminal = (res: ReturnType<typeof simulate>) => (res.rows.length ? rowNetWorth(res.rows[res.rows.length - 1]) : 0);
    // Age Pension once eligible (first year at/over Age-Pension age).
    const pension = (res: ReturnType<typeof simulate>) => {
      const row = res.rows.find((x) => x.age >= cfg.agePensionAge) ?? res.rows[res.rows.length - 1];
      return row?.agePension ?? 0;
    };
    const lasts = (res: ReturnType<typeof simulate>) => (res.lastsToLifeExpectancy ? life : res.depletedAge ?? 0);

    const nwKeep = Math.round(terminal(keep));
    const nwClear = Math.round(terminal(clear));
    const diff = nwKeep - nwClear; // + → keeping leaves more
    const pensionUplift = Math.round(pension(clear) - pension(keep)); // clearing usually lifts the pension
    const enoughSuper = balance <= superBal + savings;

    // Net worth over time, both choices — the visual that makes the comparison land.
    const series = keep.rows.map((row, i) => ({
      age: row.age,
      keep: Math.round(rowNetWorth(row)),
      clear: clear.rows[i] ? Math.round(rowNetWorth(clear.rows[i])) : null,
    }));

    return {
      repay: Math.round(repay),
      series,
      nwKeep, nwClear, diff,
      pensionKeep: Math.round(pension(keep)), pensionClear: Math.round(pension(clear)), pensionUplift,
      lastsKeep: lasts(keep), lastsClear: lasts(clear),
      keepLasts: keep.lastsToLifeExpectancy, clearLasts: clear.lastsToLifeExpectancy,
      winner: diff > 2_000 ? "keep" : diff < -2_000 ? "clear" : "tie",
      returnBeatsRate: ret > rate,
      enoughSuper,
    };
  }, [couple, age, superBal, savings, homeValue, balance, rate, term, spend, ret, infl, life, hasProperty, propValue, propLoan, propYield]);

  const winnerText =
    r.winner === "keep"
      ? `Keeping the mortgage leaves about ${fmtCurrency(Math.abs(r.diff))} more at ${life}`
      : r.winner === "clear"
        ? `Clearing the mortgage leaves about ${fmtCurrency(Math.abs(r.diff))} more at ${life}`
        : `It's roughly line-ball either way at ${life}`;
  const winTone = r.winner === "clear" ? "#34d399" : r.winner === "keep" ? "#38bdf8" : "#94a3b8";
  const bert =
    r.winner === "clear"
      ? "Clearing wins here — the Age Pension boost and the gone repayment outweigh keeping it invested."
      : r.winner === "keep"
        ? "Keeping wins on paper — your return beats the loan rate, so the money does more left invested. Weigh that against the comfort of being debt-free."
        : "Too close to call on the numbers — so peace of mind and your appetite for risk get the deciding vote.";

  const Col = ({ title, nw, pension, lastsAge, lasts, tone }: { title: string; nw: number; pension: number; lastsAge: number; lasts: boolean; tone: string }) => (
    <div className="flex-1 rounded-xl border border-line bg-panel-2/40 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: tone }}>{title}</div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight text-white">{fmtCurrency(nw)}</div>
      <div className="text-[11px] text-muted">net worth at {life}</div>
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-2"><dt className="text-muted">Age Pension (from {cfg.agePensionAge})</dt><dd className="font-medium tabular-nums text-white">{fmtCurrency(pension)}/yr</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">Money lasts</dt><dd className={`font-medium ${lasts ? "text-emerald-300" : "text-amber-300"}`}>{lasts ? `to ${life}+` : `to ~${lastsAge}`}</dd></div>
      </dl>
    </div>
  );

  return (
    <div className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line bg-panel-2 p-1 text-sm">
          {([["single", "Single"], ["couple", "Couple"]] as const).map(([k, lbl]) => (
            <button key={k} type="button" onClick={() => setCouple(k === "couple")} className={`rounded-md px-3 py-1.5 font-medium transition ${couple === (k === "couple") ? "bg-accent text-ink" : "text-muted hover:text-white"}`}>{lbl}</button>
          ))}
        </div>
        <span className="text-xs text-muted">Retiring now, at the age below.</span>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Row label="Your age (retiring now)" value={age} min={60} max={80} step={1} onChange={setAge} display={`${age}`} />
        <Row label="Super balance" value={superBal} min={50_000} max={3_000_000} step={10_000} onChange={setSuperBal} display={fmtCurrency(superBal)} />
        <Row label="Mortgage still owing" value={balance} min={0} max={1_000_000} step={5_000} onChange={setBalance} display={fmtCurrency(balance)} />
        <Row label="Interest rate" value={rate} min={3} max={10} step={0.1} onChange={setRate} display={`${rate.toFixed(1)}%`} />
        <Row label="Years left on the loan" value={term} min={1} max={25} step={1} onChange={setTerm} display={`${term} yr${term === 1 ? "" : "s"}`} hint={`≈ ${fmtCurrency(r.repay)}/yr in repayments`} />
        <Row label="Spending (excl. mortgage)" value={spend} min={20_000} max={150_000} step={1_000} onChange={setSpend} display={`${fmtCurrency(spend)}/yr`} />
        <Row label="Shares & cash outside super" value={savings} min={0} max={3_000_000} step={5_000} onChange={setSavings} display={fmtCurrency(savings)} hint="Shares, ETFs, funds, bank — assessed for the Age Pension." />
      </div>

      {/* Investment property — so the means test (and the pension boost) is real */}
      <div className="mt-4">
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" checked={hasProperty} onChange={(e) => setHasProperty(e.target.checked)} className="h-4 w-4 accent-accent" />
          I also have an investment property
        </label>
        {hasProperty && (
          <div className="mt-3 grid gap-5 rounded-xl border border-line bg-panel-2/50 p-4 sm:grid-cols-3">
            <Row label="Property value" value={propValue} min={100_000} max={3_000_000} step={25_000} onChange={setPropValue} display={fmtCurrency(propValue)} />
            <Row label="Loan still owing on it" value={propLoan} min={0} max={2_000_000} step={10_000} onChange={setPropLoan} display={fmtCurrency(propLoan)} />
            <Row label="Gross rental yield" value={propYield} min={1} max={8} step={0.1} onChange={setPropYield} display={`${propYield.toFixed(1)}%`} hint="Net equity is asset-tested; rent is income-tested." />
          </div>
        )}
      </div>

      <div className="mt-4">
        <button type="button" onClick={() => setShowAssumptions((v) => !v)} className="text-xs font-medium text-muted transition hover:text-white">
          {showAssumptions ? "▾" : "▸"} More ({fmtCurrency(homeValue)} home · {ret}% return · {infl}% inflation · to {life})
        </button>
        {showAssumptions && (
          <div className="mt-3 grid gap-5 rounded-xl border border-line bg-panel-2/50 p-4 sm:grid-cols-2">
            <Row label="Home value" value={homeValue} min={300_000} max={3_000_000} step={25_000} onChange={setHomeValue} display={fmtCurrency(homeValue)} hint="Your home is exempt from the assets test." />
            <Row label="Investment return (p.a.)" value={ret} min={3} max={10} step={0.1} onChange={setRet} display={`${ret.toFixed(1)}%`} hint="Super/savings earn this; compare it to your loan rate." />
            <Row label="Inflation (p.a.)" value={infl} min={1} max={5} step={0.1} onChange={setInfl} display={`${infl.toFixed(1)}%`} />
            <Row label="Plan to age" value={life} min={80} max={100} step={1} onChange={setLife} display={`${life}`} />
          </div>
        )}
      </div>

      {!r.enoughSuper && (
        <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-2.5 text-[13px] text-amber-200/90">
          Your {fmtCurrency(balance)} balance is more than your super + savings — you couldn&apos;t fully clear it from super, so &ldquo;clear&rdquo; below assumes paying off what you can.
        </p>
      )}

      {/* Result */}
      <div className="mt-6 rounded-2xl border p-5" style={{ borderColor: `${winTone}55`, background: `${winTone}12` }}>
        <div className="flex items-start gap-4">
          <Bert pose="glasses" size={48} className="hidden shrink-0 sm:block" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: winTone }}>The verdict · today&apos;s dollars</div>
            <div className="mt-1 text-xl font-extrabold tracking-tight text-white sm:text-2xl">{winnerText}</div>
            {r.pensionUplift > 100 && (
              <p className="mt-1 text-sm text-slate-200">
                Clearing it lifts your Age Pension by about <span className="font-semibold text-emerald-300">{fmtCurrency(r.pensionUplift)}/yr</span> (less assessable super), and ends the {fmtCurrency(r.repay)}/yr repayment.
              </p>
            )}
            {/* Net worth over time — both choices */}
            <div className="mt-4 rounded-xl border border-line bg-panel-2/40 p-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Net worth over time · today&apos;s dollars</div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={r.series} margin={{ top: 5, right: 6, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="nwKeep" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#38bdf8" stopOpacity={0.25} /><stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} /></linearGradient>
                      <linearGradient id="nwClear" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity={0.25} /><stop offset="100%" stopColor="#34d399" stopOpacity={0.02} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#232c40" vertical={false} />
                    <XAxis dataKey="age" stroke="#8b97ad" fontSize={11} tickLine={false} axisLine={{ stroke: "#232c40" }} />
                    <YAxis stroke="#8b97ad" fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={fmtCompact} />
                    <Tooltip
                      contentStyle={{ background: "#0b1220", border: "1px solid #232c40", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "#e2e8f0" }}
                      formatter={(v: number, name: string) => [fmtCurrency(Math.round(v)), name]}
                      labelFormatter={(a) => `Age ${a}`}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="keep" name="Keep the mortgage" stroke="#38bdf8" strokeWidth={2} fill="url(#nwKeep)" isAnimationActive={false} dot={false} />
                    <Area type="monotone" dataKey="clear" name="Clear it with super" stroke="#34d399" strokeWidth={2} fill="url(#nwClear)" isAnimationActive={false} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Col title="Keep the mortgage" nw={r.nwKeep} pension={r.pensionKeep} lastsAge={r.lastsKeep} lasts={r.keepLasts} tone="#38bdf8" />
              <Col title="Clear it with super" nw={r.nwClear} pension={r.pensionClear} lastsAge={r.lastsClear} lasts={r.clearLasts} tone="#34d399" />
            </div>
            <p className="mt-3 text-[13px] italic leading-snug text-accent-soft">&ldquo;{bert}&rdquo;</p>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        General information only, not personal financial advice. A deterministic projection in today&apos;s dollars on the assumptions you
        set — it runs the full RetireWiz engine (Age Pension means test, tax, drawdown) for both choices, but doesn&apos;t weigh market
        risk, your peace of mind, or the sequence-of-returns risk that makes being debt-free safer. Drawing a super lump sum to clear the
        loan is tax-free from age 60. Check your own numbers in the planner, and consider a licensed adviser.
      </p>
    </div>
  );
}
