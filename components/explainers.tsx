"use client";

import Explainer from "@/components/Explainer";
import InlineExplainer from "@/components/InlineExplainer";
import type { EngineConfig } from "@/lib/au/config";
import type { MonteCarloResult } from "@/lib/au/montecarlo";
import { fmtCurrency, fmtPercent } from "@/lib/au/format";
import { spendingRange, totalStartingSuper } from "@/lib/au/types";
import { retirementGoal } from "@/lib/au/goal";
import type { RetirementPlan, SimResult, YearRow } from "@/lib/au/types";

const STAGES_ARTICLE =
  "https://www.caresuper.com.au/members/advice-and-resources/education-hub/how-retirement-goes-from-go-go-to-no-go";

function AssetsSnapshot({
  heading,
  row,
  cutoff,
}: {
  heading: string;
  row: YearRow;
  cutoff: number;
}) {
  const equity = row.propertyEquity ?? 0;
  const assessable = row.total + equity;
  const above = assessable > cutoff;
  return (
    <div className="rounded-lg border border-line bg-panel p-3">
      <div className="mb-1.5 text-xs font-semibold text-slate-200">{heading}</div>
      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between gap-4">
          <span className="text-muted">Super (in pension phase)</span>
          <span className="tabular-nums text-slate-200">
            {fmtCurrency(row.totalSuper)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted">+ Savings outside super</span>
          <span className="tabular-nums text-slate-200">
            {fmtCurrency(row.outside)}
          </span>
        </div>
        {equity > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted">+ Investment property (net equity)</span>
            <span className="tabular-nums text-slate-200">{fmtCurrency(equity)}</span>
          </div>
        )}
        <div className="flex justify-between gap-4 border-t border-line pt-1 font-semibold text-white">
          <span>Assessable assets</span>
          <span className="tabular-nums">{fmtCurrency(assessable)}</span>
        </div>
      </div>
      {equity > 0 && (
        <div className="mt-1 text-[10px] text-muted">
          Your home is exempt; the investment property (value less its loan) is not.
        </div>
      )}
      <div
        className={`mt-1.5 text-[11px] font-medium ${above ? "text-amber-400" : "text-emerald-400"}`}
      >
        {above
          ? `Above the ${fmtCurrency(cutoff)} cut-off — no pension`
          : `Below the ${fmtCurrency(cutoff)} cut-off — eligible`}
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-1.5 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="font-semibold tabular-nums text-white">{value}</span>
    </div>
  );
}

