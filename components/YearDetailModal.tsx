"use client";

import { fmtCurrency } from "@/lib/au/format";
import { mortgageAnnualCost } from "@/lib/au/mortgage";
import { rowWithdrawalRate, withdrawalBand } from "@/lib/au/withdrawal";
import { yearFlow } from "@/lib/au/yearFlow";
import { rowNetWorth } from "@/lib/au/networth";
import { personRetirementOffset, type RetirementPlan, type YearRow } from "@/lib/au/types";

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
  nextRow,
  view = "savings",
  onClose,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: {
  row: YearRow;
  plan: RetirementPlan;
  // The following year's row, so a net-worth view can compute the change in
  // illiquid home/property equity (start-of-next-year = end-of-this-year).
  nextRow?: YearRow;
  // Which chart opened this: "savings" (super + outside) or "networth" (also
  // home + property). The headline and waterfall match that chart's total.
  view?: "savings" | "networth";
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  const b = row.breakdown;
  // Signed drivers that sum EXACTLY from opening to closing (the savings waterfall).
  const flow = yearFlow(row);
  // Net worth = these savings PLUS illiquid home/property equity. Use the shared
  // rowNetWorth so the modal's total can't drift from the chart's total (it also
  // bridges a property sale's proceeds the same way the chart does).
  const isNetWorth = view === "networth";
  const nwHome = Math.max(0, row.homeEquity ?? 0);
  const nwProp = Math.max(0, (row.propertyEquity ?? 0) + (b.propertyProceeds ?? 0));
  const nwTotal = rowNetWorth(row); // = flow.opening + nwHome + nwProp
  // Net worth at year end = the next year's start (or held flat on the final row).
  // The home/property change is whatever isn't explained by the savings drivers.
  const nwClosing = nextRow ? rowNetWorth(nextRow) : nwTotal;
  const homePropChange = nwClosing - nwTotal - flow.net;
  // The waterfall shown — savings or net worth — matching the chart clicked.
  const wf = {
    title: isNetWorth ? "How your net worth changed" : "How your savings changed",
    openingLabel: isNetWorth ? "Opening net worth" : "Opening balance",
    closingLabel: isNetWorth ? "Closing net worth" : "Closing balance",
    opening: isNetWorth ? nwTotal : flow.opening,
    closing: isNetWorth ? nwClosing : flow.closing,
    sub: isNetWorth
      ? `super ${fmtCurrency(b.openingSuper)} · outside ${fmtCurrency(b.openingOutside)}` +
        `${nwHome > 0 ? ` · home ${fmtCurrency(nwHome)}` : ""}${nwProp > 0 ? ` · property ${fmtCurrency(nwProp)}` : ""}`
      : `super ${fmtCurrency(b.openingSuper)} · outside ${fmtCurrency(b.openingOutside)}`,
    lines:
      isNetWorth && Math.abs(homePropChange) > 0.5
        ? [...flow.lines, { key: "homeprop", label: "Home & property value change", amount: homePropChange }]
        : flow.lines,
  };
  const wfNet = wf.closing - wf.opening;
  const flowSub = (key: string, amount: number): string | undefined => {
    switch (key) {
      case "growth":
        return `super ${fmtCurrency(b.superGrowth)} · outside ${fmtCurrency(b.outsideGrowth)}, after inflation`;
      case "fees":
        return "fixed admin + insurance (the % investment fee is already in the growth)";
      case "contrib":
        return `${fmtCurrency(b.contribGross)} in (employer + salary sacrifice), less 15% tax`;
      case "savings":
        return "added to your outside-super investments";
      case "funding":
        return amount >= 0
          ? "income beyond your spending, kept in savings"
          : "your spending, less the Age Pension and any other income";
      case "proceeds":
        return "home downsize or property sale, net of costs";
      case "loan":
        return "one-off lump sum from super";
      case "lumpSum":
        return "a one-off tax-free withdrawal from super, spent this year";
      case "outsideTax":
        return "on outside-super earnings (super's pension earnings are tax-free)";
      case "homeprop":
        return "your home and any investment property, tracking property prices";
      case "other":
        return "property CGT timing and rounding";
      default:
        return undefined;
    }
  };
  const isWorking = row.phase === "accumulation";
  // Staggered-retirement "gap" year: the household is retired but a partner is
  // still working — their salary sits on the retirement row (salaryIncome/takeHome),
  // and their super keeps growing from contributions.
  const partnerStillWorking = !isWorking && b.salaryIncome > 1;
  // Name the ages behind a staggered "gap" year, so it's clear WHY someone's still
  // working: the chart plots the OLDER partner's age, so at (say) "Age 60" the
  // younger partner may only be 57 — below their own retirement age. Each person's
  // age this row = their current age + years elapsed (row.age − the oldest's age).
  const stillWorkingSubtitle = (() => {
    if (!partnerStillWorking) return null;
    const startOldest = Math.max(...plan.people.map((p) => p.currentAge));
    const t = row.age - startOldest;
    const ages = plan.people.map((p) => p.currentAge + t);
    const offsets = plan.people.map((_, i) => personRetirementOffset(plan, i));
    const workingAges = ages.filter((_, i) => t < offsets[i]);
    const retiredAges = ages.filter((_, i) => t >= offsets[i]);
    if (workingAges.length === 1 && retiredAges.length === 1) {
      return `one retired at ${retiredAges[0]}, the other still working at ${workingAges[0]}`;
    }
    return "one partner still working, one retired";
  })();
  const spending = b.livingSpend + b.rentCost + b.mortgageCost;
  // This year's super withdrawal rate (share of the balance drawn).
  const wr = !isWorking && row.superDrawn > 0 && row.totalSuper > 0 ? rowWithdrawalRate(row) : null;

  // Split what funded spending: external income, then super and outside savings.
  // A minimum-drawdown surplus is drawn from super but reinvested outside, so the
  // super figure here is only the part that actually funded spending. A still-
  // working partner's take-home is household income too, so include it — otherwise
  // super/savings look like they must cover the whole spend (a phantom shortfall).
  const external = b.agePension + b.rentIncome + row.workIncome + b.takeHome;
  const privateNeed = Math.max(0, spending - external);
  const drawnFromSuper = Math.max(0, Math.min(row.superDrawn, privateNeed));
  const drawnFromOutside = Math.max(0, row.outsideDrawn);
  const superSurplus = Math.max(0, row.superDrawn - drawnFromSuper);
  const shortfall = Math.max(0, spending - external - drawnFromSuper - drawnFromOutside);
  // Income beyond spending is kept in outside super (so the pool never rises
  // unexplained). Same for a minimum-drawdown surplus (noted in the funding line).
  const savedFromIncome = Math.max(0, external - spending);

  const fundingParts: string[] = [];
  if (b.takeHome > 1) fundingParts.push(`a partner's ${fmtCurrency(Math.round(b.takeHome))} salary`);
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
              <span className="text-sm font-medium text-muted">
                · {stillWorkingSubtitle ?? PHASE_LABEL[row.phase]}
              </span>
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
          {/* Waterfall — Opening → drivers → Closing. The lines sum exactly to
              the change, so the year always ties out. */}
          <div className="rounded-xl border border-line bg-panel-2 p-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {wf.title}
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-slate-200">{wf.openingLabel}</span>
              <span className="text-base font-bold tabular-nums text-white">{fmtCurrency(wf.opening)}</span>
            </div>
            <div className="mb-1 text-[11px] text-muted">{wf.sub}</div>

            <div className="my-2 space-y-1.5 border-y border-line py-2">
              {wf.lines.map((l) => (
                <div key={l.key} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-slate-300">
                    {l.label}
                    {flowSub(l.key, l.amount) && (
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted">{flowSub(l.key, l.amount)}</span>
                    )}
                  </span>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${l.amount >= 0 ? "text-emerald-400" : "text-amber-400"}`}>
                    {money(l.amount)}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-slate-200">{wf.closingLabel}</span>
              <span className="text-right">
                <span className="text-base font-bold tabular-nums text-white">{fmtCurrency(wf.closing)}</span>
                <span className={`ml-2 text-[11px] font-semibold ${wfNet >= 0 ? "text-accent" : "text-amber-400"}`}>
                  {money(wfNet)}
                </span>
              </span>
            </div>

            {isNetWorth ? (
              <p className="mt-2 border-t border-line pt-2 text-[11px] leading-snug text-muted">
                Net worth is your <span className="text-slate-300">savings</span> (super + outside) plus
                home &amp; property equity. The spending and funding below break down the savings part.
              </p>
            ) : (
              (nwHome > 0 || nwProp > 0) && (
                <p className="mt-2 border-t border-line pt-2 text-[11px] leading-snug text-muted">
                  This tracks your <span className="text-slate-300">savings</span> (super + outside). Your
                  net worth also counts home equity ({fmtCurrency(nwHome)})
                  {nwProp > 0 ? ` and investment property (${fmtCurrency(nwProp)})` : ""} — about{" "}
                  <span className="text-slate-300">{fmtCurrency(nwTotal)}</span> all up at the start of this
                  year. Those move with property prices, so they sit outside this money flow.
                </p>
              )
            )}
          </div>

          {/* What the outside-super pool is (shown when there's a balance) */}
          {!isWorking && (b.openingOutside > 1_000 || b.closingOutside > 1_000) && (
            <p className="text-[11px] leading-snug text-muted">
              <span className="text-sky-400">Outside super</span> is savings you can draw anytime — no
              preservation age or minimum drawdown — so it bridges the years before super unlocks and
              tops up when super&apos;s minimum falls short. It&apos;s counted (deemed) by the Age Pension.
            </p>
          )}

          {b.recontribution > 0 && (
            <p className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-[11px] leading-snug text-muted">
              You recontributed <span className="font-semibold text-accent">{fmtCurrency(Math.round(b.recontribution))}</span> from
              your savings into super this year (after-tax). It&apos;s a reallocation — your total is unchanged — but its
              earnings are now tax-free inside super instead of taxed in your savings.
            </p>
          )}

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
                {plan.mortgage ? " Any remaining mortgage is discharged from the sale." : ""}
              </p>
            </div>
          )}

          {/* Money out */}
          {!isWorking && (spending > 0 || b.mortgageCleared > 0 || b.lumpSum > 0) && (
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
              {b.lumpSum > 0 && (
                <Line
                  label="Lump sum from super"
                  sub="a one-off tax-free withdrawal you spent this year"
                  value={money(-b.lumpSum)}
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
              {partnerStillWorking && savedFromIncome > 1 && (
                <> The remaining {fmtCurrency(Math.round(savedFromIncome))} of that salary stays in your savings — it&apos;s the &ldquo;income kept in savings&rdquo; line in the waterfall above.</>
              )}
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
          {(b.contribTax > 0 || b.earningsTax > 0 || b.outsideTax > 0 || b.propertyCgt > 0) && (
            <Section title="Tax this year">
              {b.contribTax > 0 && (
                <Line label="Contributions tax (15% on concessional)" value={fmtCurrency(Math.round(b.contribTax))} />
              )}
              {b.earningsTax > 0 && (
                <Line label="Super earnings tax (accumulation)" value={fmtCurrency(Math.round(b.earningsTax))} />
              )}
              {b.outsideTax > 0 && (
                <Line
                  label="Tax on savings earnings (outside super)"
                  sub="earnings on money held outside super are taxable at your marginal rate (the seniors offset, SAPTO, only applies from Age Pension age); super pension earnings are tax-free"
                  value={fmtCurrency(Math.round(b.outsideTax))}
                  tone="text-amber-400"
                />
              )}
              {b.propertyCgt > 0 && (
                <Line label="Capital gains tax (property sale)" value={fmtCurrency(Math.round(b.propertyCgt))} />
              )}
              {!isWorking && b.propertyCgt === 0 && (
                <Line label="Super & pension income" value="tax-free" tone="text-emerald-400" />
              )}
            </Section>
          )}
          {!isWorking && b.propertyCgt === 0 && b.contribTax === 0 && b.earningsTax === 0 && b.outsideTax === 0 && (
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
