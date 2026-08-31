"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fmtCurrency } from "@/lib/au/format";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { residentIncomeTax, medicareLevy } from "@/lib/au/tax";

const CFG = DEFAULT_CONFIG;
const CAP = CFG.concessionalCap; // annual concessional cap (incl. employer SG)
const SG_RATE = CFG.sgRate;
const PRES_AGE = CFG.preservationAge; // TTR starts here (60)
const D293_THRESHOLD = CFG.div293Threshold;
const D293_RATE = CFG.div293ExtraTaxRate;
const CONTRIB_TAX = CFG.contributionsTax ?? 0.15;
const TTR_MAX_DRAW = 0.10; // a TTR pension can pay at most 10% of its balance a year

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
// Working-age take-home: gross salary less income tax (after LITO) and the Medicare levy.
// The SG is paid on top of salary, so it isn't part of take-home.
const takeHomeOf = (salary: number) =>
  Math.max(0, salary - residentIncomeTax(Math.max(0, salary)) - medicareLevy(Math.max(0, salary)));

const taxPlusMedicare = (salary: number) => residentIncomeTax(Math.max(0, salary)) + medicareLevy(Math.max(0, salary));
/** Income tax + Medicare saved by sacrificing S (earning S less). */
const taxDropOf = (salary: number, S: number) => taxPlusMedicare(salary) - taxPlusMedicare(salary - S);
/** Division 293: an extra 15% on concessional contributions once income-for-surcharge
 *  (salary + SG + sacrifice) tops the threshold, on the lesser of the contributions or
 *  the amount over the threshold. */
const div293Of = (salary: number, sg: number, S: number) => {
  const surchargeIncome = salary + sg + S;
  const taxedContrib = Math.max(0, Math.min(sg + S, surchargeIncome - D293_THRESHOLD));
  return D293_RATE * taxedContrib;
};

