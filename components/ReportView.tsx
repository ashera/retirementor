"use client";

import Link from "next/link";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan, SimResult } from "@/lib/au/types";
import type { MonteCarloResult } from "@/lib/au/montecarlo";
import { retirementGoal } from "@/lib/au/goal";
import { fmtCurrency } from "@/lib/au/format";
import RetirementChart from "@/components/RetirementChart";
import IncomeChart from "@/components/IncomeChart";
import FanChart from "@/components/FanChart";
import ReportExplainers from "@/components/ReportExplainers";

const money = (n: number) => fmtCurrency(Math.round(n));

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 64 48" className="h-9 w-auto" aria-hidden>
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
        <div className="text-lg font-extrabold tracking-tight">
          <span className="text-teal-600">Retire</span>
          <span className="text-slate-900">Mentor</span>
        </div>
        <div className="mt-1 text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-500">
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 break-inside-avoid">
      <h2 className="mb-3 border-b border-slate-200 pb-1.5 text-sm font-bold uppercase tracking-wide text-slate-700">
        {title}
      </h2>
      {children}
    </section>
  );
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
  const prop = plan.investmentProperty;

  const inputs: { label: string; value: string }[] = [
    { label: "Household", value: plan.household === "couple" ? "Couple" : "Single" },
    ...people.map((p, i) => ({
      label: people.length > 1 ? `Person ${i + 1}` : "You",
      value: `age ${p.currentAge}, super ${money(p.superBalance)}, salary ${money(p.salary)}/yr`,
    })),
    { label: "Outside super", value: `${money(plan.outsideSuper)} + ${money(plan.annualOutsideSavings)}/yr` },
    { label: "Home", value: plan.homeowner ? "Homeowner" : "Renting" },
    { label: "Retirement age", value: `${plan.retirementAge}` },
    { label: "Investment return", value: `${plan.investmentReturn}% p.a. (nominal)` },
    { label: "Inflation (CPI)", value: `${plan.inflation}% — pre-retirement deflator ${wageInfl}% (wage)` },
    {
      label: "Spending goal",
      value: plan.spendingMode === "stages" ? "staged (declining phases)" : `${money(plan.targetSpending)}/yr flat`,
    },
    { label: "Plan until age", value: `${plan.lifeExpectancy}` },
  ];
  if (mtg) {
    inputs.push({
      label: "Home loan",
      value: `${mtg.type === "interest_only" ? "Interest-only" : "P&I"} ${money(mtg.balance)} @ ${mtg.interestRate}% (${mtg.strategy.replace(/_/g, " ")})`,
    });
  }
  if (prop) {
    inputs.push({
      label: "Investment property",
      value: `${money(prop.value)} value, ${money(prop.loanBalance)} loan, ${prop.grossYield}% yield (${prop.strategy})`,
    });
  }

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
          onClick={() => window.print()}
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
            <div className="mt-0.5 font-medium text-slate-700">{name}</div>
            <div>Generated {generatedAt}</div>
            <div>All figures in today&apos;s dollars · FY{config.financialYear} rules</div>
          </div>
        </div>

        {/* Summary */}
        <Section title="Summary">
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

        {/* Charts */}
        <Section title="Balance over time">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <RetirementChart result={result} animate={false} />
          </div>
        </Section>

        <Section title="Retirement income sources">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <IncomeChart result={result} animate={false} />
          </div>
        </Section>

        <Section title={`Range of outcomes — ${successPct}% of simulations fund the whole plan`}>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <FanChart fan={mc.fan} retirementAge={result.retirementAge} agePensionAge={result.agePensionAge} />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Median path with the 10th–90th percentile range, across {mc.iterations.toLocaleString()} simulated return sequences.
          </p>
        </Section>

        {/* How the numbers are calculated */}
        <Section title="How the key numbers are calculated">
          <ReportExplainers plan={plan} config={config} result={result} mc={mc} />
        </Section>

        {/* Inputs */}
        <Section title="Your inputs">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
            {inputs.map((it) => (
              <div key={it.label} className="flex justify-between gap-4 border-b border-slate-100 py-1">
                <dt className="text-slate-500">{it.label}</dt>
                <dd className="text-right font-medium text-slate-800">{it.value}</dd>
              </div>
            ))}
          </dl>
        </Section>

        {/* Year-by-year */}
        <Section title="Year-by-year projection">
          <table className="w-full border-collapse text-right text-xs tabular-nums">
            <thead className="text-[10px] uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-300">
                <th className="py-1 text-left">Age</th>
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
                    <td className="py-0.5 text-left font-medium text-slate-700">{r.age}</td>
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

        {/* Assumptions & disclosures */}
        <Section title="Assumptions, limitations & important information">
          <p className="text-sm text-slate-700">
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
                  living standards), retirement by CPI {plan.inflation}%.
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
                <li>Super fees and insurance premiums are not modelled — balances may be overstated.</li>
                <li>Division 293 (extra 15% for incomes over $250k) is not applied.</li>
                <li>Transfer Balance Cap is treated simply; CGT and interest-only loans are approximations.</li>
                <li>Excludes aged-care costs, one-off spending, and future changes to rates or law.</li>
              </ul>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Before making any financial decision, consider obtaining advice from
            an Australian Financial Services (AFS) licensee and read the relevant
            Product Disclosure Statement. Report generated by RetireMentor on {generatedAt}.
          </p>
        </Section>
      </div>
    </div>
  );
}