/** Explains the "Super at retirement" figure, with this plan's actual numbers. */
export function SuperAtRetirementExplainer({
  plan,
  config,
  result,
}: {
  plan: RetirementPlan;
  config: EngineConfig;
  result: SimResult;
}) {
  const people = plan.people;
  const isCouple = people.length > 1;
  const currentSuper = totalStartingSuper(plan);
  const years = Math.max(0, Math.round(plan.retirementAge - people[0].currentAge));

  const sgRatePct = config.sgRate * 100;
  const contribTaxPct = config.contributionsTax * 100;
  const earningsTaxPct = config.superEarningsTaxAccumulation * 100;

  const contribRows = people.map((p) => {
    const sg = p.salary * config.sgRate;
    const grossConc = sg + p.voluntaryConcessional;
    const conc = Math.min(grossConc, config.concessionalCap);
    const ncc = Math.min(p.voluntaryNonConcessional, config.nonConcessionalCap);
    return {
      salary: p.salary,
      sg,
      sacrifice: p.voluntaryConcessional,
      conc,
      net: conc * (1 - config.contributionsTax) + ncc,
      capped: grossConc > config.concessionalCap,
    };
  });
  const concGross = contribRows.reduce((s, r) => s + r.conc, 0);
  const netContrib = contribRows.reduce((s, r) => s + r.net, 0);

  const fees = plan.fees ?? config.fees;
  const feePct = fees?.adminInvestmentPct ?? 0;
  const nominalAfterTax =
    plan.investmentReturn * (1 - config.superEarningsTaxAccumulation) - feePct;
  // Accumulation is deflated by WAGE inflation (RG 276 two-stage): CPI + the
  // rise in community living standards.
  const wageInflation = plan.inflation + (config.livingStandardsGrowthPct ?? 0);
  const realAccum =
    (1 + nominalAfterTax / 100) / (1 + wageInflation / 100) - 1;

  // Split the projected balance into "existing super grown" vs "from contributions".
  const growthOfStart = currentSuper * Math.pow(1 + realAccum, years);
  const fromContributions = Math.max(
    0,
    result.superAtRetirement - growthOfStart,
  );

  return (
    <Explainer title="Super at retirement">
      <p>
        This is the projected balance of your{" "}
        {isCouple ? "combined superannuation" : "superannuation"} on the day you
        retire at age {plan.retirementAge} —{" "}
        <span className="font-semibold text-accent">
          {fmtCurrency(result.superAtRetirement)}
        </span>
        . It&apos;s shown in <em>today&apos;s dollars</em>, so it&apos;s
        directly comparable to what money buys now.
      </p>

      <div>
        <h3 className="mb-1 font-semibold text-white">How it&apos;s worked out</h3>
        <p>
          We project your super one year at a time from age{" "}
          {people[0].currentAge} to {plan.retirementAge} ({years} years). Each
          year:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Contributions are added — the {(config.sgRate * 100).toFixed(0)}%
            Super Guarantee on your salary plus any voluntary contributions —
            less the {(config.contributionsTax * 100).toFixed(0)}% contributions
            tax (after-tax contributions aren&apos;t taxed going in). Concessional
            contributions are capped at {fmtCurrency(config.concessionalCap)}/yr.
          </li>
          <li>
            The balance then grows at your investment return, less the{" "}
            {(config.superEarningsTaxAccumulation * 100).toFixed(0)}% tax on super
            earnings, and is adjusted for inflation.
          </li>
        </ul>
      </div>

      <div className="rounded-xl border border-line bg-panel-2 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          For your plan {isCouple ? "(combined)" : ""}
        </div>
        <Figure label="Starting super today" value={fmtCurrency(currentSuper)} />
        <InlineExplainer
          label="Contributions each year (before tax)"
          value={fmtCurrency(concGross)}
        >
          <p className="mb-2">
            The {sgRatePct.toFixed(0)}% Super Guarantee your employer pays on{" "}
            {isCouple ? "each salary" : "your salary"}, plus any before-tax
            (salary-sacrifice) voluntary contributions — before the{" "}
            {contribTaxPct.toFixed(0)}% contributions tax. Concessional
            contributions are capped at {fmtCurrency(config.concessionalCap)}/yr
            each.
          </p>
          <div className="space-y-1 font-mono text-[11px] text-slate-200">
            {contribRows.map((r, i) => (
              <div key={i}>
                {isCouple ? (i === 0 ? "You: " : "Partner: ") : ""}
                {sgRatePct.toFixed(0)}% × {fmtCurrency(r.salary)} ={" "}
                {fmtCurrency(r.sg)}
                {r.sacrifice > 0
                  ? ` + ${fmtCurrency(r.sacrifice)} sacrifice`
                  : ""}{" "}
                = {fmtCurrency(r.conc)}
                {r.capped ? " (capped)" : ""}
              </div>
            ))}
            {isCouple && (
              <div className="border-t border-accent/20 pt-1">
                Combined = {fmtCurrency(concGross)}
              </div>
            )}
          </div>
        </InlineExplainer>
        <Figure
          label="Net added to super each year"
          value={`≈ ${fmtCurrency(netContrib)}`}
        />
        <InlineExplainer
          label="Real growth rate (after tax & inflation)"
          value={fmtPercent(realAccum)}
        >
          <p className="mb-2">
            Your super&apos;s return, stripped of the {earningsTaxPct.toFixed(0)}%
            tax on earnings and of <strong>wage inflation</strong> — a real,
            today&apos;s-dollars growth rate. Before retirement, ASIC RG 276
            deflates by wage inflation ({wageInflation}% = CPI {plan.inflation}% +{" "}
            {(config.livingStandardsGrowthPct ?? 0)}% living standards).
          </p>
          <div className="space-y-1 font-mono text-[11px] text-slate-200">
            <div>
              = (1 + {plan.investmentReturn}% × (1 − {earningsTaxPct.toFixed(0)}%) − {feePct}% fee)
              ÷ (1 + {wageInflation}%) − 1
            </div>
            <div>
              = (1 + {nominalAfterTax.toFixed(2)}%) ÷ (1 + {wageInflation}%) − 1
            </div>
            <div>= {fmtPercent(realAccum)}</div>
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              {plan.investmentReturn}% nominal return, less{" "}
              {earningsTaxPct.toFixed(0)}% earnings tax and the {feePct}% fee →{" "}
              {nominalAfterTax.toFixed(2)}%
            </li>
            <li>
              then adjusted for {wageInflation}% wage inflation → {fmtPercent(realAccum)}
            </li>
          </ul>
        </InlineExplainer>
        <Figure label="Years until retirement" value={`${years}`} />
        <InlineExplainer
          label={`Projected balance at ${plan.retirementAge}`}
          value={fmtCurrency(result.superAtRetirement)}
        >
          <p className="mb-2">
            The result of compounding your super year by year for {years} years
            — your starting balance and each year&apos;s net contributions both
            growing at the {fmtPercent(realAccum)} real rate.
          </p>
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span>Your {fmtCurrency(currentSuper)} today grows to</span>
              <span className="font-semibold tabular-nums text-white">
                ≈ {fmtCurrency(growthOfStart)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Net contributions (~{fmtCurrency(netContrib)}/yr) add</span>
              <span className="font-semibold tabular-nums text-white">
                ≈ {fmtCurrency(fromContributions)}
              </span>
            </div>
            <div className="flex justify-between gap-4 border-t border-accent/20 pt-1">
              <span className="text-white">Together</span>
              <span className="font-semibold tabular-nums text-white">
                ≈ {fmtCurrency(result.superAtRetirement)}
              </span>
            </div>
          </div>
        </InlineExplainer>
      </div>

      <div>
        <h3 className="mb-1 font-semibold text-white">The yearly step</h3>
        <p className="rounded-lg bg-ink/60 px-3 py-2 font-mono text-xs text-slate-200">
          next balance = (balance + net contributions) × (1 + real growth)
        </p>
      </div>

      <p className="text-xs text-muted">
        Estimate only. Real returns, contributions and tax rules vary year to
        year — this uses steady long-run assumptions.
      </p>
    </Explainer>
  );
}

/** Explains the "Retirement income goal" figure (flat or staged). */
export function RetirementIncomeGoalExplainer({
  plan,
  config,
}: {
  plan: RetirementPlan;
  config: EngineConfig;
}) {
  const isCouple = plan.household === "couple";
  const household = isCouple ? "couple" : "single";
  const isStaged = plan.spendingMode === "stages";
  const stages = plan.spendingStages;

  const comfortable = isCouple
    ? config.asfa.comfortable.couple
    : config.asfa.comfortable.single;
  const modest = isCouple
    ? config.asfa.modest.couple
    : config.asfa.modest.single;
  const lumpComf = isCouple
    ? config.asfa.lumpSum.comfortable.couple
    : config.asfa.lumpSum.comfortable.single;

  const goal = isStaged ? stages.goGo : plan.targetSpending;
  const g = retirementGoal(plan);
  const band =
    goal >= comfortable
      ? "at or above the ‘comfortable’ standard"
      : goal >= modest
        ? "between the ‘modest’ and ‘comfortable’ standards"
        : "below the ‘modest’ standard";

  return (
    <Explainer title="Retirement income goal">
      {g.loanCost > 0 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-amber-200">
          Your headline goal of <strong>{fmtCurrency(g.total)}/yr</strong> includes{" "}
          {fmtCurrency(g.loanCost)}/yr of home-loan{" "}
          {g.loanKind === "io" ? "interest" : "repayments"}
          {g.loanKind === "pi" && g.payoffAge
            ? `, easing to ${fmtCurrency(g.living)} once the loan clears at ${g.payoffAge}`
            : " (interest-only, for life)"}
          . The ASFA comparison below is on your {fmtCurrency(g.living)} of living costs.
        </p>
      )}
      {g.loanKind === "cleared" && (
        <p className="rounded-lg border border-line bg-panel px-3 py-2 text-muted">
          Your home loan is cleared at retirement with a one-off{" "}
          {fmtCurrency(g.clearBalance ?? 0)} from super, so it isn&apos;t part of your
          ongoing income goal.
        </p>
      )}
      {isStaged ? (
        <p>
          This is the yearly income your plan is built to provide in retirement,
          in <em>today&apos;s dollars</em>. You&apos;ve chosen a{" "}
          <a
            href={STAGES_ARTICLE}
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            staged (go-go / slow-go / no-go)
          </a>{" "}
          approach, so spending steps down as you age. The active{" "}
          <strong>go-go</strong> stage is{" "}
          <span className="font-semibold text-accent">{fmtCurrency(goal)}</span>
          {g.loanCost > 0 ? " of living costs" : ""}.
        </p>
      ) : g.loanCost > 0 ? (
        <p>
          This is your <strong>living costs</strong> —{" "}
          <span className="font-semibold text-accent">{fmtCurrency(goal)}</span> a year in{" "}
          <em>today&apos;s dollars</em>. The home loan above is added on top, for a total goal
          of <span className="font-semibold text-amber-400">{fmtCurrency(g.total)}</span>.
        </p>
      ) : (
        <p>
          This is the yearly income your plan is built to provide once you
          retire —{" "}
          <span className="font-semibold text-accent">{fmtCurrency(goal)}</span>{" "}
          a year, every year, in <em>today&apos;s dollars</em>.
        </p>
      )}

      {isStaged && (
        <div className="rounded-xl border border-line bg-panel-2 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Your stages
          </div>
          <Figure
            label={`Go-go (${plan.retirementAge}–${stages.slowGoAge})`}
            value={`${fmtCurrency(stages.goGo)}/yr`}
          />
          <Figure
            label={`Slow-go (${stages.slowGoAge}–${stages.noGoAge})`}
            value={`${fmtCurrency(stages.slowGo)}/yr`}
          />
          <Figure
            label={`No-go (${stages.noGoAge}+)`}
            value={`${fmtCurrency(stages.noGo)}/yr`}
          />
        </div>
      )}

      <div>
        <h3 className="mb-1 font-semibold text-white">How it compares</h3>
        <p>
          Against the ASFA Retirement Standard for a {household}, your{" "}
          {isStaged ? "go-go " : ""}goal of {fmtCurrency(goal)} sits {band}.
        </p>
        <div className="mt-2 rounded-xl border border-line bg-panel-2 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            ASFA Retirement Standard ({household})
          </div>
          <InlineExplainer
            label="‘Comfortable’ lifestyle"
            value={`${fmtCurrency(comfortable)}/yr`}
          >
            <p>
              The ASFA Retirement Standard is a widely-used benchmark budget,
              published quarterly, that assumes you own your home outright.{" "}
              <strong>Comfortable</strong> covers a good lifestyle with travel,
              dining and hobbies; <strong>modest</strong> covers the basics — a
              step above the Age Pension alone.
            </p>
            <p className="mt-2">
              For a {household}, ASFA estimates a lump sum of about{" "}
              {fmtCurrency(lumpComf)} is needed at {config.agePensionAge} to fund
              a comfortable retirement (alongside the Age Pension).
            </p>
          </InlineExplainer>
          <Figure label="‘Modest’ lifestyle" value={`${fmtCurrency(modest)}/yr`} />
        </div>
      </div>

      <div>
        <h3 className="mb-1 font-semibold text-white">
          Where the income comes from
        </h3>
        <p>
          Each year this is funded from your super (drawn tax-free from age{" "}
          {config.preservationAge}), your savings outside super, and — from age{" "}
          {config.agePensionAge} — the means-tested Age Pension topping up
          whatever&apos;s left. The <em>Retirement income sources</em> chart
          shows the mix year by year.
        </p>
      </div>

      <p className="text-xs text-muted">
        In today&apos;s dollars — we assume your spending keeps pace with
        inflation.
      </p>
    </Explainer>
  );
}

