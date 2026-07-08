"use client";

import { fmtCurrency } from "@/lib/au/format";
import { mortgageAnnualCost } from "@/lib/au/mortgage";
import { rowWithdrawalRate, withdrawalBand } from "@/lib/au/withdrawal";
import type { RetirementPlan, YearRow } from "@/lib/au/types";

const WR_TONE: Record<"accent" | "amber" | "red", string> = {
  accent: "text-emerald-400",
  amber: "text-amber-400",
  red: "text-red-400",
};

const PHASE_LABEL: Record<string, string> = {
  accumulation: "still working",
  bridge: "retired — living off savings before super unlocks",
  drawdown: "retired — drawing super, before the Age Pension",
  pension: "retired — Age Pension age",
};

const money = (n: number) =>
  n < 0 ? `−${fmtCurrency(Math.round(-n))}` : `+${fmtCurrency(Math.round(n))}`;

function Line({
  label,
  sub,
  value,
  tone = "text-slate-200",
}: {
  label: string;
  sub?: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-1.5 last:border-0">
      <span className="text-sm text-slate-200">
        {label}
        {sub && <span className="mt-0.5 block text-[11px] text-muted">{sub}</span>}
      </span>
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="rounded-xl border border-line bg-panel px-3 py-1">{children}</div>
    </section>
  );
}

