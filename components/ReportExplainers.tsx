"use client";

import type { EngineConfig } from "@/lib/au/config";
import type { MonteCarloResult } from "@/lib/au/montecarlo";
import type { RetirementPlan, SimResult, YearRow } from "@/lib/au/types";
import { totalStartingSuper } from "@/lib/au/types";
import { retirementGoal } from "@/lib/au/goal";
import { fmtCurrency } from "@/lib/au/format";
import * as ref from "@/lib/au/scenarios/reference";

const money = (n: number) => fmtCurrency(Math.round(n));
const pct = (frac: number) => `${(frac * 100).toFixed(2)}%`;
const pctN = (n: number) => `${(+n.toFixed(2))}%`;

function MathBox({
  title,
  lead,
  children,
}: {
  title: string;
  lead: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="break-inside-avoid rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-700">{title}</div>
      <p className="mt-1 text-xs text-slate-600">{lead}</p>
      {children}
    </div>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded border border-slate-200 bg-white px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-800">
      {children}
    </pre>
  );
}

/** Super at retirement — the geometric closed form with wage-inflation deflation. */
function SuperWorkings({ plan, config, result }: { plan: RetirementPlan; config: EngineConfig; result: SimResult }) {
  const et = config.superEarningsTaxAccumulation;
  const wage = plan.inflation + (config.livingStandardsGrowthPct ?? 0);
  const nomAfterTax = plan.investmentReturn * (1 - et);
  const g = (1 + nomAfterTax / 100) / (1 + wage / 100) - 1;
  const years = Math.max(0, Math.round(plan.retirementAge - plan.people[0].currentAge));
  const startSuper = totalStartingSuper(plan);
  const netContrib = plan.people.reduce(
    (s, p) =>
      s +
      ref.netAnnualContribution(
        p.salary, config.sgRate, p.voluntaryConcessional, config.concessionalCap,
        config.contributionsTax, p.voluntaryNonConcessional, config.nonConcessionalCap,
      ),
    0,
  );
  const gp = Math.pow(1 + g, years);
  const growthOfStart = startSuper * gp;
  const fromContrib = Math.max(0, result.superAtRetirement - growthOfStart);

  return (
    <MathBox
      title="Super at retirement"
      lead={
        <>
          Projected by compounding your {plan.people.length > 1 ? "combined " : ""}super for {years}{" "}
          years — starting balance and each year&apos;s net contributions growing at a real (today&apos;s-dollar) rate.
        </>
      }
    >
      <Formula>{`Real growth g = (1 + ${plan.investmentReturn}% × (1 − ${(et * 100).toFixed(0)}% earnings tax)) ÷ (1 + ${pctN(wage)} wage inflation) − 1
            = ${pct(g)}

Contributions/yr  c = SG ${(config.sgRate * 100).toFixed(0)}% × salary (+ voluntary), capped, net of ${(config.contributionsTax * 100).toFixed(0)}% tax
            c ≈ ${money(netContrib)}/yr

Closed form  Bₙ = B₀(1+g)ⁿ + c·(1+g)·((1+g)ⁿ − 1) ÷ g
            = ${money(startSuper)}·(1+${pct(g)})^${years} + ${money(netContrib)}·…
            ≈ ${money(result.superAtRetirement)}`}</Formula>
      <div className="mt-2 space-y-0.5 text-xs text-slate-600">
        <div className="flex justify-between gap-4">
          <span>{money(startSuper)} today grows to</span>
          <span className="font-semibold tabular-nums text-slate-800">≈ {money(growthOfStart)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Net contributions (~{money(netContrib)}/yr) add</span>
          <span className="font-semibold tabular-nums text-slate-800">≈ {money(fromContrib)}</span>
        </div>
        <div className="flex justify-between gap-4 border-t border-slate-200 pt-0.5">
          <span className="font-semibold text-slate-700">Together</span>
          <span className="font-semibold tabular-nums text-slate-800">≈ {money(result.superAtRetirement)}</span>
        </div>
      </div>
    </MathBox>
  );
}

/** Retirement income goal — living costs + any home loan, vs ASFA. */
function IncomeGoalWorkings({ plan, config }: { plan: RetirementPlan; config: EngineConfig }) {
  const g = retirementGoal(plan);
  const isCouple = plan.household === "couple";
  const comfortable = isCouple ? config.asfa.comfortable.couple : config.asfa.comfortable.single;
  const modest = isCouple ? config.asfa.modest.couple : config.asfa.modest.single;
  const band =
    g.living >= comfortable ? "at or above ‘comfortable’"
    : g.living >= modest ? "between ‘modest’ and ‘comfortable’"
    : "below ‘modest’";
  return (
    <MathBox
      title="Retirement income goal"
      lead={<>Your yearly target in today&apos;s dollars — living costs plus any home-loan cost, benchmarked to the ASFA Retirement Standard.</>}
    >
      <Formula>{`Living costs        ${money(g.living)}/yr${g.loanCost > 0 ? `
+ Home loan${g.loanKind === "io" ? " (interest-only)" : g.payoffAge ? ` (P&I, clears at ${g.payoffAge})` : ""}   ${money(g.loanCost)}/yr` : ""}
= Total goal        ${money(g.total)}/yr

ASFA (${isCouple ? "couple" : "single"}):  modest ${money(modest)} · comfortable ${money(comfortable)}
Your living costs are ${band}.`}</Formula>
    </MathBox>
  );
}

/** Age Pension — the two-test calculation on the first assessed year. */
function PensionWorkings({ plan, config, result }: { plan: RetirementPlan; config: EngineConfig; result: SimResult }) {
  const side = plan.household === "couple" ? config.agePension.couple : config.agePension.single;
  const freeArea = plan.homeowner ? side.assetsFreeArea.homeowner : side.assetsFreeArea.nonHomeowner;
  const cutoff = freeArea + side.maxAnnual / config.agePension.assetsTaperPerDollar;

  const row: YearRow | undefined =
    result.rows.find((r) => r.age === (result.firstAgePensionAge ?? config.agePensionAge)) ??
    result.rows.find((r) => r.phase === "pension");
  if (!row) return null;

  const equity = row.propertyEquity ?? 0;
  const financial = row.totalSuper + row.outside;
  const assess = financial + equity;
  const rent = Math.max(0, row.rentIncome ?? 0);
  const deemed = ref.deemedIncome(financial, plan.household, config);
  const income = deemed + rent;
  const assetsTest = Math.max(0, side.maxAnnual - Math.max(0, assess - freeArea) * config.agePension.assetsTaperPerDollar);
  const incomeTest = Math.max(0, side.maxAnnual - Math.max(0, income - side.incomeFreeAreaAnnual) * config.agePension.incomeTaperPerDollar);
  const binding = assetsTest <= incomeTest ? "assets" : "income";
  const pension = Math.min(assetsTest, incomeTest);

  return (
    <MathBox
      title={`Age Pension — at age ${row.age}`}
      lead={<>Services Australia applies an assets test and an income test each year and pays the <strong>lower</strong>. Your home is exempt{equity > 0 ? "; an investment property's net equity is not" : ""}.</>}
    >
      <Formula>{`Assessable assets = super ${money(row.totalSuper)} + outside ${money(row.outside)}${equity > 0 ? ` + property equity ${money(equity)}` : ""} = ${money(assess)}
ASSETS test  = ${money(side.maxAnnual)} − max(0, ${money(assess)} − ${money(freeArea)}) × $${config.agePension.assetsTaperPerDollar.toFixed(3)}/$ = ${money(assetsTest)}

Deemed income = ${money(deemed)}${rent > 0 ? ` + net rent ${money(rent)}` : ""} = ${money(income)}
INCOME test  = ${money(side.maxAnnual)} − max(0, ${money(income)} − ${money(side.incomeFreeAreaAnnual)}) × ${config.agePension.incomeTaperPerDollar}/$ = ${money(incomeTest)}

Pension = lower of the two = ${binding.toUpperCase()} test → ${money(pension)}/yr`}</Formula>
      <p className="mt-2 text-[11px] text-slate-500">
        {assess > cutoff
          ? `Assessable assets ${money(assess)} are above the ${money(cutoff)} cut-off, so no pension is paid until they fall below it.`
          : `Assessable assets are below the ${money(cutoff)} cut-off, so a ${binding === "assets" ? "part" : ""} pension applies.`}
      </p>
    </MathBox>
  );
}

/** Monte Carlo likelihood — parameters and sequencing risk. */
function LikelihoodWorkings({ plan, mc }: { plan: RetirementPlan; mc: MonteCarloResult }) {
  const successPct = Math.round(mc.successRate * 100);
  return (
    <MathBox
      title="Likelihood (Monte Carlo)"
      lead={<>A single fixed-return line hides <strong>sequencing risk</strong> — a poor run of returns early in retirement does more damage. We simulate many return paths instead.</>}
    >
      <Formula>{`Each of ${mc.iterations.toLocaleString()} runs draws a return for every year from a
bell curve:  return ~ Normal(mean ${plan.investmentReturn}%, volatility ±${plan.returnVolatility}%)

Success = the plan funds spending to age ${plan.lifeExpectancy}.
Result  = ${successPct}% of runs succeed.${mc.medianDepletionAge !== null ? `
When it fails, money typically runs short around age ${mc.medianDepletionAge}${mc.worstCaseDepletionAge !== null ? ` (worst 10%: age ${mc.worstCaseDepletionAge})` : ""}.` : ""}`}</Formula>
    </MathBox>
  );
}

export default function ReportExplainers({
  plan,
  config,
  result,
  mc,
}: {
  plan: RetirementPlan;
  config: EngineConfig;
  result: SimResult;
  mc: MonteCarloResult;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SuperWorkings plan={plan} config={config} result={result} />
      <IncomeGoalWorkings plan={plan} config={config} />
      <PensionWorkings plan={plan} config={config} result={result} />
      <LikelihoodWorkings plan={plan} mc={mc} />
    </div>
  );
}
