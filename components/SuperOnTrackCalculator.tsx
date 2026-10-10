"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtCurrency } from "@/lib/au/format";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import Bert from "@/components/Bert";

// "Is your super on track for your age?" — the recurring r/AusFinance question.
// Two answers: (1) how your balance compares to the APPROXIMATE MEDIAN for your age
// (the emotional "am I above average?" question), and (2) whether your current balance
// + future employer super projects to an ASFA-comfortable retirement at 67 (the real
// "am I on track?" question). Self-contained (no engine) — the planner does the rest.

const RETIRE_AGE = 67; // the standard target (Age Pension age)
const SUPER_TAX = 0.15;
const COMF = DEFAULT_CONFIG.asfa.lumpSum.comfortable.single; // $630k
const MOD = DEFAULT_CONFIG.asfa.lumpSum.modest.single; // $110k

// Approximate MEDIAN super by age, anchored at our published band centres
// (25–34 ~$25k, 35–44 ~$55k, 45–54 ~$95k, 55–64 ~$160k; ATO/APRA, rounded), linearly
// interpolated and extrapolated at the ends. Medians, not averages — averages run
// much higher because a minority of very large balances drag them up.
const MEDIAN_ANCHORS: [number, number][] = [
  [29.5, 25_000],
  [39.5, 55_000],
  [49.5, 95_000],
  [59.5, 160_000],
];
function medianForAge(age: number): number {
  const a = MEDIAN_ANCHORS;
  const seg = (x0: number, y0: number, x1: number, y1: number) => y0 + ((age - x0) / (x1 - x0)) * (y1 - y0);
  let v: number;
  if (age <= a[0][0]) v = seg(a[0][0], a[0][1], a[1][0], a[1][1]);
  else if (age >= a[a.length - 1][0]) v = seg(a[a.length - 2][0], a[a.length - 2][1], a[a.length - 1][0], a[a.length - 1][1]);
  else {
    let i = 0;
    while (i < a.length - 1 && age > a[i + 1][0]) i++;
    v = seg(a[i][0], a[i][1], a[i + 1][0], a[i + 1][1]);
  }
  return Math.max(2_000, Math.round(v / 1_000) * 1_000);
}

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

