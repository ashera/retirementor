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
  // Start the explore slider at $0 so the cap meter opens with the full room showing and
  // counts down as you drag sacrifice up; the sweet-spot card offers a one-tap snap.
  const [sacrifice, setSacrifice] = useState(0);
  const S = clamp(sacrifice, 0, Math.max(0, Math.round(capRoom)));

  // Concessional-cap meter: the cap is filled by the employer SG plus your salary
  // sacrifice; "remaining" counts down to zero as the sacrifice slider rises.
  const capRemaining = Math.max(0, CAP - sg - S);
  const sgPct = clamp((sg / CAP) * 100, 0, 100);
  const sacPct = clamp((S / CAP) * 100, 0, 100);

  // Take-home shortfall at the explore slider — drives the Step 2 hint. Take-home is fully
  // replaced up to the sweet spot; past it the 10% drawdown limit leaves a gap.
  const drawCapped = Math.min(drawNeeded(S), drawLimit);
  const takeHomeGap = Math.max(0, currentTakeHome - (takeHomeOf(salary - S) + drawCapped));
  const marginalPct = Math.round(((taxPlusMedicare(salary) - taxPlusMedicare(salary - 1000)) / 1000) * 100);
  const years = Math.max(0, retireAge - age);
  const cumulative = savingAt(sweetS) * years;
  const eligible = age >= PRES_AGE;

  // The breakdown shown on the sweet-spot card is computed at the sweet spot itself (not
  // the explore slider), so it always shows the recommended outcome. By construction the
  // sweet spot keeps take-home whole (its draw stays within the 10% limit).
  const sweetDraw = Math.min(drawNeeded(sweetS), drawLimit);
  const sweetSaving = savingAt(sweetS);
  const sweetIntoSuper = sweetS * (1 - CONTRIB_TAX) - div293Of(salary, sg, sweetS);
  const sweetNetSuper = sweetIntoSuper - sweetDraw;
  const sweetTakeHome = takeHomeOf(salary - sweetS) + sweetDraw;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ── Step 1 · your details ──────────────────────────────── */}
      <div className="space-y-5 rounded-2xl border border-line bg-panel p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-accent">Step 1 · Your details</div>
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

      <div className="space-y-4">
        {/* ── Step 2 · your concessional room ──────────────────── */}
        <div className="rounded-2xl border border-line bg-panel p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-accent">Step 2 · Your concessional room</div>
          <p className="mt-1 text-[11px] leading-snug text-muted">
            Your concessional cap is shared by the employer SG and any salary sacrifice. Slide to see how much of it you&apos;d use.
          </p>
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-slate-200">Concessional cap remaining</span>
              <span className={`text-sm font-bold tabular-nums ${capRemaining <= 0.5 ? "text-amber-400" : "text-white"}`}>
                {fmtCurrency(Math.round(capRemaining))}
              </span>
            </div>
            <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-panel-2">
              <div className="h-full bg-slate-500" style={{ width: `${sgPct}%` }} />
              <div className="h-full bg-accent transition-[width] duration-150" style={{ width: `${sacPct}%` }} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
              <span className="flex items-center gap-1"><span aria-hidden className="inline-block h-2 w-2 rounded-full bg-slate-500" /> Employer SG {fmtCurrency(Math.round(sg))}</span>
              <span className="flex items-center gap-1"><span aria-hidden className="inline-block h-2 w-2 rounded-full bg-accent" /> Salary sacrifice {fmtCurrency(Math.round(S))}</span>
              <span className="ml-auto">of {fmtCurrency(CAP)} cap</span>
            </div>
          </div>
          {/* $100 step so the slider can land exactly on the sweet spot (cap − SG is always
              a multiple of $100), instead of stopping $100 short on a coarser step. */}
          <div className="mt-4">
            <Field label="Salary sacrifice" value={S} min={0} max={Math.max(100, Math.round(capRoom))} step={100} onChange={setSacrifice} prefix="$"
              hint={
                takeHomeGap > 0
                  ? `Past the sweet spot: the 10% TTR limit can't replace all the take-home, so you'd be ${fmtCurrency(Math.round(takeHomeGap))}/yr worse off.`
                  : "At this level the tax-free TTR pension fully replaces the take-home you sacrifice."
              } />
          </div>
        </div>

        {/* ── Step 3 · your sweet spot ─────────────────────────── */}
        <div className="rounded-2xl border border-accent/30 bg-accent/[0.06] p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-accent">Step 3 · Your TTR sweet spot</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-bold tabular-nums text-white">{fmtCurrency(sweetS)}</span>
            <span className="text-sm text-muted">salary sacrifice / year</span>
          </div>
          <div className="mt-1 text-sm text-slate-300">
            Saves <span className="font-semibold tabular-nums text-accent">{fmtCurrency(Math.round(sweetSaving))}/yr</span> in
            tax for the <span className="text-white">same take-home</span> — about{" "}
            <span className="font-semibold tabular-nums text-white">{fmtCurrency(Math.round(cumulative))}</span> over {years} year{years === 1 ? "" : "s"} to {retireAge}.
          </div>
          {sweetS !== S && (
            <button
              type="button"
              onClick={() => setSacrifice(sweetS)}
              className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-ink transition hover:brightness-110"
            >
              Set the slider to the sweet spot →
            </button>
          )}
          <div className="mt-4 border-t border-accent/20 pt-1">
            <Row label="Tax saved (extra to super)" sub={`${marginalPct}% marginal − ${Math.round(CONTRIB_TAX * 100)}% contributions tax${div293Of(salary, sg, sweetS) > 0 ? " − Div 293" : ""}`} value={`${fmtCurrency(Math.round(sweetSaving))}/yr`} tone="text-accent" />
            <Row label="Take-home pay" sub="unchanged — the whole point" value={`${fmtCurrency(Math.round(sweetTakeHome))}/yr`} />
            <Row label="TTR pension drawn (tax-free)" sub={`within the 10% limit (${fmtCurrency(Math.round(drawLimit))}/yr)`} value={`${fmtCurrency(Math.round(sweetDraw))}/yr`} />
            <Row label="Into super after 15% tax" value={`${fmtCurrency(Math.round(sweetIntoSuper))}/yr`} />
            <Row label="Net added to super" sub="contribution in − pension drawn out" value={`${fmtCurrency(Math.round(sweetNetSuper))}/yr`} />
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
