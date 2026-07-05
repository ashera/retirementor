"use client";

import { Cell, Pie, PieChart } from "recharts";
import type { EngineConfig } from "@/lib/au/config";
import type { MonteCarloResult } from "@/lib/au/montecarlo";
import type { RetirementPlan, SimResult, YearRow } from "@/lib/au/types";
import { totalStartingSuper } from "@/lib/au/types";
import { retirementGoal } from "@/lib/au/goal";
import { essentialsFloor } from "@/lib/au/lifestages";
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
    <div className="break-inside-avoid rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-700">{title}</div>
      <p className="mt-1 text-[11px] leading-snug text-slate-600">{lead}</p>
      {children}
    </div>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap rounded border border-slate-200 bg-white px-2.5 py-1 font-mono text-[10px] leading-tight text-slate-800">
      {children}
    </pre>
  );
}

/** Super at retirement — the geometric closed form with wage-inflation deflation. */
function SuperWorkings({ plan, config, result }: { plan: RetirementPlan; config: EngineConfig; result: SimResult }) {
  const et = config.superEarningsTaxAccumulation;
  const feesCfg = plan.fees ?? config.fees;
  const feePct = feesCfg?.adminInvestmentPct ?? 0;
  const annualFee = (feesCfg?.fixedAdminAnnual ?? 0) + (feesCfg?.insuranceAnnual ?? 0);
  const wage = plan.inflation + (config.livingStandardsGrowthPct ?? 0);
  const nomAfterTax = plan.investmentReturn * (1 - et) - feePct;
  const g = (1 + nomAfterTax / 100) / (1 + wage / 100) - 1;
  const years = Math.max(0, Math.round(plan.retirementAge - plan.people[0].currentAge));
  const startSuper = totalStartingSuper(plan);
  const netContrib = plan.people.reduce(
    (s, p) =>
      s +
      ref.netAnnualContribution(
        p.salary, config.sgRate, p.voluntaryConcessional, config.concessionalCap,
        config.contributionsTax, p.voluntaryNonConcessional, config.nonConcessionalCap,
      ) - annualFee,
    0,
  );
  const gp = Math.pow(1 + g, years);
  // RG 276 two-stage: accumulate in wage-indexed dollars, then re-express in
  // retirement (CPI) dollars at retirement. Split in wage dollars, then rebase.
  const rebase = Math.pow((1 + wage / 100) / (1 + plan.inflation / 100), years);
  const showRebase = Math.abs(rebase - 1) > 1e-6;
  const projectedWageReal = rebase > 0 ? result.superAtRetirement / rebase : result.superAtRetirement;
  const growthOfStart = startSuper * gp;
  const fromContrib = Math.max(0, projectedWageReal - growthOfStart);
  const rebaseLine = showRebase
    ? `\n            ≈ ${money(projectedWageReal)}  (wage-indexed dollars)\nRebase to retirement (CPI) dollars  × (1+${pctN(wage)})^${years} ÷ (1+${plan.inflation}%)^${years}\n            ≈ ${money(result.superAtRetirement)}`
    : `\n            ≈ ${money(result.superAtRetirement)}`;

  return (
    <MathBox
      title="Super at retirement"
      lead={
        <>
          Projected by compounding your {plan.people.length > 1 ? "combined " : ""}super for {years}{" "}
          years — starting balance and each year&apos;s net contributions growing at a real (today&apos;s-dollar) rate
          {showRebase ? ", then re-expressed in retirement (CPI) dollars" : ""}.
        </>
      }
    >
      <Formula>{`Real growth g = (1 + ${plan.investmentReturn}% × (1 − ${(et * 100).toFixed(0)}% tax) − ${feePct}% fee) ÷ (1 + ${pctN(wage)} wage inflation) − 1
            = ${pct(g)}

Contributions/yr  c = SG ${(config.sgRate * 100).toFixed(0)}% × salary (+ voluntary), capped, net of ${(config.contributionsTax * 100).toFixed(0)}% tax${annualFee > 0 ? ` less ${money(annualFee)} fees` : ""}
            c ≈ ${money(netContrib)}/yr

Closed form  Bₙ = B₀(1+g)ⁿ + c·(1+g)·((1+g)ⁿ − 1) ÷ g
            = ${money(startSuper)}·(1+${pct(g)})^${years} + ${money(netContrib)}·…${rebaseLine}`}</Formula>
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
          <span className="font-semibold text-slate-700">{showRebase ? "Subtotal (wage-indexed)" : "Together"}</span>
          <span className="font-semibold tabular-nums text-slate-800">≈ {money(showRebase ? projectedWageReal : result.superAtRetirement)}</span>
        </div>
        {showRebase && (
          <div className="flex justify-between gap-4 border-t border-slate-200 pt-0.5">
            <span className="font-semibold text-slate-700">In retirement (CPI) dollars</span>
            <span className="font-semibold tabular-nums text-slate-800">≈ {money(result.superAtRetirement)}</span>
          </div>
        )}
      </div>
    </MathBox>
  );
}

function GoalLegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-slate-600">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
        {label}
      </span>
      <span className="font-medium tabular-nums text-slate-800">{money(value)}/yr</span>
    </div>
  );
}

/** Donut of the goal composition — essentials / home loan / discretionary. */
function GoalDonut({
  essentials,
  discretionary,
  loanCost,
  estimated,
}: {
  essentials: number;
  discretionary: number;
  loanCost: number;
  estimated: boolean;
}) {
  const total = essentials + discretionary + loanCost;
  const discPct = total > 0 ? Math.round((discretionary / total) * 100) : 0;
  const pie = [
    { name: "Essentials", value: essentials, color: "#0d9488" },
    ...(loanCost > 0 ? [{ name: "Home loan", value: loanCost, color: "#f59e0b" }] : []),
    { name: "Discretionary", value: discretionary, color: "#db2777" },
  ];
  return (
    <div className="mt-1.5 flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2">
      <div className="relative h-[84px] w-[84px] shrink-0">
        <PieChart width={84} height={84} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={pie}
            dataKey="value"
            cx={42}
            cy={42}
            innerRadius={27}
            outerRadius={38}
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive={false}
          >
            {pie.map((p) => (
              <Cell key={p.name} fill={p.color} />
            ))}
          </Pie>
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-base font-bold tabular-nums text-slate-800">{discPct}%</div>
          <div className="text-[9px] text-slate-500">flex</div>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1 text-xs">
        <GoalLegendRow color="#0d9488" label="Essentials" value={essentials} />
        {loanCost > 0 && <GoalLegendRow color="#f59e0b" label="Home loan" value={loanCost} />}
        <GoalLegendRow color="#db2777" label="Discretionary (flex)" value={discretionary} />
        <p className="text-[11px] leading-snug text-slate-500">
          Needs floor{loanCost > 0 ? " (essentials + loan)" : ""} {money(essentials + loanCost)}/yr;
          the rest is your flex.{estimated ? " Split estimated from ASFA." : ""}
        </p>
      </div>
    </div>
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
  const { value: essentials, estimated } = essentialsFloor(plan, config);
  const discretionary = Math.max(0, g.living - essentials);
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
      <GoalDonut essentials={essentials} discretionary={discretionary} loanCost={g.loanCost} estimated={estimated} />
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
    <div className="grid gap-1.5 sm:grid-cols-2">
      <SuperWorkings plan={plan} config={config} result={result} />
      <IncomeGoalWorkings plan={plan} config={config} />
      <PensionWorkings plan={plan} config={config} result={result} />
      <LikelihoodWorkings plan={plan} mc={mc} />
    </div>
  );
}