function Field({ label, value, min, max, step, onChange, prefix, suffix, hint }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void;
  prefix?: string; suffix?: string; hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-sm font-medium text-slate-200">{label}</label>
        <span className="text-sm font-bold tabular-nums text-white">
          {prefix}{value.toLocaleString()}{suffix}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className="mt-2 w-full accent-emerald-500" />
      {hint && <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

function Row({ label, sub, value, tone }: { label: string; sub?: string; value: string; tone?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 py-2 last:border-0">
      <div className="min-w-0">
        <div className="text-sm text-slate-200">{label}</div>
        {sub && <div className="text-[11px] text-muted">{sub}</div>}
      </div>
      <div className={`shrink-0 tabular-nums ${tone ?? "text-slate-100"}`}>{value}</div>
    </div>
  );
}

// A standalone TTR (transition-to-retirement) "sweet spot" finder for /learn. It finds the
// salary-sacrifice amount that maximises the tax arbitrage while keeping take-home whole,
// bounded by the concessional cap and the 10% TTR drawdown limit. 2026-vintage, general
// information only — not personal advice.
export default function TtrCalculator() {
  const [age, setAge] = useState(60);
  const [salary, setSalary] = useState(120_000);
  const [superBalance, setSuperBalance] = useState(400_000);
  const [retireAge, setRetireAge] = useState(65);

  const sg = salary * SG_RATE;
  const capRoom = Math.max(0, CAP - sg); // most you can sacrifice before the cap
  const drawLimit = TTR_MAX_DRAW * superBalance; // most the TTR pension can pay a year
  const currentTakeHome = takeHomeOf(salary);

  // The take-home the pension must replace at sacrifice S (what earning S less costs you
  // after tax), and the net wealth the swap adds (the tax saved) at S.
  const drawNeeded = (S: number) => Math.max(0, S - taxDropOf(salary, S));
  const savingAt = (S: number) => taxDropOf(salary, S) - CONTRIB_TAX * S - div293Of(salary, sg, S);

  // Sweet spot: the largest sacrifice that (a) stays within the cap, (b) can be replaced
  // within the 10% drawdown limit, (c) doesn't exceed salary. Saving rises with S (every
  // dollar above the tax-free threshold beats the 15% contributions tax), so the optimum
  // is the largest feasible S — found by binary search when the drawdown limit binds.
  const sweet = useMemo(() => {
    const ceiling = Math.min(capRoom, salary);
    if (ceiling <= 0) return { S: 0, bind: "none" as const };
    if (drawNeeded(ceiling) <= drawLimit) {
      return { S: ceiling, bind: (capRoom <= salary ? "cap" : "salary") as "cap" | "salary" };
    }
    let lo = 0, hi = ceiling;
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2;
      if (drawNeeded(mid) > drawLimit) hi = mid;
      else lo = mid;
    }
    return { S: lo, bind: "drawdown" as const };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salary, superBalance, capRoom, drawLimit]);

  const sweetS = Math.round(sweet.S / 100) * 100;
  const [sacrifice, setSacrifice] = useState(() => Math.round(sweet.S / 100) * 100);
  const S = clamp(sacrifice, 0, Math.max(0, Math.round(capRoom)));

  // Outcome at the chosen sacrifice.
  const draw = drawNeeded(S);
  const drawCapped = Math.min(draw, drawLimit);
  const takeHomeNow = takeHomeOf(salary - S) + drawCapped; // pension tops the reduced salary back up
  const takeHomeGap = Math.max(0, currentTakeHome - takeHomeNow); // shortfall once the 10% limit binds
  // The sacrifice still gets the 15%-vs-marginal arbitrage even past the sweet spot; what
  // changes past it is that the pension can't fully replace take-home (see takeHomeGap).
  const saving = savingAt(S);
  const netToSuper = CONTRIB_TAX >= 0 ? S * (1 - CONTRIB_TAX) - div293Of(salary, sg, S) - drawCapped : 0;
  const marginalPct = Math.round(((taxPlusMedicare(salary) - taxPlusMedicare(salary - 1000)) / 1000) * 100);
  const years = Math.max(0, retireAge - age);
  const cumulative = savingAt(sweetS) * years;
  const eligible = age >= PRES_AGE;

  const bindText =
    sweet.bind === "cap"
      ? `capped by the ${fmtCurrency(CAP)} concessional cap (your ${fmtCurrency(Math.round(sg))} SG + ${fmtCurrency(Math.round(capRoom))} sacrifice)`
      : sweet.bind === "drawdown"
        ? `limited by the 10% TTR drawdown on your ${fmtCurrency(superBalance)} balance (max ${fmtCurrency(Math.round(drawLimit))}/yr)`
        : sweet.bind === "salary"
          ? "limited by your salary"
          : "there's no beneficial sacrifice at these numbers";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ── Inputs ─────────────────────────────────────────────── */}
      <div className="space-y-5 rounded-2xl border border-line bg-panel p-5">
        <Field label="Your age" value={age} min={55} max={70} step={1} onChange={setAge} suffix=" yrs"
          hint={eligible ? "TTR is available from your preservation age (60)." : `TTR starts at preservation age ${PRES_AGE} — figures below show how it would work from then.`} />
        <Field label="Retire at age" value={retireAge} min={Math.max(age + 1, 60)} max={75} step={1} onChange={setRetireAge} suffix=" yrs"
          hint={`You'd run the strategy for about ${years} year${years === 1 ? "" : "s"}.`} />
        <Field label="Salary (before tax, excl. super)" value={salary} min={40_000} max={400_000} step={5_000} onChange={setSalary} prefix="$"
          hint={`Your employer adds ${Math.round(SG_RATE * 100)}% super (~${fmtCurrency(Math.round(sg))}/yr) on top.`} />
        <Field label="Super balance (your TTR pension source)" value={superBalance} min={50_000} max={3_000_000} step={10_000} onChange={setSuperBalance} prefix="$"
          hint="A TTR pension can pay 4–10% of this a year — a bigger balance lets you replace more take-home." />

        <div className="rounded-xl border border-line bg-panel-2 p-3 text-[11px] leading-snug text-muted">
          <p className="font-semibold uppercase tracking-wide text-slate-300">How the swap works</p>
          <p className="mt-1.5">
            Salary-sacrifice into super (taxed at {Math.round(CONTRIB_TAX * 100)}%, not your ~{marginalPct}% marginal rate),
            then draw the same amount you gave up from a TTR pension — tax-free from {PRES_AGE}. Your take-home is unchanged;
            the gap between your marginal rate and {Math.round(CONTRIB_TAX * 100)}% becomes extra super.
          </p>
        </div>
      </div>

      {/* ── Results ────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-accent/30 bg-accent/[0.06] p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Your TTR sweet spot</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-bold tabular-nums text-white">{fmtCurrency(sweetS)}</span>
            <span className="text-sm text-muted">salary sacrifice / year</span>
          </div>
          <div className="mt-1 text-sm text-slate-300">
            Saves <span className="font-semibold tabular-nums text-accent">{fmtCurrency(Math.round(savingAt(sweetS)))}/yr</span> in
            tax for the <span className="text-white">same take-home</span> — about{" "}
            <span className="font-semibold tabular-nums text-white">{fmtCurrency(Math.round(cumulative))}</span> over {years} year{years === 1 ? "" : "s"} to {retireAge}.
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted">It&apos;s {bindText}.</p>
          {sweetS !== S && (
            <button
              type="button"
              onClick={() => setSacrifice(sweetS)}
              className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-ink transition hover:brightness-110"
            >
              Set the slider to the sweet spot →
            </button>
          )}
        </div>

        {/* Explore */}
        <div className="rounded-2xl border border-line bg-panel p-5">
          <Field label="Explore: salary sacrifice" value={S} min={0} max={Math.max(500, Math.round(capRoom))} step={500} onChange={setSacrifice} prefix="$"
            hint={
              takeHomeGap > 0
                ? `Past the sweet spot: the 10% TTR limit can't replace all the take-home, so you're ${fmtCurrency(Math.round(takeHomeGap))}/yr worse off.`
                : "Take-home is fully replaced by the tax-free TTR pension at this level."
            } />
          <div className="mt-3">
            <Row label="Tax saved (extra to super)" sub={`${marginalPct}% marginal − ${Math.round(CONTRIB_TAX * 100)}% contributions tax${div293Of(salary, sg, S) > 0 ? " − Div 293" : ""}`} value={`${fmtCurrency(Math.round(saving))}/yr`} tone="text-accent" />
            <Row label="Take-home pay" sub={takeHomeGap > 0 ? "reduced — TTR drawdown maxed out" : "unchanged"} value={`${fmtCurrency(Math.round(takeHomeNow))}/yr`} tone={takeHomeGap > 0 ? "text-amber-400" : "text-slate-100"} />
            <Row label="TTR pension drawn (tax-free)" sub={`limit ${fmtCurrency(Math.round(drawLimit))}/yr (10% of super)`} value={`${fmtCurrency(Math.round(drawCapped))}/yr`} />
            <Row label="Into super after 15% tax" value={`${fmtCurrency(Math.round(S * (1 - CONTRIB_TAX) - div293Of(salary, sg, S)))}/yr`} />
            <Row label="Net added to super" sub="contribution in − pension drawn out" value={`${fmtCurrency(Math.round(netToSuper))}/yr`} tone={netToSuper >= 0 ? "text-slate-100" : "text-amber-400"} />
          </div>
        </div>

        {!eligible && (
          <p className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-[11px] leading-snug text-amber-200/90">
            You&apos;re {age}. A TTR pension can only start from your preservation age ({PRES_AGE}) — these figures show what it
            would look like once you&apos;re eligible.
          </p>
        )}

        <p className="text-[11px] leading-relaxed text-muted">
          General information only, a 2026-vintage estimate in today&apos;s dollars — not personal financial advice. Since 2017
          a TTR pension&apos;s earnings are taxed at 15% (like accumulation), so the benefit is the contributions-tax arbitrage
          shown here, not an earnings-tax break. Bring it into your full plan with the{" "}
          <Link href="/what-if" className="text-accent hover:underline">Transition-to-Retirement lever</Link>.
        </p>
      </div>
    </div>
  );
}