export default function YearDetailModal({
  row,
  plan,
  onClose,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: {
  row: YearRow;
  plan: RetirementPlan;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  const b = row.breakdown;
  const openingTotal = b.openingSuper + b.openingOutside;
  const closingTotal = b.closingSuper + b.closingOutside;
  const growth = b.superGrowth + b.outsideGrowth;
  const netChange = closingTotal - openingTotal;
  const isWorking = row.phase === "accumulation";
  const spending = b.livingSpend + b.rentCost + b.mortgageCost;
  // This year's super withdrawal rate (share of the balance drawn).
  const wr = !isWorking && row.superDrawn > 0 && row.totalSuper > 0 ? rowWithdrawalRate(row) : null;

  // Split what funded spending: external income, then super and outside savings.
  // A minimum-drawdown surplus is drawn from super but reinvested outside, so the
  // super figure here is only the part that actually funded spending.
  const external = b.agePension + Math.max(0, b.rentIncome) + row.workIncome;
  const privateNeed = Math.max(0, spending - external);
  const drawnFromSuper = Math.max(0, Math.min(row.superDrawn, privateNeed));
  const drawnFromOutside = Math.max(0, row.outsideDrawn);
  const superSurplus = Math.max(0, row.superDrawn - drawnFromSuper);
  const shortfall = Math.max(0, spending - external - drawnFromSuper - drawnFromOutside);

  const fundingParts: string[] = [];
  if (b.agePension > 0) fundingParts.push(`Age Pension ${fmtCurrency(Math.round(b.agePension))}`);
  if (b.rentIncome > 0) fundingParts.push(`net rent ${fmtCurrency(Math.round(b.rentIncome))}`);
  if (row.workIncome > 0) fundingParts.push(`part-time work ${fmtCurrency(Math.round(row.workIncome))}`);
  if (drawnFromSuper > 1) fundingParts.push(`${fmtCurrency(Math.round(drawnFromSuper))} from super`);
  if (drawnFromOutside > 1) fundingParts.push(`${fmtCurrency(Math.round(drawnFromOutside))} from outside savings`);
  const fundingText = fundingParts.length
    ? fundingParts.join(", ").replace(/, ([^,]*)$/, " and $1")
    : "income alone";

  // Show the deflation math behind a home-loan repayment: a fixed nominal amount
  // divided by (1 + inflation)^years to express it in today's dollars.
  let mortgageSub: string | undefined;
  if (plan.mortgage && b.mortgageCost > 0) {
    const nominal = Math.round(mortgageAnnualCost(plan.mortgage));
    const startOldest = Math.max(...plan.people.map((p) => p.currentAge));
    const yrs = row.age - startOldest;
    mortgageSub =
      yrs > 0
        ? `${fmtCurrency(nominal)}/yr fixed ÷ (1 + ${plan.inflation}%)^${yrs} = ${fmtCurrency(Math.round(b.mortgageCost))} in today's dollars`
        : `${fmtCurrency(nominal)}/yr fixed (nothing to erode yet)`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-accent">
              Year breakdown
            </div>
            <h2 className="mt-0.5 text-lg font-bold text-white">
              Age {row.age}{" "}
              <span className="text-sm font-medium text-muted">· {PHASE_LABEL[row.phase]}</span>
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <NavBtn label="←" onClick={onPrev} disabled={!canPrev} />
            <NavBtn label="→" onClick={onNext} disabled={!canNext} />
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-muted transition hover:bg-panel-2 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {/* Opening → closing */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel-2 p-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Opening</div>
              <div className="text-lg font-bold tabular-nums text-white">{fmtCurrency(openingTotal)}</div>
              <div className="text-[11px] text-muted">
                super {fmtCurrency(b.openingSuper)} · outside {fmtCurrency(b.openingOutside)}
              </div>
            </div>
            <div className="text-xl text-muted">→</div>
            <div className="text-right">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Closing</div>
              <div className="text-lg font-bold tabular-nums text-white">{fmtCurrency(closingTotal)}</div>
              <div className={`text-[11px] font-semibold ${netChange >= 0 ? "text-accent" : "text-amber-400"}`}>
                {money(netChange)} over the year
              </div>
            </div>
          </div>

          {/* Home equity freed this year (downsize / sell-up-and-rent) */}
          {b.homeProceeds > 0 && (
            <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-slate-200">
                  {plan.home?.sellAndRent ? "Sold your home & renting" : "Downsized your home"} — equity freed
                </span>
                <span className="font-bold tabular-nums text-accent">+{fmtCurrency(Math.round(b.homeProceeds))}</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted">
                {b.homeProceedsToSuper > 0
                  ? `${fmtCurrency(Math.round(b.homeProceeds - b.homeProceedsToSuper))} into your savings and ${fmtCurrency(Math.round(b.homeProceedsToSuper))} into super (downsizer) — which is why your balance steps up this year.`
                  : "Into your savings (outside super) — which is why your balance steps up this year."}
                {plan.home?.sellAndRent
                  ? " You're now a renter: higher Age Pension asset thresholds, with rent included in your living costs."
                  : " Your home stays exempt from the Age Pension."}
              </p>
            </div>
          )}

          {/* Money in */}
          <Section title="Money in — income & how it was earned">
            <Line
              label="Investment growth"
              sub={`super ${fmtCurrency(b.superGrowth)} · outside ${fmtCurrency(b.outsideGrowth)} (real, after inflation)`}
              value={money(growth)}
              tone="text-emerald-400"
            />
            {b.fees > 0 && (
              <Line
                label="Super fees"
                sub="fixed admin + insurance (the % investment fee is already netted from the growth above)"
                value={money(-b.fees)}
                tone="text-amber-400"
              />
            )}
            {isWorking && (
              <>
                <Line
                  label="Super contributions"
                  sub={`${fmtCurrency(b.contribGross)} employer + salary sacrifice, less 15% tax`}
                  value={money(b.contribNet)}
                  tone="text-emerald-400"
                />
                <Line label="Savings added" value={money(b.savings)} tone="text-emerald-400" />
              </>
            )}
            {!isWorking && b.agePension > 0 && (
              <Line label="Age Pension" value={money(b.agePension)} tone="text-emerald-400" />
            )}
            {!isWorking && b.rentIncome !== 0 && (
              <Line
                label="Net rent (investment property)"
                sub="rent after costs & loan interest"
                value={money(b.rentIncome)}
                tone={b.rentIncome < 0 ? "text-amber-400" : "text-emerald-400"}
              />
            )}
            {b.propertyProceeds > 0 && (
              <Line
                label="Property sale (net proceeds)"
                sub={`after clearing the loan and ${fmtCurrency(b.propertyCgt)} capital gains tax`}
                value={money(b.propertyProceeds)}
                tone="text-emerald-400"
              />
            )}
          </Section>

          {/* Money out */}
          {!isWorking && (spending > 0 || b.mortgageCleared > 0) && (
            <Section title="Money out — spending">
              {b.livingSpend > 0 && (
                <Line label="Living costs" value={money(-b.livingSpend)} tone="text-amber-400" />
              )}
              {b.rentCost > 0 && (
                <Line label="Rent" sub="renting after selling your home" value={money(-b.rentCost)} tone="text-amber-400" />
              )}
              {b.mortgageCost > 0 && (
                <Line
                  label="Home-loan repayment"
                  sub={mortgageSub}
                  value={money(-b.mortgageCost)}
                  tone="text-amber-400"
                />
              )}
              {b.mortgageCleared > 0 && (
                <Line
                  label="Cleared the home loan"
                  sub="one-off lump sum from super"
                  value={money(-b.mortgageCleared)}
                  tone="text-amber-400"
                />
              )}
            </Section>
          )}

          {/* How spending was funded */}
          {!isWorking && spending > 0 && (
            <div className="rounded-xl border border-line bg-panel-2 px-4 py-3 text-xs text-muted">
              <span className="text-slate-200">{fmtCurrency(spending)}/yr of spending</span> funded by{" "}
              {fundingText}.
              {wr !== null && (
                <div className="mt-1">
                  Withdrawal rate:{" "}
                  <span className={`font-semibold ${WR_TONE[withdrawalBand(wr).tone]}`}>
                    {(wr * 100).toFixed(1)}% of super
                  </span>{" "}
                  ({fmtCurrency(row.superDrawn)} of {fmtCurrency(row.totalSuper)}, {withdrawalBand(wr).label}).
                </div>
              )}
              {superSurplus > 1 && (
                <div className="mt-1">
                  Minimum drawdown pulled {fmtCurrency(Math.round(superSurplus))} more from super than you needed — the surplus is reinvested into your outside savings.
                </div>
              )}
              {shortfall > 1 && (
                <div className="mt-1 font-semibold text-amber-400">
                  ⚠ Savings couldn&apos;t cover it — short {fmtCurrency(shortfall)} this year.
                </div>
              )}
            </div>
          )}

          {/* Tax */}
          {(b.contribTax > 0 || b.earningsTax > 0 || b.propertyCgt > 0) && (
            <Section title="Tax this year">
              {b.contribTax > 0 && (
                <Line label="Contributions tax (15% on concessional)" value={fmtCurrency(Math.round(b.contribTax))} />
              )}
              {b.earningsTax > 0 && (
                <Line label="Super earnings tax (accumulation)" value={fmtCurrency(Math.round(b.earningsTax))} />
              )}
              {b.propertyCgt > 0 && (
                <Line label="Capital gains tax (property sale)" value={fmtCurrency(Math.round(b.propertyCgt))} />
              )}
              {!isWorking && b.propertyCgt === 0 && (
                <Line label="Super & pension income" value="tax-free" tone="text-emerald-400" />
              )}
            </Section>
          )}
          {!isWorking && b.propertyCgt === 0 && b.contribTax === 0 && b.earningsTax === 0 && (
            <p className="text-center text-xs text-muted">
              No tax this year — super drawdowns and the Age Pension are tax-free from age 60.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-line px-6 py-3 text-[11px] text-muted">
          Today&apos;s dollars. Balances are start-of-year; income in − spending out reconciles to
          next year&apos;s opening.
        </div>
      </div>
    </div>
  );
}

function NavBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg px-2 py-1.5 text-sm text-muted transition hover:bg-panel-2 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
    >
      {label}
    </button>
  );
}