/** Explains the Monte Carlo success probability and sequencing risk. */
export function LikelihoodExplainer({
  plan,
  mc,
}: {
  plan: RetirementPlan;
  mc: MonteCarloResult;
}) {
  const pct = Math.round(mc.successRate * 100);
  return (
    <Explainer title="How likely is this plan to work?">
      <p>
        This is the share of{" "}
        <strong>{mc.iterations.toLocaleString()}</strong> randomised return
        scenarios in which your savings and the Age Pension fund your full
        target spending all the way to age {plan.lifeExpectancy} —{" "}
        <span className="font-semibold text-accent">{pct}%</span> here.
      </p>

      <div>
        <h3 className="mb-1 font-semibold text-white">
          Why a single line isn&apos;t enough
        </h3>
        <p>
          A projection that assumes the same {plan.investmentReturn}% return
          every year hides <strong>sequencing risk</strong>: a bad run of
          returns <em>early</em> in retirement does far more damage than the
          same run later, because you&apos;re drawing down while the market is
          down. Two runs with the <em>same</em> average return can end very
          differently depending on the order.
        </p>
      </div>

      <div>
        <h3 className="mb-1 font-semibold text-white">How it&apos;s worked out</h3>
        <p>
          We run your plan {mc.iterations.toLocaleString()} times. Each year of
          each run draws a random return from a bell curve centred on{" "}
          {plan.investmentReturn}% with a spread of about ±
          {plan.returnVolatility}% (volatility), then we count how often the plan
          funds your spending to the end.
        </p>
      </div>

      {mc.worstCaseDepletionAge !== null && (
        <div className="rounded-xl border border-line bg-panel-2 p-4">
          <Figure label="Success rate" value={`${pct}%`} />
          <Figure
            label="Typical shortfall age (when it fails)"
            value={
              mc.medianDepletionAge !== null
                ? `age ${mc.medianDepletionAge}`
                : "—"
            }
          />
          <Figure
            label="Worst 10% run short by"
            value={`age ${mc.worstCaseDepletionAge}`}
          />
        </div>
      )}

      <p className="text-xs text-muted">
        The Age Pension is still a floor, so &lsquo;runs short&rsquo; means below
        your target lifestyle, not $0 income. Volatility is an assumption — a
        diversified balanced/growth fund is roughly 9–13% a year.
      </p>
    </Explainer>
  );
}

