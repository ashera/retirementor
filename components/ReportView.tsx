"use client";

import Link from "next/link";
import type { EngineConfig } from "@/lib/au/config";
import { getInvestmentProperties, hasStaggeredRetirement, personRetirementAge, type RetirementPlan, type SimResult } from "@/lib/au/types";
import type { MonteCarloResult } from "@/lib/au/montecarlo";
import { retirementGoal } from "@/lib/au/goal";
import { fmtCurrency } from "@/lib/au/format";
import { track } from "@/lib/analytics";
import RetirementChart, { type SpendingBand } from "@/components/RetirementChart";
import { ageGapInfo } from "@/components/ageAxis";
import IncomeChart from "@/components/IncomeChart";
import FanChart from "@/components/FanChart";
import ReportExplainers from "@/components/ReportExplainers";
import { lifestageBreakdown } from "@/lib/au/lifestages";
import { BUDGET_CATEGORY_META } from "@/lib/au/budget";

const money = (n: number) => fmtCurrency(Math.round(n));

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 64 48" className="h-14 w-auto" aria-hidden>
        <defs>
          <linearGradient id="rep-bridge" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#0d9488" />
            <stop offset="1" stopColor="#22c55e" />
          </linearGradient>
        </defs>
        <path d="M5 41 A27 27 0 0 1 59 41 L46 41 A14 14 0 0 0 18 41 Z" fill="url(#rep-bridge)" />
        <path
          d="M11.5 41 A20.5 20.5 0 0 1 52.5 41"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeDasharray="2.4 5"
          opacity="0.85"
        />
      </svg>
      <div className="leading-none">
        <div className="text-3xl font-extrabold tracking-tight">
          <span className="text-teal-600">Retire</span>
          <span className="text-slate-900">Wiz</span>
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Australian Retirement Planner
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Section({
  title,
  children,
  allowBreak,
}: {
  title: string;
  children: React.ReactNode;
  allowBreak?: boolean;
}) {
  return (
    <section className={`mt-6 first:mt-0 ${allowBreak ? "" : "break-inside-avoid"}`}>
      <h2 className="mb-3 border-b border-slate-200 pb-1.5 text-sm font-bold uppercase tracking-wide text-slate-700">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Introductory / explanatory paragraph shown under a section heading. */
function Lead({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-xs leading-relaxed text-slate-600">{children}</p>;
}

export default function ReportView({
  plan,
  result,
  mc,
  config,
  name,
  generatedAt,
}: {
  plan: RetirementPlan;
  result: SimResult;
  mc: MonteCarloResult;
  config: EngineConfig;
  name: string;
  generatedAt: string;
}) {
  const goal = retirementGoal(plan);
  const successPct = Math.round(mc.successRate * 100);
  const wageInfl = plan.inflation + (config.livingStandardsGrowthPct ?? 0);
  const people = plan.people;
  const mtg = plan.mortgage;
  const props = getInvestmentProperties(plan);

  const staged = plan.spendingMode === "stages";
  const stg = plan.spendingStages;
  const stageColor: Record<string, string> = { "Go-go": "#0d9488", "Slow-go": "#d97706", "No-go": "#7c3aed", Retirement: "#0d9488" };
  const bands: SpendingBand[] | undefined = staged
    ? [
        { x1: plan.retirementAge, x2: stg.slowGoAge, label: "Go-go Years", fill: "#0d9488" },
        { x1: stg.slowGoAge, x2: stg.noGoAge, label: "Slow-go Years", fill: "#d97706" },
        { x1: stg.noGoAge, x2: plan.lifeExpectancy, label: "No-go Years", fill: "#7c3aed" },
      ].filter((b) => b.x2 > b.x1)
    : undefined;
  const ls = lifestageBreakdown(plan, config);

  // Per-category budget breakdown for the report, below the spending table.
  // When the user has built a budget we show their own category amounts;
  // otherwise we fall back to the ASFA Retirement Standard category shares,
  // scaled so the essential/discretionary subtotals match the lifestage table's
  // essentials and go-go discretionary (so the two tables stay consistent).
  const budgetEstimated = !plan.budget;
  const budgetRows = (() => {
    if (plan.budget) {
      const cats = plan.budget.categories;
      return BUDGET_CATEGORY_META.map((m) => ({ key: m.key, label: m.label, essential: m.essential, annual: cats[m.key] ?? 0 })).filter((r) => r.annual > 0);
    }
    const hh = plan.household === "couple" ? "couple" : "single";
    const asfaByKey = new Map(config.asfa.breakdown.categories.map((a) => [a.key, a.comfortable[hh]]));
    const raw = BUDGET_CATEGORY_META.map((m) => ({ key: m.key, label: m.label, essential: m.essential, base: asfaByKey.get(m.key) ?? 0 }));
    const rawEss = raw.filter((r) => r.essential).reduce((s, r) => s + r.base, 0);
    const rawDisc = raw.filter((r) => !r.essential).reduce((s, r) => s + r.base, 0);
    const essTarget = ls.essentials;
    const discTarget = Math.max(0, ls.rows[0]?.discretionary ?? 0);
    return raw
      .map((r) => ({
        key: r.key,
        label: r.label,
        essential: r.essential,
        annual: r.essential
          ? rawEss > 0 ? (r.base * essTarget) / rawEss : 0
          : rawDisc > 0 ? (r.base * discTarget) / rawDisc : 0,
      }))
      .filter((r) => r.annual > 0);
  })();
  const essRows = budgetRows.filter((r) => r.essential);
  const discRows = budgetRows.filter((r) => !r.essential);
  const essTotal = essRows.reduce((s, r) => s + r.annual, 0);
  const discTotal = discRows.reduce((s, r) => s + r.annual, 0);

  const inputs: { label: string; value: string }[] = [
    { label: "Household", value: plan.household === "couple" ? "Couple" : "Single" },
    ...people.map((p, i) => ({
      label: people.length > 1 ? `Person ${i + 1}` : "You",
      value: `age ${p.currentAge}, super ${money(p.superBalance)}, salary ${money(p.salary)}/yr`,
    })),
    { label: "Outside super", value: `${money(plan.outsideSuper)} + ${money(plan.annualOutsideSavings)}/yr` },
    { label: "Home", value: plan.homeowner ? "Homeowner" : "Renting" },
    {
      label: "Retirement age",
      value: hasStaggeredRetirement(plan)
        ? `${plan.retirementAge} (you) & ${personRetirementAge(plan, 1)} (partner)`
        : `${plan.retirementAge}`,
    },
    {
      label: "Investment return",
      value:
        plan.outsideReturn != null && plan.outsideReturn !== plan.investmentReturn
          ? `${plan.investmentReturn}% super · ${plan.outsideReturn}% outside (nominal, before fees)`
          : `${plan.investmentReturn}% p.a. (nominal, before fees)`,
    },
    { label: "Inflation (CPI)", value: `${plan.inflation}% — pre-retirement deflator ${wageInfl}% (wage)` },
    {
      label: "Spending goal",
      value: plan.spendingMode === "stages" ? "staged (declining phases)" : `${money(plan.targetSpending)}/yr flat`,
    },
    { label: "Plan until age", value: `${plan.lifeExpectancy}` },
  ];
  if (plan.home) {
    inputs.push({
      label: "Home (exempt)",
      value: `${money(plan.home.value)} value${mtg ? `, ${money(mtg.balance)} loan` : ", owned outright"}`,
    });
  }
  if (mtg) {
    inputs.push({
      label: "Home loan",
      value: `${mtg.type === "interest_only" ? "Interest-only" : "P&I"} ${money(mtg.balance)} @ ${mtg.interestRate}% (${mtg.strategy.replace(/_/g, " ")})`,
    });
  }
  props.forEach((pr, i) => {
    inputs.push({
      label: pr.name?.trim() || (props.length > 1 ? `Investment property ${i + 1}` : "Investment property"),
      value: `${money(pr.value)} value, ${money(pr.loanBalance)} loan, ${pr.grossYield}% yield (${pr.strategy})`,
    });
  });

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          .no-print { display: none !important; }
          html, body { background: #fff !important; }
        }
        .report { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>

      {/* Toolbar — screen only */}
      <div className="no-print mx-auto mb-4 flex w-full max-w-[820px] items-center justify-between px-6">
        <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-900">
          ← Back to planner
        </Link>
        <button
          onClick={() => {
            track("Report printed");
            window.print();
          }}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
        >
          Download / Print PDF
        </button>
      </div>

      <div className="report mx-auto w-full max-w-[820px] bg-white p-8 text-slate-800 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <BrandMark />
          <div className="text-right text-xs text-slate-500">
            <div className="text-base font-bold text-slate-900">Retirement Plan Report</div>
            <div className="mt-0.5 font-medium text-slate-700">What-If Scenario: {name}</div>
            <div>Generated {generatedAt}</div>
            <div>All figures in today&apos;s dollars · FY{config.financialYear} rules</div>
          </div>
        </div>

        {/* ───────── PAGE 1: Your inputs · Summary · Balance over time ───────── */}
        <Section title="Your inputs">
          <Lead>
            Everything below drives this report — change any of it in the planner
            and regenerate.
          </Lead>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-0 text-xs sm:grid-cols-2">
            {inputs.map((it) => (
              <div key={it.label} className="flex justify-between gap-4 border-b border-slate-100 py-0.5">
                <dt className="text-slate-500">{it.label}</dt>
                <dd className="text-right font-medium text-slate-800">{it.value}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Summary">
          <Lead>
            The four headline results of your plan, all in today&apos;s dollars:
            the super you&apos;re projected to hold at retirement, the yearly income
            the plan targets, how long your money lasts (with the probability it
            funds the whole plan), and when the Age Pension starts.
          </Lead>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Super at retirement" value={money(result.superAtRetirement)} sub={`at age ${result.retirementAge}`} />
            <Stat label="Retirement income goal" value={`${money(goal.total)}/yr`} sub={goal.loanKind !== "none" ? "includes home-loan costs" : "living costs"} />
            <Stat
              label="Money lasts"
              value={result.lastsToLifeExpectancy ? `to ${plan.lifeExpectancy}+` : `to age ${result.depletedAge}`}
              sub={`${successPct}% likely (Monte Carlo)`}
            />
            <Stat
              label="Age Pension from"
              value={result.firstAgePensionAge === null ? "—" : `age ${result.firstAgePensionAge}`}
              sub={result.firstAgePensionAge === null ? "not eligible" : "means-tested"}
            />
          </div>
        </Section>

        <Section title="Balance over time">
          <Lead>
            Total savings year by year — super (green) stacked on savings outside
            super (blue): they build through your working years, peak near
            retirement, then draw down. Dashed markers show retirement and Age
            Pension age
            {bands ? "; shaded bands mark the go-go / slow-go / no-go stages" : ""}.
            {result.lastsToLifeExpectancy
              ? " Your balance lasts the whole plan."
              : ` The “Depletes” marker is where savings run out (${result.depletedAge}).`}
          </Lead>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <RetirementChart result={result} bands={bands} animate={false} height={200} wageInflationPct={wageInfl} cpiPct={plan.inflation} ages={ageGapInfo(plan)} />
          </div>
        </Section>

        {/* ───────── PAGE 2: Income sources · Lifestages ───────── */}
        <div className="break-before-page">
          <Section title="Income sources">
            <Lead>
              Your income across the whole plan: your take-home pay while working
              (yellow)
              {hasStaggeredRetirement(plan)
                ? " — including a still-working partner's pay into early retirement, since you retire at different ages —"
                : ","}{" "}
              then in retirement, tax-free super drawdowns (green), withdrawals
              from outside super (blue), any net property rent (orange), and from
              Age Pension age the means-tested Age Pension (purple). As assets draw
              down, the pension typically grows to fill the gap.
            </Lead>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <IncomeChart result={result} animate={false} height={175} ages={ageGapInfo(plan)} />
            </div>
          </Section>

          {ls.rows.length > 0 && (
            <Section title={ls.staged ? "Retirement lifestages" : "Retirement spending"}>
              <Lead>
                {ls.staged
                  ? "Your spending follows the retirement “spending smile” — essentials stay flat while discretionary (travel, dining, hobbies) tapers with age; any home-loan cost sits on top."
                  : "Your flat retirement income, split into essentials, discretionary spending and any home-loan cost. (Switch to staged spending in the planner to model the go-go / slow-go / no-go “spending smile”.)"}
              </Lead>
              <table className="w-full border-collapse text-right text-xs tabular-nums">
                <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-300">
                    <th className="py-0.5 text-left">{ls.staged ? "Stage" : "Period"}</th>
                    <th className="text-left">Ages</th>
                    <th>Essentials</th>
                    <th>Discretionary</th>
                    <th>Home loan</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ls.rows.map((r) => (
                    <tr key={r.key} className="border-b border-slate-100">
                      <td className="py-0.5 text-left font-medium text-slate-700">
                        <span
                          className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                          style={{ background: stageColor[r.key] }}
                        />
                        {r.key === "Retirement" ? "All retirement" : `${r.key} Years`}
                      </td>
                      <td className="text-left text-slate-500">{r.ageFrom}–{r.ageTo}</td>
                      <td>{money(r.essentials)}</td>
                      <td>{money(r.discretionary)}</td>
                      <td>{r.loan > 0 ? money(r.loan) : "—"}</td>
                      <td className="font-medium">{money(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-500">
                {ls.estimated
                  ? "Essential/discretionary split estimated from the ASFA Retirement Standard — build a budget for your own category amounts."
                  : "Essential/discretionary split from your budget."}
                {ls.goal.loanKind === "pi" && ls.goal.payoffAge
                  ? ` The home loan clears at age ${ls.goal.payoffAge}.`
                  : ls.goal.loanKind === "io"
                    ? " The interest-only loan continues for life."
                    : ""}
              </p>
            </Section>
          )}

          {budgetRows.length > 0 && (
            <Section title={budgetEstimated ? "Estimated monthly budget by category" : "Your monthly budget by category"}>
              <Lead>
                {budgetEstimated
                  ? "You haven't built a detailed budget, so these are the ASFA Retirement Standard category amounts scaled to your plan's spending, shown per month. "
                  : "The category amounts behind your budget, at the full (go-go) level and shown per month. "}
                {ls.staged
                  ? "Essentials hold steady through retirement; discretionary spending tapers in the slow-go and no-go years (see the table above)."
                  : "This is your flat retirement budget."}
              </Lead>
              <table className="w-full border-collapse text-right text-xs tabular-nums">
                <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-300">
                    <th className="py-0.5 text-left">Category</th>
                    <th>Per month</th>
                    <th>Per year</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-50">
                    <td className="py-0.5 text-left font-semibold text-slate-700" colSpan={3}>
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#0ea5e9" }} />
                      Essentials
                    </td>
                  </tr>
                  {essRows.map((r) => (
                    <tr key={r.key} className="border-b border-slate-100">
                      <td className="py-0.5 pl-4 text-left text-slate-700">{r.label}</td>
                      <td>{money(r.annual / 12)}</td>
                      <td className="text-slate-500">{money(r.annual)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-slate-200">
                    <td className="py-0.5 pl-4 text-left font-medium text-slate-600">Essentials subtotal</td>
                    <td className="font-medium">{money(essTotal / 12)}</td>
                    <td className="text-slate-500">{money(essTotal)}</td>
                  </tr>
                  <tr className="bg-slate-50">
                    <td className="py-0.5 text-left font-semibold text-slate-700" colSpan={3}>
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#f472b6" }} />
                      Discretionary
                    </td>
                  </tr>
                  {discRows.map((r) => (
                    <tr key={r.key} className="border-b border-slate-100">
                      <td className="py-0.5 pl-4 text-left text-slate-700">{r.label}</td>
                      <td>{money(r.annual / 12)}</td>
                      <td className="text-slate-500">{money(r.annual)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-slate-200">
                    <td className="py-0.5 pl-4 text-left font-medium text-slate-600">Discretionary subtotal</td>
                    <td className="font-medium">{money(discTotal / 12)}</td>
                    <td className="text-slate-500">{money(discTotal)}</td>
                  </tr>
                  <tr className="border-t-2 border-slate-300">
                    <td className="py-0.5 text-left font-bold text-slate-800">Total budget</td>
                    <td className="font-bold text-slate-800">{money((essTotal + discTotal) / 12)}</td>
                    <td className="font-medium text-slate-600">{money(essTotal + discTotal)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-500">
                {budgetEstimated
                  ? "Estimated from the ASFA Retirement Standard (comfortable) and scaled to your plan — build a budget in the planner for your own category amounts."
                  : `Household-level amounts you set in the budget builder${plan.household === "couple" ? " (combined for the couple)" : ""}.`}{" "}
                Any home-loan cost is shown separately in the spending table above, not here.
              </p>
            </Section>
          )}
        </div>

        {/* ───────── PAGE 3: Range of outcomes · How the numbers are calculated ───────── */}
        <div className="break-before-page">
          <Section title={`Range of outcomes — ${successPct}% of simulations fund the whole plan`}>
            <Lead>
              Real markets are volatile, and a poor run of returns early in
              retirement does outsized damage (&ldquo;sequencing risk&rdquo;). Across{" "}
              {mc.iterations.toLocaleString()} random return sequences, the line is
              the median outcome and the band the 10th–90th percentile.
            </Lead>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <FanChart fan={mc.fan} retirementAge={result.retirementAge} agePensionAge={result.agePensionAge} height={108} ages={ageGapInfo(plan)} />
            </div>
          </Section>

          <Section title="How the key numbers are calculated">
            <Lead>
              Every headline figure comes from transparent, auditable formulas — the
              same ones used to independently verify the engine.
            </Lead>
            <ReportExplainers plan={plan} config={config} result={result} mc={mc} />
          </Section>
        </div>

        {/* ───────── PAGE 4: Year-by-year projection · Assumptions ───────── */}
        <div className="break-before-page">
          <Section title="Year-by-year projection" allowBreak>
            <table className="w-full border-collapse text-right text-[10px] leading-tight tabular-nums">
              <thead className="text-[9px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-300">
                  <th className="py-0.5 text-left">Age</th>
                  <th className="text-left">Phase</th>
                  <th>Super</th>
                  <th>Outside</th>
                  <th>Total</th>
                  <th>Age Pension</th>
                  <th>Drawdown</th>
                  <th>Spending</th>
                  <th className="text-center">Funded</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => {
                  const drawdown = r.superDrawn + r.outsideDrawn;
                  const retired = r.phase !== "accumulation";
                  return (
                    <tr key={r.age} className="break-inside-avoid border-b border-slate-100">
                      <td className="text-left font-medium text-slate-700">{r.age}</td>
                      <td className="text-left capitalize text-slate-500">{r.phase}</td>
                      <td>{money(r.totalSuper)}</td>
                      <td>{money(r.outside)}</td>
                      <td className="font-medium">{money(r.total)}</td>
                      <td>{retired ? money(r.agePension) : "—"}</td>
                      <td>{retired ? money(drawdown) : "—"}</td>
                      <td>{retired ? money(r.spending) : "—"}</td>
                      <td className="text-center">{!retired ? "" : r.funded ? "✓" : "⚠"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>

          <Section title="Assumptions, limitations & important information" allowBreak>
            <p className="text-xs text-slate-700">
              <strong>General information only — not financial advice.</strong> This
              superannuation forecast is provided under ASIC Corporations
              (Superannuation Calculators and Retirement Estimates) Instrument
              2022/603 and prepared in line with ASIC Regulatory Guide 276. It does
              not consider your objectives, financial situation or needs, and does
              not promote any financial product. Figures are estimates and not a
              guarantee of future outcomes.
            </p>
            <div className="mt-3 grid gap-4 text-xs text-slate-600 sm:grid-cols-2">
              <div>
                <h3 className="mb-1 font-semibold text-slate-700">Key assumptions</h3>
                <ul className="list-disc space-y-1 pl-4">
                  <li>
                    Two-stage deflation to today&apos;s dollars: pre-retirement by
                    wage inflation {wageInfl}% (CPI {plan.inflation}% + {config.livingStandardsGrowthPct ?? 0}%
                    living standards), retirement by CPI {plan.inflation}%. The
                    balance at retirement and every figure after it are shown in
                    CPI dollars.
                  </li>
                  <li>Investment return {plan.investmentReturn}% p.a. (nominal); applied net of the deflator.</li>
                  <li>
                    Super Guarantee {(config.sgRate * 100).toFixed(0)}%, {(config.contributionsTax * 100).toFixed(0)}% contributions tax,
                    {" "}{(config.superEarningsTaxAccumulation * 100).toFixed(0)}% earnings tax; preservation age {config.preservationAge}.
                  </li>
                  <li>Age Pension from {config.agePensionAge}, lower of income/assets tests; deeming {(config.deeming.lowerRate * 100).toFixed(2)}%/{(config.deeming.upperRate * 100).toFixed(2)}%.</li>
                </ul>
              </div>
              <div>
                <h3 className="mb-1 font-semibold text-slate-700">Significant limitations</h3>
                <ul className="list-disc space-y-1 pl-4">
                  <li>Super fees (admin + investment %, a fixed member fee and any insurance) are deducted using default figures — real fees vary by fund.</li>
                  <li>Transfer Balance Cap is treated simply; CGT and interest-only loans are approximations.</li>
                  <li>Excludes aged-care costs, one-off spending, and future changes to rates or law.</li>
                </ul>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Before making any financial decision, consider obtaining advice from
              an Australian Financial Services (AFS) licensee and read the relevant
              Product Disclosure Statement. Report generated by RetireWiz on {generatedAt}.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
