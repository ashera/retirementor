"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { EngineConfig } from "@/lib/au/config";
import {
  DEFAULT_PLAN,
  deriveStages,
  type Household,
  type Person,
  type RetirementPlan,
} from "@/lib/au/types";
import { simulate } from "@/lib/au/simulate";
import { runMonteCarlo, MC_CONFIDENCE_TARGET } from "@/lib/au/montecarlo";
import { fmtCurrency } from "@/lib/au/format";
import { averageSuperForAge } from "@/lib/au/averageSuper";
import RetirementChart from "@/components/RetirementChart";
import { ageGapInfo } from "@/components/ageAxis";
import IncomeChart from "@/components/IncomeChart";
import FanChart from "@/components/FanChart";
import Field from "@/components/Field";
import Logo from "@/components/Logo";
import { track as trackEvent } from "@/lib/analytics";
import {
  AgePensionExplainer,
  LikelihoodExplainer,
  SuperAtRetirementExplainer,
} from "@/components/explainers";

const PHASES = 4;
const money = (n: number) => fmtCurrency(Math.round(n));

// Which phase a given step (panel) belongs to. 1=welcome, 2/3=Phase 1, 4=P2, 5=P3, 6=P4.
const phaseOf = (step: number) => (step <= 3 ? 1 : step - 2);

function Panel({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    // scroll-mt gives a small gap when a newly revealed step is scrolled to the top.
    <section id={id} className="reveal mt-4 scroll-mt-4 rounded-2xl border border-line bg-panel p-6 first:mt-0">
      {children}
    </section>
  );
}

function Toggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
            value === o.value
              ? "border-accent bg-accent/10 text-accent"
              : "border-line bg-panel-2 text-slate-200 hover:border-accent/50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function GuidedIntro({
  config,
  user,
  onExit,
}: {
  config: EngineConfig;
  user: { email: string; isAdmin: boolean } | null;
  onExit: (plan: RetirementPlan, completed: boolean) => void;
}) {
  const [step, setStep] = useState(1);

  // Phase 1 — about you & your super
  const [household, setHousehold] = useState<Household>("single");
  const [mode, setMode] = useState<"joint" | "individual">("individual"); // couple super
  const [age1, setAge1] = useState(45);
  const [age2, setAge2] = useState(45);
  const [oSuper1, setOSuper1] = useState<number | null>(null);
  const [oSuper2, setOSuper2] = useState<number | null>(null);
  const [oJoint, setOJoint] = useState<number | null>(null);
  // Phase 2 — growth. Salary starts blank (NaN) so the user must enter their real
  // income rather than us assuming a figure — it's the biggest lever on the
  // projection, so a wrong default would quietly mislead.
  const [sal1, setSal1] = useState<number>(NaN);
  const [sal2, setSal2] = useState<number>(NaN);
  const [oReturn, setOReturn] = useState<number | null>(null);
  const [oRetire, setORetire] = useState<number | null>(null);
  // Phase 3 — income
  const [oSpend, setOSpend] = useState<number | null>(null);
  const [staged, setStaged] = useState(false);
  const [homeowner, setHomeowner] = useState(true);
  const [outsideSuper, setOutsideSuper] = useState(0);
  // Phase 4 — reliability
  const [oVol, setOVol] = useState<number | null>(null);

  const couple = household === "couple";
  const avg1 = averageSuperForAge(age1);
  const avg2 = averageSuperForAge(age2);
  const super1 = oSuper1 ?? avg1;
  const super2 = oSuper2 ?? avg2;
  const joint = oJoint ?? avg1 + avg2;

  const totalSuper = !couple ? super1 : mode === "joint" ? joint : super1 + super2;
  const benchmark = couple ? avg1 + avg2 : avg1;

  const maxAge = couple ? Math.max(age1, age2) : age1;
  const retireAge = oRetire ?? Math.min(70, Math.max(65, maxAge + 1));
  const invReturn = oReturn ?? 7;
  const comfortable = couple ? config.asfa.comfortable.couple : config.asfa.comfortable.single;
  const targetSpending = oSpend ?? comfortable;
  const volatility = oVol ?? 11;

  // Every income figure needed for the projection must be entered before we
  // show a super-at-retirement number or let the walkthrough advance past growth.
  const salaryReady = Number.isFinite(sal1) && (!couple || Number.isFinite(sal2));

  const plan: RetirementPlan = useMemo(() => {
    const mk = (age: number, superBalance: number, salary: number): Person => ({
      currentAge: age,
      superBalance,
      salary,
      voluntaryConcessional: 0,
      voluntaryNonConcessional: 0,
    });
    let people: Person[];
    if (!couple) people = [mk(age1, super1, sal1)];
    else if (mode === "joint") people = [mk(age1, 0, sal1), mk(age2, 0, sal2)];
    else people = [mk(age1, super1, sal1), mk(age2, super2, sal2)];

    return {
      ...DEFAULT_PLAN,
      household,
      people,
      superMode: couple ? mode : "individual",
      jointSuperBalance: joint,
      jointSuperSplit: 50,
      homeowner,
      outsideSuper,
      annualOutsideSavings: 0,
      retirementAge: retireAge,
      spendingMode: staged ? "stages" : "flat",
      targetSpending,
      spendingStages: deriveStages(targetSpending),
      investmentReturn: invReturn,
      returnVolatility: volatility,
      inflation: 2.5,
      lifeExpectancy: 90,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couple, mode, age1, age2, super1, super2, joint, sal1, sal2, homeowner, outsideSuper, retireAge, staged, targetSpending, invReturn, volatility]);

  const result = useMemo(() => simulate(plan, config), [plan, config]);
  // The Monte Carlo is the heavy compute (~1,000 runs). Running it on every render made
  // the phase-2 sliders janky, since each drag re-derives `plan`. Debounce it: the cheap
  // deterministic `result` updates live (chart, super-at-retirement), while the MC
  // recomputes ~250ms after the user stops moving a slider, off the drag's critical path.
  const [mcPlan, setMcPlan] = useState(plan);
  useEffect(() => {
    const t = setTimeout(() => setMcPlan(plan), 250);
    return () => clearTimeout(t);
  }, [plan]);
  const mc = useMemo(() => runMonteCarlo(mcPlan, config), [mcPlan, config]);
  const successPct = Math.round(mc.successRate * 100);
  const lasts = result.lastsToLifeExpectancy;
  const tone = lasts ? "text-emerald-400" : "text-amber-400";
  // The reliability panel states a likelihood, so it's toned by the Monte Carlo
  // success (85% bar), not by whether the smooth-return line happens to survive.
  const mcTone =
    successPct >= Math.round(MC_CONFIDENCE_TARGET * 100)
      ? "text-emerald-400"
      : successPct >= 60
        ? "text-amber-400"
        : "text-red-400";

  // On-track vs the average balance for their age(s).
  const ratio = benchmark > 0 ? totalSuper / benchmark : 1;
  // A factual comparison to the age-based average — NOT an "on track"/adequacy verdict
  // (whether it's enough is deferred to the later phases). Neutral colour, no judgement.
  const track =
    ratio >= 1.1
      ? { head: "Above the average for your age", rel: "above", tone: "text-white" }
      : ratio >= 0.9
        ? { head: "Around the average for your age", rel: "about the same as", tone: "text-white" }
        : { head: "Below the average for your age", rel: "below", tone: "text-white" };

  // When a new step is revealed, put the TOP of its card at the top of the screen — so
  // users don't scroll past the fields at the top of the card (block: "end" did that).
  useEffect(() => {
    if (step > 1) document.getElementById(`guide-step-${step}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  // Funnel: which panel of the guided walkthrough a visitor reaches before leaving.
  useEffect(() => {
    trackEvent("Guide step", { step, phase: phaseOf(step) });
  }, [step]);

  const next = () => setStep((s) => s + 1);

  const Actions = ({
    label,
    onClick,
    disabled,
    disabledHint,
  }: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    disabledHint?: string;
  }) => (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      <span className="text-xs text-muted">
        {disabled && disabledHint
          ? disabledHint
          : step >= 2
            ? `Phase ${phaseOf(step)} of ${PHASES}`
            : "About a minute"}
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onExit(plan, false)}
          className="text-xs font-medium text-muted underline underline-offset-2 hover:text-slate-200"
        >
          Enter my details myself
        </button>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
            disabled
              ? "cursor-not-allowed bg-panel-2 text-muted"
              : "bg-accent text-ink hover:bg-accent-soft"
          }`}
        >
          {label}
        </button>
      </div>
    </div>
  );

  const superLabel = couple && mode === "individual" ? "Your super" : couple ? "Combined super" : "Your super balance";

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Logo />
        {!user && (
          <Link href="/login" className="text-sm font-medium text-slate-200 hover:text-white">
            Log in
          </Link>
        )}
      </div>

      {/* Welcome */}
      <Panel>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">
          Will your retirement savings last?
        </h1>
        <p className="mt-3 text-muted">
          We&apos;ll build the picture together in four short phases — plain
          English, no jargon, and you can change anything as you go.
        </p>
        {step === 1 && <Actions label="Let's begin →" onClick={next} />}
      </Panel>

      {/* Phase 1 — inputs */}
      {step >= 2 && (
        <Panel id="guide-step-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-accent">Phase 1 · About you</div>
          <h2 className="mt-1 text-lg font-bold text-white">You and your super</h2>
          <p className="mt-1 text-sm text-muted">
            Just the essentials to start. Balances are pre-filled with the average
            for each age — pop in your real figures.
          </p>
          <div className="mt-4 space-y-5">
            <div>
              <span className="text-sm font-medium text-slate-200">Are you planning as…</span>
              <div className="mt-2">
                <Toggle
                  value={household}
                  onChange={(h) => setHousehold(h)}
                  options={[{ value: "single", label: "Just me" }, { value: "couple", label: "A couple" }]}
                />
              </div>
            </div>

            <Field label={couple ? "Your age" : "How old are you?"} value={age1} onChange={(v) => setAge1(Math.round(v))} min={18} max={75} suffix="yrs" />
            {couple && <Field label="Partner's age" value={age2} onChange={(v) => setAge2(Math.round(v))} min={18} max={75} suffix="yrs" />}

            {couple && (
              <div>
                <span className="text-sm font-medium text-slate-200">Do you track super…</span>
                <div className="mt-2">
                  <Toggle
                    value={mode}
                    onChange={(m) => setMode(m)}
                    options={[{ value: "individual", label: "Separately" }, { value: "joint", label: "Together (joint)" }]}
                  />
                </div>
              </div>
            )}

            {(!couple || mode === "joint") && (
              <Field label={superLabel} value={couple ? joint : super1} onChange={(v) => (couple ? setOJoint(v) : setOSuper1(v))} min={0} max={5_000_000} step={5_000} prefix="$" />
            )}
            {couple && mode === "individual" && (
              <>
                <Field label="Your super" value={super1} onChange={(v) => setOSuper1(v)} min={0} max={5_000_000} step={5_000} prefix="$" />
                <Field label="Partner's super" value={super2} onChange={(v) => setOSuper2(v)} min={0} max={5_000_000} step={5_000} prefix="$" />
              </>
            )}
          </div>
          {step === 2 && <Actions label="Compare to the average →" onClick={next} />}
        </Panel>
      )}

      {/* Phase 1 — assertion */}
      {step >= 3 && (
        <Panel id="guide-step-3">
          <h2 className={`text-xl font-bold ${track.tone}`}>{track.head}</h2>
          <p className="mt-2 text-slate-200">
            For {couple ? "your ages" : "your age"}, the typical super balance is
            about <strong>{money(benchmark)}</strong>. {couple ? "Together you" : "You"} have{" "}
            <strong>{money(totalSuper)}</strong> — that&apos;s {track.rel} the average.
          </p>
          <p className="mt-3 rounded-xl border border-line bg-panel-2 px-4 py-3 text-sm text-muted">
            Averages only tell you where you stand today. Whether it&apos;s{" "}
            <em>enough</em> depends on how it grows and what you&apos;ll spend — that&apos;s
            what the next phases work out.
          </p>
          {step === 3 && <Actions label="Project my super forward →" onClick={next} />}
        </Panel>
      )}

      {/* Phase 2 — super at retirement */}
      {step >= 4 && (
        <Panel id="guide-step-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-accent">Phase 2 · Growth</div>
          <h2 className="mt-1 flex items-center gap-2 text-lg font-bold text-white">
            Your super at retirement
            <SuperAtRetirementExplainer plan={plan} config={config} result={result} />
          </h2>
          <p className="mt-1 text-sm text-muted">
            This projects your super forward. The big levers are your income (which
            drives contributions), your investment return, and when you retire —
            so start with your real salary below. Extra contributions and savings
            outside super come later, on your dashboard.
          </p>
          {/* Inputs first, chart/result BELOW — so entering income doesn't push the
              slider you're dragging down (a jarring jump on mobile). */}
          <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field
              label="Your income (excl. super)"
              value={sal1}
              onChange={setSal1}
              min={0}
              max={400_000}
              step={5_000}
              prefix="$"
              hint={`Your base salary — your employer adds ${(config.sgRate * 100).toFixed(0)}% on top as super.`}
            />
            {couple && (
              <Field label="Partner's income (excl. super)" value={sal2} onChange={setSal2} min={0} max={400_000} step={5_000} prefix="$" />
            )}
            <Field label="Investment return (before fees)" value={invReturn} onChange={(v) => setOReturn(v)} min={1} max={12} step={0.1} suffix="%" hint={`Before fees — super funds usually quote returns after fees. A balanced fund is ~7–9% before fees; we take the ${config.fees.adminInvestmentPct}% fee out (≈ ${+(invReturn - config.fees.adminInvestmentPct).toFixed(2)}% after).`} />
            <Field label="Retire at age" value={retireAge} onChange={(v) => setORetire(Math.round(v))} min={Math.min(maxAge + 1, 55)} max={75} suffix="yrs" />
          </div>
          {salaryReady ? (
            <>
              <div className="mt-4">
                <RetirementChart result={result} animate height={230} wageInflationPct={plan.inflation + (config.livingStandardsGrowthPct ?? 0)} cpiPct={plan.inflation} ages={ageGapInfo(plan)} />
              </div>
              <p className="mt-2 text-center text-sm">
                Projected super at retirement: <strong className="text-accent">{money(result.superAtRetirement)}</strong> at age {result.retirementAge}
              </p>
              <p className="text-center text-xs text-muted">
                in today&apos;s dollars — comparable to money now, not an inflated future figure
              </p>
            </>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-accent/40 bg-accent/[0.06] px-4 py-6 text-center text-sm text-muted">
              Enter your {couple ? "incomes" : "income"} above and we&apos;ll project your super forward.
            </div>
          )}
          {step === 4 && (
            <Actions
              label="Set my retirement income →"
              onClick={next}
              disabled={!salaryReady}
              disabledHint={couple ? "Enter both incomes to continue" : "Enter your income to continue"}
            />
          )}
        </Panel>
      )}

      {/* Phase 3 — retirement income */}
      {step >= 5 && (
        <Panel id="guide-step-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-accent">Phase 3 · Income</div>
          <h2 className="mt-1 flex items-center gap-2 text-lg font-bold text-white">
            Your retirement income
            <AgePensionExplainer plan={plan} config={config} result={result} />
          </h2>
          <p className="mt-1 text-sm text-muted">
            How much you&apos;d like to spend, and where it comes from. In retirement
            the government <strong className="text-slate-200">Age Pension</strong>{" "}
            tops up your own savings as they reduce (tap the ? to see how it works).
          </p>
          <div className="mt-4 space-y-4">
            <Field label="Yearly spending goal" value={targetSpending} onChange={(v) => setOSpend(v)} min={20_000} max={200_000} step={1_000} prefix="$" hint={`ASFA 'comfortable' for a ${couple ? "couple" : "single"} is about ${money(comfortable)}/yr.`} />
            <Field label="Savings outside super" value={outsideSuper} onChange={setOutsideSuper} min={0} max={3_000_000} step={5_000} prefix="$" hint="Bank, shares, offset — anything outside super you'd draw on. Leave at $0 if none." />
            <div>
              <span className="text-sm font-medium text-slate-200">Spend evenly, or more in the early years?</span>
              <div className="mt-2">
                <Toggle
                  value={staged ? "stages" : "flat"}
                  onChange={(v) => setStaged(v === "stages")}
                  options={[{ value: "flat", label: "The same each year" }, { value: "stages", label: "More early (go-go)" }]}
                />
              </div>
            </div>
            <div>
              <span className="text-sm font-medium text-slate-200">Do you own your home?</span>
              <div className="mt-2">
                <Toggle
                  value={homeowner ? "own" : "rent"}
                  onChange={(v) => setHomeowner(v === "own")}
                  options={[{ value: "own", label: "Yes" }, { value: "rent", label: "No / renting" }]}
                />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <IncomeChart result={result} animate height={190} ages={ageGapInfo(plan)} />
          </div>
          <p className={`mt-3 rounded-xl border border-line bg-panel-2 px-4 py-3 text-sm ${tone}`}>
            {lasts
              ? `On a steady, average return, your super, savings and the Age Pension keep you going to ${plan.lifeExpectancy} and beyond. Real returns rise and fall, though — we'll stress-test that next.`
              : `On a steady, average return, this stretches to about age ${result.depletedAge} before leaning fully on the Age Pension. A little less spending or a later retirement helps — and next we'll see how market ups and downs affect it.`}
          </p>
          {step === 5 && <Actions label="How reliable is this? →" onClick={next} />}
        </Panel>
      )}

      {/* Phase 4 — reliability */}
      {step >= 6 && (
        <Panel id="guide-step-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-accent">Phase 4 · Reliability</div>
          <h2 className="mt-1 flex items-center gap-2 text-lg font-bold text-white">
            How reliable is this?
            <LikelihoodExplainer plan={plan} mc={mc} />
          </h2>
          <p className="mt-1 text-sm text-muted">
            The picture so far assumed a steady return every year. Real markets go up
            and down, and a rough patch early in retirement hurts most — so we replay
            your plan through {mc.iterations.toLocaleString()} possible futures, good
            and bad.
          </p>
          <div className="mt-3">
            <FanChart fan={mc.fan} retirementAge={result.retirementAge} agePensionAge={result.agePensionAge} height={200} ages={ageGapInfo(plan)} />
          </div>
          <p className={`mt-2 text-center text-sm ${mcTone}`}>
            Your target is fully covered in about <strong>{successPct} of every 100</strong> of them.
          </p>
          <p className="mx-auto mt-2 max-w-md text-center text-xs text-muted">
            And you&apos;re not left with nothing in the rest: for those who qualify, the
            Age Pension may provide a partial income floor, so a &ldquo;miss&rdquo; can mean
            dropping below your target lifestyle for a while rather than running out of income.
          </p>
          <div className="mt-4 max-w-xs">
            <Field label="How bumpy are markets?" value={volatility} onChange={(v) => setOVol(v)} min={0} max={20} step={1} suffix="%" hint="Volatility. A diversified balanced/growth fund is roughly 9–13%." />
          </div>
          {!user && (
            <p className="mt-4 text-sm text-muted">
              <Link href="/signup" className="font-semibold text-accent hover:underline">
                Create a free account
              </Link>{" "}
              to save this and compare scenarios side by side.
            </p>
          )}
          <div className="mt-5 rounded-xl border border-line bg-panel-2 px-4 py-3 text-sm">
            <div className="font-semibold text-slate-100">This was the quick version — there&apos;s more you can add</div>
            <p className="mt-1 text-muted">
              We kept setup simple on purpose. Your dashboard models the full picture whenever
              you&apos;re ready: <span className="text-slate-200">extra super contributions</span> (salary
              sacrifice or after-tax), <span className="text-slate-200">savings &amp; investments outside
              super</span>, an <span className="text-slate-200">investment property</span> or{" "}
              <span className="text-slate-200">mortgage</span>, and the return/fee assumptions. Just tap{" "}
              <span className="text-slate-200">&ldquo;✎ Refine your scenario&rdquo;</span> on the dashboard any time.
            </p>
          </div>
          {step === 6 && <Actions label="Take me to the full dashboard →" onClick={() => onExit(plan, true)} />}
        </Panel>
      )}
    </main>
  );
}