/** Explains the "Money lasts" figure. */
export function MoneyLastsExplainer({
  plan,
  config,
  result,
}: {
  plan: RetirementPlan;
  config: EngineConfig;
  result: SimResult;
}) {
  const isStaged = plan.spendingMode === "stages";
  const range = spendingRange(plan);
  const g = retirementGoal(plan);
  const spendLabel =
    g.loanCost > 0
      ? `${fmtCurrency(g.total)}/yr` // living costs + the ongoing home loan
      : isStaged
        ? `${fmtCurrency(range.min)}–${fmtCurrency(range.max)}/yr`
        : `${fmtCurrency(plan.targetSpending)}/yr`;
  const outsideAtRet = Math.max(
    0,
    result.totalAtRetirement - result.superAtRetirement,
  );
  const lasts = result.lastsToLifeExpectancy;

  return (
    <Explainer title="Money lasts">
      {lasts ? (
        <p>
          Your income sources cover your spending every year through to age{" "}
          <span className="font-semibold text-accent">
            {plan.lifeExpectancy}
          </span>{" "}
          — your planning horizon — without running out.
        </p>
      ) : (
        <p>
          Your income sources cover your spending until age{" "}
          <span className="font-semibold text-amber-400">
            {result.depletedAge}
          </span>
          , when your savings run dry and the Age Pension alone can&apos;t meet
          your target. After that there&apos;s a shortfall.
        </p>
      )}

      <div>
        <h3 className="mb-1 font-semibold text-white">How it&apos;s worked out</h3>
        <p>
          Each retirement year we draw your spending in order: from super
          (accessible tax-free once you&apos;re {config.preservationAge}), then
          from your savings outside super — with the means-tested Age Pension
          topping up from age {config.agePensionAge}. &lsquo;Money lasts&rsquo;
          is the first age those sources can&apos;t fully cover your spending, or
          your whole horizon if they always can.
        </p>
      </div>

      <div className="rounded-xl border border-line bg-panel-2 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          For your plan
        </div>
        <Figure label="Retire at" value={`age ${plan.retirementAge}`} />
        <Figure label="Spending" value={spendLabel} />
        <Figure
          label="Super at retirement"
          value={fmtCurrency(result.superAtRetirement)}
        />
        <Figure
          label="Outside super at retirement"
          value={fmtCurrency(outsideAtRet)}
        />
        <Figure label="Planning horizon" value={`age ${plan.lifeExpectancy}`} />
        <Figure
          label="Result"
          value={
            lasts
              ? `lasts to ${plan.lifeExpectancy}+`
              : `runs short at ${result.depletedAge}`
          }
        />
      </div>

      <div>
        <h3 className="mb-1 font-semibold text-white">Make it last longer</h3>
        <p>
          The big levers: retire later, trim spending (especially the go-go
          years), save more before retiring, or lean on the Age Pension by
          holding fewer assessable assets.
        </p>
      </div>

      <p className="text-xs text-muted">
        In today&apos;s dollars, using steady long-run return and inflation
        assumptions.
      </p>
    </Explainer>
  );
}

