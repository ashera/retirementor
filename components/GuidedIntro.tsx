"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { EngineConfig } from "@/lib/au/config";
import {
  DEFAULT_PLAN,
  deriveStages,
  type Household,
  type RetirementPlan,
} from "@/lib/au/types";
import { simulate } from "@/lib/au/simulate";
import { runMonteCarlo } from "@/lib/au/montecarlo";
import { fmtCurrency } from "@/lib/au/format";
import { averageSuperForAge } from "@/lib/au/averageSuper";
import RetirementChart from "@/components/RetirementChart";
import IncomeChart from "@/components/IncomeChart";
import FanChart from "@/components/FanChart";
import Field from "@/components/Field";
import Logo from "@/components/Logo";

const CONTENT_STEPS = 6; // steps after the welcome

const money = (n: number) => fmtCurrency(Math.round(n));

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="reveal mt-4 rounded-2xl border border-line bg-panel p-6 first:mt-0">
      {children}
    </section>
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
  const [step, setStep] = useState(1); // 1 = welcome, 2..7 = content
  const [age, setAge] = useState(45);
  const [household, setHousehold] = useState<Household>("single");

  // Refine overrides — null means "use the smart default".
  const [oSuper, setOSuper] = useState<number | null>(null);
  const [oSpend, setOSpend] = useState<number | null>(null);
  const [oRetire, setORetire] = useState<number | null>(null);
  const [oReturn, setOReturn] = useState<number | null>(null);

  const avgSuper = averageSuperForAge(age);
  const superBalance = oSuper ?? avgSuper;
  const comfortable = household === "couple" ? config.asfa.comfortable.couple : config.asfa.comfortable.single;
  const targetSpending = oSpend ?? comfortable;
  const defaultRetire = Math.min(70, Math.max(65, age + 1));
  const retireAge = oRetire ?? defaultRetire;
  const invReturn = oReturn ?? 7;

  const plan: RetirementPlan = useMemo(() => {
    const person = {
      currentAge: age,
      superBalance,
      salary: 90_000,
      voluntaryConcessional: 0,
      voluntaryNonConcessional: 0,
    };
    return {
      ...DEFAULT_PLAN,
      household,
      people: household === "couple" ? [person, { ...person }] : [person],
      superMode: "individual",
      homeowner: true,
      outsideSuper: 50_000,
      annualOutsideSavings: 5_000,
      retirementAge: retireAge,
      spendingMode: "flat",
      targetSpending,
      spendingStages: deriveStages(targetSpending),
      investmentReturn: invReturn,
      inflation: 2.5,
      lifeExpectancy: 90,
    };
  }, [age, household, superBalance, targetSpending, retireAge, invReturn]);

  const result = useMemo(() => simulate(plan, config), [plan, config]);
  const mc = useMemo(() => runMonteCarlo(plan, config), [plan, config]);
  const successPct = Math.round(mc.successRate * 100);
  const lasts = result.lastsToLifeExpectancy;
  const tone = lasts ? "text-emerald-400" : "text-amber-400";

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (step > 1) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [step]);

  const next = () => setStep((s) => s + 1);

  // Bottom action row: progress + continue + skip. Shown under the latest panel.
  const Actions = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      <span className="text-xs text-muted">
        {step >= 2 ? `Step ${step - 1} of ${CONTENT_STEPS}` : "About a minute"}
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onExit(plan, false)}
          className="text-xs font-medium text-muted underline underline-offset-2 hover:text-slate-200"
        >
          Skip to full dashboard
        </button>
        <button
          type="button"
          onClick={onClick}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft"
        >
          {label}
        </button>
      </div>
    </div>
  );

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      {/* Top bar */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <Logo />
        <div className="flex items-center gap-4 text-sm">
          {!user && (
            <Link href="/login" className="font-medium text-slate-200 hover:text-white">
              Log in
            </Link>
          )}
        </div>
      </div>

      {/* Step 1 — Welcome */}
      <Panel>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">
          Will your retirement savings last?
        </h1>
        <p className="mt-3 text-muted">
          Answer a couple of quick questions and we&apos;ll show you — in plain
          English, one step at a time. No jargon, and you can change anything as
          you go.
        </p>
        {step === 1 && <Actions label="Let's find out →" onClick={next} />}
      </Panel>

      {/* Step 2 — About you */}
      {step >= 2 && (
        <Panel>
          <h2 className="text-lg font-bold text-white">First, a little about you</h2>
          <p className="mt-1 text-sm text-muted">
            We&apos;ll start with sensible averages for everything else — you can
            adjust it all in a moment.
          </p>
          <div className="mt-4 space-y-5">
            <Field
              label="How old are you?"
              value={age}
              onChange={(v) => setAge(Math.round(v))}
              min={18}
              max={75}
              suffix="yrs"
            />
            <div>
              <span className="text-sm font-medium text-slate-200">Are you planning as…</span>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {(["single", "couple"] as Household[]).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHousehold(h)}
                    className={`rounded-xl border px-4 py-2.5 text-sm font-semibold capitalize transition ${
                      household === h
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-line bg-panel-2 text-slate-200 hover:border-accent/50"
                    }`}
                  >
                    {h === "single" ? "Just me" : "A couple"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {step === 2 && <Actions label="See if I'm on track →" onClick={next} />}
        </Panel>
      )}

      {/* Step 3 — The answer */}
      {step >= 3 && (
        <Panel>
          <h2 className={`text-xl font-bold ${tone}`}>
            {lasts ? "Good news — you're on track 🎉" : "There's a gap to close"}
          </h2>
          <p className="mt-2 text-slate-200">
            {lasts ? (
              <>
                Based on typical savings for your age, your money looks set to last
                to <strong>{plan.lifeExpectancy}</strong> and beyond.
              </>
            ) : (
              <>
                Right now your savings might run short around age{" "}
                <strong>{result.depletedAge}</strong>. The good news: small changes
                can close the gap — we&apos;ll show you how.
              </>
            )}
          </p>
          <p className="mt-3 rounded-xl border border-line bg-panel-2 px-4 py-3 text-sm text-muted">
            This uses an <strong className="text-slate-200">average super balance
            of {money(superBalance)}</strong> for a {age}-year-old
            {household === "couple" ? " (each)" : ""}, and a comfortable spend of{" "}
            {money(targetSpending)}/yr. Not quite you? You&apos;ll pop in your real
            numbers at the end.
          </p>
          {step === 3 && <Actions label="Show me the picture →" onClick={next} />}
        </Panel>
      )}

      {/* Step 4 — The picture */}
      {step >= 4 && (
        <Panel>
          <h2 className="text-lg font-bold text-white">Here&apos;s the picture</h2>
          <p className="mt-1 text-sm text-muted">
            This is your savings over time. They grow while you&apos;re working (the
            hump), then you spend them in retirement. As long as the shaded area
            reaches the right-hand edge, your money lasts.
          </p>
          <div className="mt-3">
            <RetirementChart result={result} animate height={240} />
          </div>
          {step === 4 && <Actions label="Where's my income from? →" onClick={next} />}
        </Panel>
      )}

      {/* Step 5 — Income sources */}
      {step >= 5 && (
        <Panel>
          <h2 className="text-lg font-bold text-white">Where your income comes from</h2>
          <p className="mt-1 text-sm text-muted">
            In retirement you&apos;re not only living off savings. Your income comes
            from your super, any savings outside super, and the government{" "}
            <strong className="text-slate-200">Age Pension</strong> — which tops you
            up as your own savings reduce.
          </p>
          <div className="mt-3">
            <IncomeChart result={result} animate height={200} />
          </div>
          {step === 5 && <Actions label="How sure can we be? →" onClick={next} />}
        </Panel>
      )}

      {/* Step 6 — Likelihood */}
      {step >= 6 && (
        <Panel>
          <h2 className="text-lg font-bold text-white">How sure can we be?</h2>
          <p className="mt-1 text-sm text-muted">
            No one can predict the markets, so we test your plan against{" "}
            {mc.iterations.toLocaleString()} possible futures — some with good
            returns, some with bad. Your money lasts in about{" "}
            <strong className={tone}>{successPct} out of every 100</strong>.
          </p>
          <div className="mt-3">
            <FanChart fan={mc.fan} retirementAge={result.retirementAge} agePensionAge={result.agePensionAge} height={200} />
          </div>
          {step === 6 && <Actions label="Can I make it better? →" onClick={next} />}
        </Panel>
      )}

      {/* Step 7 — Make it yours */}
      {step >= 7 && (
        <Panel>
          <h2 className="text-lg font-bold text-white">Now make it yours</h2>
          <p className="mt-1 text-sm text-muted">
            Those were averages. Pop in your real numbers and try the big levers —
            the result updates instantly.
          </p>
          <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field label="My super balance" value={superBalance} onChange={(v) => setOSuper(v)} min={0} max={3_000_000} step={5_000} prefix="$" />
            <Field label="Yearly spending" value={targetSpending} onChange={(v) => setOSpend(v)} min={20_000} max={200_000} step={1_000} prefix="$" />
            <Field label="Retire at age" value={retireAge} onChange={(v) => setORetire(Math.round(v))} min={Math.min(age + 1, 60)} max={75} suffix="yrs" />
            <Field label="Investment return" value={invReturn} onChange={(v) => setOReturn(v)} min={1} max={12} step={0.1} suffix="%" hint="A balanced super fund is roughly 6–8% a year." />
          </div>
          <p className={`mt-4 rounded-xl border border-line bg-panel-2 px-4 py-3 text-sm ${tone}`}>
            {lasts
              ? `On track — your money lasts to ${plan.lifeExpectancy}+, and works in about ${successPct} of 100 futures.`
              : `Your money runs short around ${result.depletedAge} (${successPct} of 100 futures succeed). Try retiring a little later or trimming spending.`}
          </p>
          {!user && (
            <p className="mt-3 text-sm text-muted">
              <Link href="/signup" className="font-semibold text-accent hover:underline">
                Create a free account
              </Link>{" "}
              to save this and compare scenarios side by side.
            </p>
          )}
          {step === 7 && <Actions label="Take me to the full dashboard →" onClick={() => onExit(plan, true)} />}
        </Panel>
      )}

      <div ref={bottomRef} />
    </main>
  );
}
