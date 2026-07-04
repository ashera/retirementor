"use client";

import { fmtCurrency } from "@/lib/au/format";
import type { EngineConfig } from "@/lib/au/config";
import type { Household, RetirementPlan, YearRow } from "@/lib/au/types";

const cur = (n: number) => fmtCurrency(Math.round(n));

function deemedIncome(financial: number, household: Household, config: EngineConfig) {
  const t = household === "single" ? config.deeming.threshold.single : config.deeming.threshold.couple;
  return (
    Math.min(financial, t) * config.deeming.lowerRate +
    Math.max(0, financial - t) * config.deeming.upperRate
  );
}

function Row({
  color,
  label,
  sub,
  value,
}: {
  color: string;
  label: string;
  sub?: string;
  value: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-0">
      <span className="text-sm text-slate-200">
        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: color }} />
        {label}
        {sub && <span className="mt-0.5 block pl-[18px] text-[11px] leading-snug text-muted">{sub}</span>}
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-white">{cur(value)}</span>
    </div>
  );
}

export default function IncomeYearModal({
  row,
  plan,
  config,
  onClose,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: {
  row: YearRow;
  plan: RetirementPlan;
  config: EngineConfig;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  const retired = row.phase !== "accumulation";
  const rent = Math.max(0, row.rentIncome ?? 0);
  const pension = row.agePension;
  const fromSuper = row.superDrawn;
  const fromOutside = row.outsideDrawn;
  const total = pension + rent + fromSuper + fromOutside;
  const spend = row.spending;
  const shortfall = Math.max(0, spend - total);

  // Why is the Age Pension this amount? Re-run the two-test for this year.
  const side = plan.household === "couple" ? config.agePension.couple : config.agePension.single;
  const freeArea = plan.homeowner ? side.assetsFreeArea.homeowner : side.assetsFreeArea.nonHomeowner;
  const assetsTaper = config.agePension.assetsTaperPerDollar;
  const cutoff = freeArea + side.maxAnnual / assetsTaper;
  const financial = row.totalSuper + row.outside;
  const assessable = financial + (row.propertyEquity ?? 0);
  const income = deemedIncome(financial, plan.household, config) + rent;
  const assetsTest = Math.max(0, side.maxAnnual - Math.max(0, assessable - freeArea) * assetsTaper);
  const incomeTest = Math.max(0, side.maxAnnual - Math.max(0, income - side.incomeFreeAreaAnnual) * config.agePension.incomeTaperPerDollar);
  const binding = assetsTest <= incomeTest ? "assets" : "income";
  const belowPensionAge = row.age < config.agePensionAge;

  let pensionReason: string;
  if (belowPensionAge) pensionReason = `Not yet — the Age Pension starts at ${config.agePensionAge}.`;
  else if (pension <= 1) pensionReason = `Nil this year — your ${cur(assessable)} of assessable assets is above the ${cur(cutoff)} cut-off. As you spend down, a part pension kicks in.`;
  else if (pension >= side.maxAnnual - 1) pensionReason = `The full rate — your assets and income sit under the thresholds.`;
  else pensionReason = `A part pension — the ${binding} test is binding, tapering the ${cur(side.maxAnnual)} maximum down to this.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-accent">Retirement income</div>
            <h2 className="mt-0.5 text-lg font-bold text-white">Age {row.age}</h2>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onPrev} disabled={!canPrev} className="rounded-lg px-2 py-1.5 text-sm text-muted transition hover:bg-panel-2 hover:text-white disabled:cursor-not-allowed disabled:opacity-30">←</button>
            <button onClick={onNext} disabled={!canNext} className="rounded-lg px-2 py-1.5 text-sm text-muted transition hover:bg-panel-2 hover:text-white disabled:cursor-not-allowed disabled:opacity-30">→</button>
            <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted transition hover:bg-panel-2 hover:text-white">✕</button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {!retired ? (
            <p className="rounded-xl border border-line bg-panel-2 px-4 py-3 text-sm text-muted">
              You&apos;re still working at {row.age}, so you&apos;re not drawing a retirement
              income yet — you&apos;re building super instead. Click a year after you retire
              ({plan.retirementAge}) to see the income mix.
            </p>
          ) : (
            <>
              <div className="rounded-xl border border-line bg-panel-2 p-4 text-center">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Total income this year</div>
                <div className="text-3xl font-bold tabular-nums text-white">{cur(total)}</div>
                <div className={`mt-0.5 text-xs ${shortfall > 1 ? "text-amber-400" : "text-muted"}`}>
                  {shortfall > 1
                    ? `${cur(shortfall)} short of your ${cur(spend)} spending goal`
                    : `covering your ${cur(spend)} spending goal`}
                </div>
              </div>

              <section>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Where it comes from</h3>
                <div className="rounded-xl border border-line bg-panel px-3 py-1">
                  {(pension > 0 || row.age >= config.agePensionAge) && (
                    <Row color="#a78bfa" label="Age Pension" sub={pensionReason} value={pension} />
                  )}
                  {rent > 0 && (
                    <Row color="#fb923c" label="Net rent" sub="Actual rent from your investment property, after costs and loan interest." value={rent} />
                  )}
                  {fromSuper > 0 && (
                    <Row color="#34d399" label="From your super" sub="Drawn tax-free (you're past 60) to top up to your spending goal — at least the minimum drawdown for your age." value={fromSuper} />
                  )}
                  {fromOutside > 0 && (
                    <Row color="#38bdf8" label="From outside super" sub="Drawn from your savings outside super to cover the rest." value={fromOutside} />
                  )}
                </div>
              </section>

              <div className="rounded-xl border border-line bg-panel-2 px-4 py-3 text-xs leading-relaxed text-muted">
                Each year we draw just enough to meet your spending. The means-tested{" "}
                <span className="text-slate-200">Age Pension</span> comes first — a floor
                that <em>grows</em> as your assessable assets fall — then any rent, then
                top-ups from super and other savings. That&apos;s why the mix shifts toward
                the Age Pension later in retirement.
                {shortfall > 1 && (
                  <div className="mt-1.5 font-semibold text-amber-400">
                    ⚠ Your savings are exhausted, so your income here is just the Age Pension{rent > 0 ? " and rent" : ""} — below your target.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-line px-6 py-3 text-[11px] text-muted">
          Today&apos;s dollars · FY{config.financialYear} rules. Income is what you draw to fund spending, not investment growth.
        </div>
      </div>
    </div>
  );
}