/** Explains the "Age Pension from" figure, incl. a nested means-test explainer. */
export function AgePensionExplainer({
  plan,
  config,
  result,
}: {
  plan: RetirementPlan;
  config: EngineConfig;
  result: SimResult;
}) {
  const isCouple = plan.household === "couple";
  const household = isCouple ? "couple" : "single";
  const side = isCouple ? config.agePension.couple : config.agePension.single;
  const freeArea = plan.homeowner
    ? side.assetsFreeArea.homeowner
    : side.assetsFreeArea.nonHomeowner;
  const cutoff = freeArea + side.maxAnnual / config.agePension.assetsTaperPerDollar;
  const eligible = result.firstAgePensionAge !== null;

  // Snapshots of assessable assets to show why they're above/below the cut-off.
  const testRow = result.rows.find((r) => r.phase === "pension") ?? null;
  const lastRow = result.rows[result.rows.length - 1];
  const firstEligRow =
    eligible && result.firstAgePensionAge !== null
      ? (result.rows.find((r) => r.age === result.firstAgePensionAge) ?? null)
      : null;

  let secondRow: YearRow | null = null;
  let secondHeading = "";
  let crossingNote = "";
  if (testRow) {
    if (eligible && firstEligRow && firstEligRow.age !== testRow.age) {
      secondRow = firstEligRow;
      secondHeading = `At ${firstEligRow.age} (pension begins)`;
      crossingNote = `Between ${testRow.age} and ${firstEligRow.age} your assessable assets fall below ${fmtCurrency(cutoff)}, so a part-pension starts.`;
    } else if (eligible) {
      crossingNote = `Your assets are already below the cut-off when the test first applies, so you qualify from ${testRow.age}.`;
    } else {
      if (lastRow && lastRow.age !== testRow.age) {
        secondRow = lastRow;
        secondHeading = `At ${lastRow.age} (end of plan)`;
      }
      crossingNote = `Your assessable assets stay above ${fmtCurrency(cutoff)} for your whole plan, so no pension is paid.`;
    }
  }

  return (
    <Explainer title="Age Pension from">
      {eligible ? (
        <p>
          The age you first start receiving any Age Pension —{" "}
          <span className="font-semibold text-accent">
            age {result.firstAgePensionAge}
          </span>
          . It&apos;s means-tested, so the amount depends on your assets and
          income each year.
        </p>
      ) : (
        <p>
          Within your plan you don&apos;t qualify for any Age Pension — your
          assessable assets stay above the cut-off the whole way through. You
          could still qualify later if you spend down further.
        </p>
      )}

      <div>
        <h3 className="mb-1 font-semibold text-white">How it&apos;s worked out</h3>
        <p>
          From age {config.agePensionAge}, Services Australia applies two tests
          each year and pays the <strong>lower</strong> result. Your assessable
          assets fall as you draw down your savings, so many people qualify — or
          get more — later in retirement.
        </p>
      </div>

      <div className="rounded-xl border border-line bg-panel-2 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          For your plan ({household}, {plan.homeowner ? "homeowner" : "renter"})
        </div>
        <Figure label="Age Pension age" value={`${config.agePensionAge}`} />
        <InlineExplainer label="Assets-test cut-off" value={fmtCurrency(cutoff)}>
          <p>Two tests decide your pension; whichever pays less applies:</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li>
              <strong>Assets test</strong> — assessable assets (your home is
              exempt) above a free area of {fmtCurrency(freeArea)} for a{" "}
              {household} {plan.homeowner ? "homeowner" : "renter"} reduce the
              pension, phasing out to $0 at about {fmtCurrency(cutoff)}.
            </li>
            <li>
              <strong>Income test</strong> — your financial assets are
              &lsquo;deemed&rsquo; to earn income at set rates; more deemed
              income means less pension.
              {plan.investmentProperty && (
                <>
                  {" "}
                  Rent from an investment property is counted as your{" "}
                  <em>actual</em> net rent, not deemed.
                </>
              )}
            </li>
          </ul>
          <p className="mt-2">
            The full pension for a {household} is{" "}
            {fmtCurrency(side.maxAnnual)}/yr.
          </p>
        </InlineExplainer>
        <Figure
          label="First payment in your plan"
          value={eligible ? `age ${result.firstAgePensionAge}` : "not within horizon"}
        />
      </div>

      {testRow && (
        <div>
          <h3 className="mb-1 font-semibold text-white">
            Your assessable assets
          </h3>
          <p className="mb-2">
            Your super (once you&apos;re drawing it) and your savings outside
            super are counted — your home is excluded
            {plan.investmentProperty
              ? ", but an investment property's net equity is not"
              : ""}
            . These fall as you spend, so you can cross the cut-off partway
            through retirement.
          </p>
          <div className="space-y-2">
            <AssetsSnapshot
              heading={`At ${testRow.age} (first assessed)`}
              row={testRow}
              cutoff={cutoff}
            />
            {secondRow && (
              <AssetsSnapshot
                heading={secondHeading}
                row={secondRow}
                cutoff={cutoff}
              />
            )}
          </div>
          {crossingNote && (
            <p className="mt-2 text-xs text-muted">{crossingNote}</p>
          )}
        </div>
      )}

      <p className="text-xs text-muted">
        {config.deeming.needsVerification
          ? "Deeming rates are pending confirmation for this year — treat pension figures as estimates."
          : "Pension figures are estimates based on current rules."}
      </p>
    </Explainer>
  );
}
