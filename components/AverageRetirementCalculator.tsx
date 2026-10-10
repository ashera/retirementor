"use client";

import { useMemo, useState } from "react";
import { fmtCurrency } from "@/lib/au/format";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import Bert from "@/components/Bert";

// Reproduces the r/AusFinance "can the average Australian retire comfortably?"
// calculation: the real (today's-dollars) super balance at retirement from a
// growing-contribution annuity plus the current balance compounded, all deflated by
// inflation. Faithful to the thread's closed form:
//   FV_real = [ C·((1+r)^n − (1+g)^n)/(r−g) + PV·(1+r)^n ] / (1+inf)^n
// where C = income × SG × (1−tax) × (1−fee) is the first year's net contribution.
// Self-contained (no engine) — the planner does the full drawdown + Age Pension.

const SUPER_TAX = 0.15; // contributions tax, fixed in the thread's model
const ASFA = DEFAULT_CONFIG.asfa.lumpSum; // { comfortable:{single,couple}, modest:{single,couple} }
const COMFORTABLE = ASFA.comfortable.single; // $630k single
const MODEST = ASFA.modest.single; // $110k single

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
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full"
        aria-label={label}
      />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

type Preset = { key: string; label: string; title: string; patch: () => void };

export default function AverageRetirementCalculator() {
  // Primary inputs
  const [age, setAge] = useState(38);
  const [retireAge, setRetireAge] = useState(67);
  const [income, setIncome] = useState(90_500);
  const [superNow, setSuperNow] = useState(182_800);
  // Assumptions (folded)
  const [sg, setSg] = useState(12); // %
  const [growth, setGrowth] = useState(6.4); // % p.a. super return
  const [fee, setFee] = useState(1); // % p.a.
  const [incomeGrowth, setIncomeGrowth] = useState(2.6); // % p.a.
  const [inflation, setInflation] = useState(2.5); // % p.a.
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [activePreset, setActivePreset] = useState("average");

  const r = useMemo(() => {
    const n = Math.max(0, retireAge - age);
    const rate = growth / 100;
    const g = incomeGrowth / 100;
    const inf = inflation / 100;
    const c = income * (sg / 100) * (1 - SUPER_TAX) * (1 - fee / 100);
    // Growing annuity future value (contribution grows at g, compounds at rate).
    const growingFv =
      Math.abs(rate - g) < 1e-9
        ? c * n * Math.pow(1 + rate, n - 1) // limit when rate ≈ g
        : (c * (Math.pow(1 + rate, n) - Math.pow(1 + g, n))) / (rate - g);
    const nominal = growingFv + superNow * Math.pow(1 + rate, n);
    const real = nominal / Math.pow(1 + inf, n);
    const balance = Math.max(0, Math.round(real));
    const verdict = balance >= COMFORTABLE ? "comfortable" : balance >= MODEST ? "modest" : "short";
    // Bar: position within [0, comfortable×1.3] for a sense of headroom.
    const barMax = COMFORTABLE * 1.35;
    return { n, balance, verdict, pct: Math.min(100, (balance / barMax) * 100), comfPct: (COMFORTABLE / barMax) * 100, modPct: (MODEST / barMax) * 100 };
  }, [age, retireAge, income, superNow, sg, growth, fee, incomeGrowth, inflation]);

  const presets: Preset[] = [
    { key: "average", label: "Average case", title: "The thread's base case: average super, median full-time income", patch: () => { setAge(38); setRetireAge(67); setIncome(90_500); setSuperNow(182_800); setSg(12); setGrowth(6.4); setFee(1); setIncomeGrowth(2.6); setInflation(2.5); } },
    { key: "median", label: "Median super", title: "The same, but with the MEDIAN 35–44 balance (~$55k) instead of the skewed average", patch: () => { setSuperNow(55_000); } },
    { key: "nopay", label: "No pay rises", title: "Income never grows for 29 years (0% income growth)", patch: () => { setIncomeGrowth(0); } },
    { key: "infl4", label: "4% inflation", title: "Inflation stays at 4% for the whole period", patch: () => { setInflation(4); } },
    { key: "retire60", label: "Retire at 60", title: "Stop at the preservation age of 60", patch: () => { setRetireAge(60); } },
    { key: "parttime", label: "Part-time (0.5)", title: "Work half-time the whole way ($45,250)", patch: () => { setIncome(45_250); } },
  ];
  const applyPreset = (p: Preset) => { if (p.key === "average") p.patch(); else { presets[0].patch(); p.patch(); } setActivePreset(p.key); };

  const tone = r.verdict === "comfortable" ? "#34d399" : r.verdict === "modest" ? "#f59e0b" : "#f87171";
  const verdictText =
    r.verdict === "comfortable"
      ? `That clears the ASFA comfortable target of ${fmtCurrency(COMFORTABLE)} for a single.`
      : r.verdict === "modest"
        ? `Below the ${fmtCurrency(COMFORTABLE)} comfortable mark, but above the ${fmtCurrency(MODEST)} modest one — and the Age Pension tops it up.`
        : `Below the ${fmtCurrency(MODEST)} modest target — the Age Pension would do most of the lifting here.`;
  const bert =
    r.verdict === "comfortable"
      ? "On these averages it holds up — but averages hide a lot. Try the median balance and see what happens."
      : r.verdict === "modest"
        ? "Not a disaster — remember the Age Pension is designed to top this up. But it's a long way from the headline."
        : "This is where the Age Pension really matters. Worth modelling the whole picture, not just the balance.";

  return (
    <div className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p)}
            title={p.title}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              activePreset === p.key ? "border-accent bg-accent/15 text-accent" : "border-line bg-panel-2 text-muted hover:text-white"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Inputs */}
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Row label="Your age now" value={age} min={18} max={60} step={1} onChange={(v) => { setAge(v); setActivePreset(""); }} display={`${age}`} />
        <Row label="Retirement age" value={retireAge} min={Math.max(age + 1, 55)} max={75} step={1} onChange={(v) => { setRetireAge(v); setActivePreset(""); }} display={`${retireAge}`} />
        <Row label="Gross income" value={income} min={20_000} max={250_000} step={500} onChange={(v) => { setIncome(v); setActivePreset(""); }} display={`${fmtCurrency(income)}/yr`} />
        <Row label="Super balance now" value={superNow} min={0} max={1_000_000} step={1_000} onChange={(v) => { setSuperNow(v); setActivePreset(""); }} display={fmtCurrency(superNow)} />
      </div>

      {/* Assumptions */}
      <div className="mt-4">
        <button type="button" onClick={() => setShowAssumptions((v) => !v)} className="text-xs font-medium text-muted transition hover:text-white">
          {showAssumptions ? "▾" : "▸"} Assumptions ({sg}% super · {growth}% return · {fee}% fee · {incomeGrowth}% pay growth · {inflation}% inflation)
        </button>
        {showAssumptions && (
          <div className="mt-3 grid gap-5 rounded-xl border border-line bg-panel-2/50 p-4 sm:grid-cols-2">
            <Row label="Super guarantee" value={sg} min={9} max={15} step={0.5} onChange={(v) => { setSg(v); setActivePreset(""); }} display={`${sg}%`} hint="Employer super, as a % of pay." />
            <Row label="Super return (p.a.)" value={growth} min={3} max={9} step={0.1} onChange={(v) => { setGrowth(v); setActivePreset(""); }} display={`${growth}%`} />
            <Row label="Super fee (p.a.)" value={fee} min={0} max={2} step={0.1} onChange={(v) => { setFee(v); setActivePreset(""); }} display={`${fee}%`} />
            <Row label="Pay growth (p.a.)" value={incomeGrowth} min={0} max={5} step={0.1} onChange={(v) => { setIncomeGrowth(v); setActivePreset(""); }} display={`${incomeGrowth}%`} />
            <Row label="Inflation (p.a.)" value={inflation} min={1} max={5} step={0.1} onChange={(v) => { setInflation(v); setActivePreset(""); }} display={`${inflation}%`} hint="Used to show the balance in today's dollars." />
          </div>
        )}
      </div>

      {/* Result */}
      <div className="mt-6 rounded-2xl border p-5" style={{ borderColor: `${tone}55`, background: `${tone}12` }}>
        <div className="flex items-start gap-4">
          <Bert pose="glasses" size={52} className="hidden shrink-0 sm:block" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: tone }}>
              Projected super at {retireAge} · today&apos;s dollars
            </div>
            <div className="mt-1 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{fmtCurrency(r.balance)}</div>
            <p className="mt-1 text-sm text-slate-200">{verdictText}</p>

            {/* Target bar */}
            <div className="mt-4">
              <div className="relative h-3 rounded-full bg-panel-2">
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${r.pct}%`, background: tone }} />
                {/* modest + comfortable ticks */}
                <div className="absolute inset-y-[-3px] w-0.5 bg-slate-400/70" style={{ left: `${r.modPct}%` }} title="Modest" />
                <div className="absolute inset-y-[-3px] w-0.5 bg-emerald-300" style={{ left: `${r.comfPct}%` }} title="Comfortable" />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted">
                <span>Modest {fmtCurrency(MODEST)}</span>
                <span className="text-emerald-300/90">Comfortable {fmtCurrency(COMFORTABLE)}</span>
              </div>
            </div>

            <p className="mt-3 text-[13px] italic leading-snug text-accent-soft">&ldquo;{bert}&rdquo;</p>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        General information only, not personal financial advice. A simplified reproduction of the thread&apos;s formula in today&apos;s
        dollars: super grows at the return you set, contributions are taxed {Math.round(SUPER_TAX * 100)}% going in and netted of the
        fee, and nothing extra is added. It stops at the <em>balance</em> — it doesn&apos;t model the Age Pension, tax in retirement, or
        how long the money lasts once you draw it down. The ASFA comfortable/modest figures are lump sums that already assume a part
        Age Pension and a paid-off home. For the full picture, run it through the planner.
      </p>
    </div>
  );
}