export default function SuperOnTrackCalculator() {
  const [age, setAge] = useState(38);
  const [superNow, setSuperNow] = useState(90_000);
  const [income, setIncome] = useState(90_500);
  const [sg, setSg] = useState(12);
  const [growth, setGrowth] = useState(6.4);
  const [fee, setFee] = useState(1);
  const [incomeGrowth, setIncomeGrowth] = useState(2.6);
  const [inflation, setInflation] = useState(2.5);
  const [showAssumptions, setShowAssumptions] = useState(false);

  // Prefill from the URL (?age=&super=&income=) — used by the Reddit-outreach links so
  // the calculator opens already set to the numbers from the post being answered.
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const inRange = (k: string, lo: number, hi: number) => {
        const v = Number(p.get(k));
        return p.has(k) && Number.isFinite(v) && v >= lo && v <= hi ? v : null;
      };
      const a = inRange("age", 18, 66);
      if (a != null) setAge(a);
      const s = inRange("super", 0, 5_000_000);
      if (s != null) setSuperNow(Math.min(1_200_000, Math.round(s)));
      const inc = inRange("income", 1_000, 1_000_000);
      if (inc != null) setIncome(Math.min(300_000, Math.round(inc)));
    } catch {
      /* no URL / blocked — just use defaults */
    }
  }, []);

  const r = useMemo(() => {
    const median = medianForAge(age);
    const vsMedian = superNow - median;
    const multiple = median > 0 ? superNow / median : 0;

    const n = Math.max(0, RETIRE_AGE - age);
    const rate = growth / 100, g = incomeGrowth / 100, inf = inflation / 100;
    const c = income * (sg / 100) * (1 - SUPER_TAX) * (1 - fee / 100);
    const grow = (base: number) => base * Math.pow(1 + rate, n);
    const growingFv = Math.abs(rate - g) < 1e-9
      ? c * n * Math.pow(1 + rate, Math.max(0, n - 1))
      : (c * (Math.pow(1 + rate, n) - Math.pow(1 + g, n))) / (rate - g);
    const projected = Math.max(0, Math.round((growingFv + grow(superNow)) / Math.pow(1 + inf, n)));

    // Balance you'd want NOW to be on track for COMF at 67, given the same contributions.
    const onTrackNow = Math.max(0, Math.round((COMF * Math.pow(1 + inf, n) - growingFv) / Math.pow(1 + rate, n)));

    // Catch-up: extra annual contribution (gross, before 15% tax) to close any gap, as a
    // flat real annuity at the real return. Indicative.
    const rr = (1 + rate) / (1 + inf) - 1;
    const realAF = Math.abs(rr) < 1e-9 ? n : (Math.pow(1 + rr, n) - 1) / rr;
    const gap = Math.max(0, COMF - projected);
    const catchUpGross = gap > 0 && realAF > 0 ? Math.round(gap / realAF / (1 - SUPER_TAX) / 100) * 100 : 0;

    const verdict = projected >= COMF ? "on track" : projected >= MOD ? "modest" : "behind";
    return { median, vsMedian, multiple, n, projected, onTrackNow, catchUpGross, verdict };
  }, [age, superNow, income, sg, growth, fee, incomeGrowth, inflation]);

  const ahead = r.vsMedian >= 0;
  const peerTone = ahead ? "#34d399" : "#f59e0b";
  const vTone = r.verdict === "on track" ? "#34d399" : r.verdict === "modest" ? "#f59e0b" : "#f87171";
  const bert = ahead
    ? "Ahead of the typical balance for your age — nice. Now check whether the path gets you all the way to a comfortable retirement."
    : "Below the typical balance — but 'typical' is low, and there's plenty of runway. See what a bit extra does.";
  // Bar: position your balance and the median within [0, max(super, median, onTrack)×1.15].
  const barMax = Math.max(r.median, superNow, r.onTrackNow, 1) * 1.15;

  return (
    <div className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
      <div className="grid gap-5 sm:grid-cols-3">
        <Row label="Your age" value={age} min={18} max={66} step={1} onChange={setAge} display={`${age}`} />
        <Row label="Super balance now" value={superNow} min={0} max={1_200_000} step={1_000} onChange={setSuperNow} display={fmtCurrency(superNow)} />
        <Row label="Gross income" value={income} min={20_000} max={300_000} step={500} onChange={setIncome} display={`${fmtCurrency(income)}/yr`} />
      </div>

      <div className="mt-4">
        <button type="button" onClick={() => setShowAssumptions((v) => !v)} className="text-xs font-medium text-muted transition hover:text-white">
          {showAssumptions ? "▾" : "▸"} Assumptions ({sg}% super · {growth}% return · {fee}% fee · {incomeGrowth}% pay growth · {inflation}% inflation · retire {RETIRE_AGE})
        </button>
        {showAssumptions && (
          <div className="mt-3 grid gap-5 rounded-xl border border-line bg-panel-2/50 p-4 sm:grid-cols-2">
            <Row label="Super guarantee" value={sg} min={9} max={15} step={0.5} onChange={setSg} display={`${sg}%`} />
            <Row label="Super return (p.a.)" value={growth} min={3} max={9} step={0.1} onChange={setGrowth} display={`${growth}%`} />
            <Row label="Super fee (p.a.)" value={fee} min={0} max={2} step={0.1} onChange={setFee} display={`${fee}%`} />
            <Row label="Pay growth (p.a.)" value={incomeGrowth} min={0} max={5} step={0.1} onChange={setIncomeGrowth} display={`${incomeGrowth}%`} />
            <Row label="Inflation (p.a.)" value={inflation} min={1} max={5} step={0.1} onChange={setInflation} display={`${inflation}%`} hint="Projection shown in today's dollars." />
          </div>
        )}
      </div>

      {/* Peer benchmark */}
      <div className="mt-6 rounded-2xl border p-5" style={{ borderColor: `${peerTone}55`, background: `${peerTone}12` }}>
        <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: peerTone }}>vs the typical balance for age {age}</div>
        <p className="mt-1 text-xl font-bold text-white sm:text-2xl">
          You&apos;re {ahead ? "ahead of" : "behind"} the median by {fmtCurrency(Math.abs(r.vsMedian))}
        </p>
        <p className="mt-0.5 text-sm text-slate-200">
          Approximate median super at {age} is <span className="font-semibold text-white">{fmtCurrency(r.median)}</span>
          {r.multiple > 0 && <> — you&apos;re at about <span className="font-semibold text-white">{r.multiple.toFixed(1)}×</span> that.</>}
        </p>
        <div className="mt-4">
          <div className="relative h-3 rounded-full bg-panel-2">
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (superNow / barMax) * 100)}%`, background: peerTone }} />
            <div className="absolute inset-y-[-3px] w-0.5 bg-slate-300" style={{ left: `${Math.min(100, (r.median / barMax) * 100)}%` }} title="Median for your age" />
          </div>
          <div className="mt-1 text-[10px] text-muted">▏ marks the median for your age</div>
        </div>
      </div>

      {/* On track for comfortable? */}
      <div className="mt-4 rounded-2xl border p-5" style={{ borderColor: `${vTone}55`, background: `${vTone}12` }}>
        <div className="flex items-start gap-4">
          <Bert pose="glasses" size={48} className="hidden shrink-0 sm:block" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: vTone }}>On this path, at {RETIRE_AGE} · today&apos;s dollars</div>
            <div className="mt-1 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{fmtCurrency(r.projected)}</div>
            <p className="mt-1 text-sm text-slate-200">
              {r.verdict === "on track"
                ? <>That clears the ASFA <strong className="text-white">comfortable</strong> target of {fmtCurrency(COMF)} — you&apos;re <strong className="text-white">on track</strong>.</>
                : r.verdict === "modest"
                  ? <>Short of {fmtCurrency(COMF)} comfortable, but above {fmtCurrency(MOD)} modest — the Age Pension tops it up.</>
                  : <>Below the {fmtCurrency(MOD)} modest mark — the Age Pension would do the heavy lifting.</>}
            </p>
            <p className="mt-2 text-sm text-slate-300">
              {r.onTrackNow > 0 ? (
                <>
                  To be <em>on track</em> for comfortable, you&apos;d want about <span className="font-semibold text-white">{fmtCurrency(r.onTrackNow)}</span> by now.
                  {r.catchUpGross > 0 && <> You&apos;re behind — roughly <span className="font-semibold text-amber-200">{fmtCurrency(r.catchUpGross)}/yr extra</span> into super (before tax) would close the gap.</>}
                </>
              ) : (
                <>With this income, your future employer super <em>alone</em> is projected to reach comfortable — you don&apos;t need any balance behind you yet, so whatever you&apos;ve already got is a head start.</>
              )}
            </p>
            <p className="mt-3 text-[13px] italic leading-snug text-accent-soft">&ldquo;{bert}&rdquo;</p>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        General information only, not personal financial advice. The median figures are approximate (ATO/APRA, rounded) and vary a lot
        by income and gender; the projection is a simplified estimate in today&apos;s dollars (employer super only, taxed {Math.round(SUPER_TAX * 100)}%
        going in, netted of the fee, growing at the return you set — nothing extra added). It stops at the balance and doesn&apos;t model the
        Age Pension, tax in retirement, or how long the money lasts. For the full picture, run it through the planner.
      </p>
    </div>
  );
}
