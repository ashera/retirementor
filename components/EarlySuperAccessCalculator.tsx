"use client";

import { useMemo, useState } from "react";
import { fmtCurrency } from "@/lib/au/format";
import Bert from "@/components/Bert";

// A self-contained "what does taking super out early really cost?" calculator.
// Everything is shown in TODAY'S dollars (the headline) so the number is
// comparable to money now — a dollar out today is worth far more at retirement
// because of decades of compounding. Illustrative, general information only.
const FEE = 0.85; // % p.a. — the app's default super fee, netted off the return

function Row({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
  hint?: string;
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

export default function EarlySuperAccessCalculator() {
  const [mode, setMode] = useState<"oneoff" | "yearly">("yearly");
  const [oneoff, setOneoff] = useState(20_000);
  const [perYear, setPerYear] = useState(2_300);
  const [years, setYears] = useState(3);
  const [age, setAge] = useState(30);
  const [retireAge, setRetireAge] = useState(67);
  const [ret, setRet] = useState(7); // nominal super return, before fees
  const [infl, setInfl] = useState(2.5);
  const [showAssumptions, setShowAssumptions] = useState(false);

  const r = useMemo(() => {
    const yrs = Math.max(0, retireAge - age);
    const nomNet = Math.max(0, (ret - FEE) / 100);
    const real = (1 + nomNet) / (1 + infl / 100) - 1;
    const grow = (amt: number, n: number, rate: number) => amt * Math.pow(1 + rate, n);
    let totalOut = 0;
    let costReal = 0;
    let costNom = 0;
    if (mode === "oneoff") {
      totalOut = oneoff;
      costReal = grow(oneoff, yrs, real);
      costNom = grow(oneoff, yrs, nomNet);
    } else {
      const n = Math.max(1, Math.min(years, yrs || 1)); // don't divert past retirement
      for (let k = 0; k < n; k++) {
        totalOut += perYear;
        costReal += grow(perYear, yrs - k, real);
        costNom += grow(perYear, yrs - k, nomNet);
      }
    }
    const lost = Math.max(0, costReal - totalOut);
    const multiple = totalOut > 0 ? costReal / totalOut : 0;
    const incomePerYr = costReal * 0.05; // ~5% drawdown — illustrative income equivalent
    return { yrs, real, totalOut, costReal, costNom, lost, multiple, incomePerYr, retireYear: new Date().getFullYear() + yrs };
  }, [mode, oneoff, perYear, years, age, retireAge, ret, infl]);

  const usePreset = () => {
    setMode("yearly");
    setPerYear(2_300);
    setYears(3);
    setAge(30);
    setRetireAge(67);
    setRet(7);
    setInfl(2.5);
  };

  const bert =
    r.yrs <= 0
      ? "You're at retirement already — there's no lost growth, but the money's still gone from your nest egg."
      : r.multiple >= 3
        ? "See the gap? A dollar taken out today is a few dollars gone by retirement — that's compounding you can't get back."
        : "Even a modest amount out now grows into a lot more you'd have had later. Worth knowing before you decide.";

  return (
    <div className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
      {/* Mode */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line bg-panel-2 p-1 text-sm">
          {(["yearly", "oneoff"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 font-medium transition ${
                mode === m ? "bg-accent text-ink" : "text-muted hover:text-white"
              }`}
            >
              {m === "yearly" ? "A bit each year" : "A one-off amount"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={usePreset}
          className="ml-auto rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/20"
          title="Divert ~$2,300/yr for 3 years from age 30 — the One Nation proposal's own example"
        >
          ✨ Try the One Nation example
        </button>
      </div>

      {/* Inputs */}
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {mode === "oneoff" ? (
          <Row label="Amount taken out now" value={oneoff} min={1_000} max={100_000} step={1_000} onChange={setOneoff} display={fmtCurrency(oneoff)} />
        ) : (
          <>
            <Row label="Taken out each year" value={perYear} min={500} max={15_000} step={100} onChange={setPerYear} display={`${fmtCurrency(perYear)}/yr`} />
            <Row label="For how many years" value={years} min={1} max={10} step={1} onChange={setYears} display={`${years} yr${years === 1 ? "" : "s"}`} />
          </>
        )}
        <Row label="Your age now" value={age} min={18} max={66} step={1} onChange={setAge} display={`${age}`} />
        <Row label="Retirement age" value={retireAge} min={Math.max(age + 1, 55)} max={75} step={1} onChange={setRetireAge} display={`${retireAge}`} />
      </div>

      {/* Assumptions (folded) */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowAssumptions((v) => !v)}
          className="text-xs font-medium text-muted transition hover:text-white"
        >
          {showAssumptions ? "▾" : "▸"} Assumptions ({ret}% return · {infl}% inflation)
        </button>
        {showAssumptions && (
          <div className="mt-3 grid gap-5 rounded-xl border border-line bg-panel-2/50 p-4 sm:grid-cols-2">
            <Row label="Super return (before fees)" value={ret} min={3} max={10} step={0.5} onChange={setRet} display={`${ret}% p.a.`} hint={`A ${FEE}% fee is netted off.`} />
            <Row label="Inflation" value={infl} min={1} max={5} step={0.5} onChange={setInfl} display={`${infl}% p.a.`} hint="Used to show the cost in today's dollars." />
          </div>
        )}
      </div>

      {/* Result */}
      <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-5">
        <div className="flex items-start gap-4">
          <Bert pose="glasses" size={52} className="hidden shrink-0 sm:block" />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">The real cost, in today&apos;s dollars</div>
            <div className="mt-1 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              −{fmtCurrency(Math.round(r.costReal))}
            </div>
            <p className="mt-1 text-sm text-slate-200">
              less in your super at {retireAge}, from taking out <span className="font-semibold text-white">{fmtCurrency(r.totalOut)}</span> now.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              That&apos;s about <span className="font-semibold text-amber-200">{r.multiple.toFixed(1)}×</span> what you took out —{" "}
              <span className="font-semibold text-amber-200">{fmtCurrency(Math.round(r.lost))}</span> of it is compound growth you&apos;d have earned.
              {r.incomePerYr > 500 && <> At a ~5% drawdown, roughly <span className="font-semibold text-amber-200">{fmtCurrency(Math.round(r.incomePerYr))}/yr</span> less retirement income.</>}
            </p>
            <p className="mt-2 text-xs text-muted">≈ {fmtCurrency(Math.round(r.costNom))} in the actual (inflated) dollars of {r.retireYear}.</p>
            <p className="mt-3 text-[13px] italic leading-snug text-accent-soft">“{bert}”</p>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        General information only, not personal financial advice. A simplified estimate in today&apos;s dollars: your super grows at
        the return you set, net of a {FEE}% fee, and is deflated by inflation; super earnings tax and your personal circumstances
        aren&apos;t modelled, so the true cost may differ. Early access to super is only allowed on specific grounds — see below.
      </p>
    </div>
  );
}
