"use client";

import { fmtCurrency } from "@/lib/au/format";
import { minDrawdownRate, type EngineConfig } from "@/lib/au/config";
import { getInvestmentProperties, type RetirementPlan, type YearRow } from "@/lib/au/types";
import { netRentCash, propertyValueAt } from "@/lib/au/property";

const cur = (n: number) => fmtCurrency(Math.round(n));

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

function DLine({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "font-semibold text-slate-200" : "text-muted"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{cur(value)}</span>
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
  const rentRaw = row.rentIncome ?? 0; // NEGATIVE for a geared property (a cash drain)
  const rent = Math.max(0, rentRaw); // positive net rent — also what the pension income test assesses (a loss isn't assessable)
  const rentShortfall = Math.max(0, -rentRaw);
  const pension = row.agePension;
  const fromSuper = row.superDrawn;
  const fromOutside = row.outsideDrawn;
  // The drawdown order beyond the pension minimum (see the ordered list below).
  const accumDrawn = row.breakdown.accumDrawn;
  const pensionExtraDrawn = row.breakdown.pensionExtraDrawn;
  const hasAccum = row.breakdown.accumSuper > 1; // two-pool split active (super over the cap)
  // Staggered-retirement gap year: a partner is still working, so their take-home
  // salary is household income too (on the retirement row as salaryIncome/takeHome).
  const partnerStillWorking = retired && row.salaryIncome > 1;
  const salaryTakeHome = retired ? row.breakdown.takeHome : 0;
  const spend = row.spending;
  // Spending the household must fund from savings, after income (pension, rent,
  // a still-working partner's salary). The ATO minimum can force super out beyond
  // that — the surplus is reinvested, not spent, so it isn't spendable income
  // this year. Count only the super that actually funds spending.
  const need = Math.max(0, spend - pension - rentRaw - salaryTakeHome);
  const superReinvested = Math.max(0, fromSuper - need);
  const spendableSuper = fromSuper - superReinvested;
  const total = pension + rentRaw + spendableSuper + fromOutside + salaryTakeHome;
  const shortfall = Math.max(0, spend - total);

  // Per-person salary split for a couple's working years (salary is constant in
  // today's dollars, so each person's figure is their plan salary this year).
  const couple = plan.people.length > 1;
  const oldestCurrentAge = Math.max(...plan.people.map((pp) => pp.currentAge));
  const yearsElapsed = row.age - oldestCurrentAge;
  const propsList = getInvestmentProperties(plan);
  const propertyCount = propsList.length;
  // Per-property net rent this year (same computation the engine sums into rentIncome:
  // net rent for held properties, $0 once sold). Only shown when there's more than one.
  const rentByProperty = propsList
    .map((prop, i) => ({
      name: prop.name?.trim() || `Property ${i + 1}`,
      net: prop.strategy === "sell" && row.age >= prop.sellAtAge ? 0 : netRentCash(prop, propertyValueAt(prop, yearsElapsed)),
    }))
    .filter((x) => Math.abs(x.net) > 0.5);

  // Working-year waterfall: how gross salary is reduced to take-home. Salary
  // sacrifice (concessional above compulsory SG) is pre-tax; income tax follows;
  // after-tax (non-concessional) contributions come out of the take-home. SG is
  // employer-paid on top and doesn't reduce pay.
  const sgTotal = plan.people.reduce((s, p) => s + p.salary * config.sgRate, 0);
  const salarySacrifice = Math.max(0, row.breakdown.contribGross - sgTotal);
  const taxableIncome = Math.max(0, row.salaryIncome - salarySacrifice);
  const incomeTaxAmt = Math.max(0, taxableIncome - row.takeHome);
  const afterTaxContrib = plan.people.reduce((s, p) => s + Math.min(p.voluntaryNonConcessional, config.nonConcessionalCap), 0);
  const leftToSpend = Math.max(0, row.takeHome - afterTaxContrib);
  // Label for a property line: its custom name, else "Property N" (or a lone
  // "Investment property"), matching the wizard's naming.
  const propLabel = (part: { name?: string; index: number }) =>
    part.name?.trim() || (propertyCount > 1 ? `Property ${part.index + 1}` : "Investment property");
  const rentLabel = plan.workIncome
    ? "+ Rent & part-time work (assessable)"
    : propertyCount === 1
      ? `+ ${propsList[0].name?.trim() || "Investment property"} rent (actual)`
      : "+ Combined property rent (actual)";

  // Why is the Age Pension this amount? Use the engine's actual means-test working
  // for this year (persisted on the row), so the modal matches the figure exactly.
  const pb = row.pension; // null before Age Pension age
  const side = plan.household === "couple" ? config.agePension.couple : config.agePension.single;
  const freeArea = plan.homeowner ? side.assetsFreeArea.homeowner : side.assetsFreeArea.nonHomeowner;
  const assetsTaper = config.agePension.assetsTaperPerDollar;
  const incomeTaper = config.agePension.incomeTaperPerDollar;
  const cutoff = freeArea + side.maxAnnual / assetsTaper;
  const belowPensionAge = row.age < config.agePensionAge;
  const binding = pb?.bindingTest ?? "assets";

  // Per-test working for the breakdown (from the engine's stored inputs).
  const excessAssets = pb ? Math.max(0, pb.assessableAssets - freeArea) : 0;
  const reductionAssets = excessAssets * assetsTaper;
  const incomeTotal = pb ? pb.deemedIncome + pb.otherIncome : 0;
  const excessIncome = pb ? Math.max(0, incomeTotal - side.incomeFreeAreaAnnual) : 0;
  const reductionIncome = excessIncome * incomeTaper;
  const assetsPerK = Math.round(assetsTaper * 1000); // annual reduction per $1,000 over
  const incomeCentsPerDollar = Math.round(incomeTaper * 100); // cents per $1 over

  // Why is the super draw this amount? Uses the engine's actual minimum (summed
  // per person — a couple with an age gap has different rates each).
  const privateNeed = Math.max(0, spend - pension - rentRaw - salaryTakeHome);
  const minRate = minDrawdownRate(row.age, config);
  const minDraw = row.breakdown.minDrawdown;
  const parts = row.breakdown.minDrawdownParts;
  // Outside-first drawdown: super pays its ATO minimum, outside savings cover the
  // rest, and super only draws ABOVE its minimum once savings run out.
  const superToppedUp = fromSuper > minDraw + 1; // savings exhausted → super drew beyond the minimum
  const minReinvested = superReinvested > 1; // ATO minimum exceeded the shortfall → surplus reinvested

  let pensionReason: string;
  if (belowPensionAge) pensionReason = `Not yet — the Age Pension starts at ${config.agePensionAge}.`;
  else if (pension <= 1) pensionReason = `Nil this year — your ${cur(pb?.assessableAssets ?? 0)} of assessable assets is above the ${cur(cutoff)} cut-off. As you spend down, a part pension kicks in.`;
  else if (pension >= side.maxAnnual - 1) pensionReason = `The full rate — your assets and income sit under the thresholds.`;
  else pensionReason = `A part pension — the ${binding} test is binding, tapering the ${cur(side.maxAnnual)} maximum down to this.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-accent">{!retired ? "Working income" : partnerStillWorking ? "Retirement income · a partner still working" : "Retirement income"}</div>
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
            <>
              <div className="rounded-xl border border-line bg-panel-2 p-4 text-center">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Gross salary this year</div>
                <div className="text-3xl font-bold tabular-nums text-white">{cur(row.salaryIncome)}</div>
                <div className="mt-0.5 text-xs text-muted">
                  while working — your retirement income begins at {plan.retirementAge}
                </div>
              </div>

              <section>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">From salary to take-home</h3>
                <div className="rounded-xl border border-line bg-panel px-4 py-1 text-sm">
                  <div className="flex items-baseline justify-between gap-4 py-2">
                    <span className="text-slate-200">Gross salary{couple ? " (household)" : ""}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-white">{cur(row.salaryIncome)}</span>
                  </div>
                  {couple && (
                    <div className="space-y-0.5 pb-2 pl-1 text-[11px] text-muted">
                      {plan.people.map((pp, i) => (
                        <div key={i} className="flex justify-between gap-4">
                          <span>
                            {i === 0 ? "You" : "Partner"}
                            {pp.currentAge + yearsElapsed > 0 && ` (age ${pp.currentAge + yearsElapsed})`}
                            {pp.salary <= 0 && " — not earning"}
                          </span>
                          <span className="tabular-nums text-slate-300">{cur(pp.salary)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {salarySacrifice > 0 && (
                    <div className="flex items-baseline justify-between gap-4 py-1.5">
                      <span className="text-muted">
                        Salary sacrifice
                        <span className="block text-[11px] leading-snug">before tax → into super (concessional)</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-amber-400">−{cur(salarySacrifice)}</span>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between gap-4 border-b border-line py-1.5">
                    <span className="text-muted">
                      Income tax
                      <span className="block text-[11px] leading-snug">on {cur(taxableIncome)} taxable income</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-amber-400">−{cur(incomeTaxAmt)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 py-2">
                    <span className="font-semibold text-slate-200">Take-home pay</span>
                    <span className="shrink-0 font-semibold tabular-nums text-yellow-400">{cur(row.takeHome)}</span>
                  </div>
                  {afterTaxContrib > 0 && (
                    <>
                      <div className="flex items-baseline justify-between gap-4 border-t border-line py-1.5">
                        <span className="text-muted">
                          After-tax super contributions
                          <span className="block text-[11px] leading-snug">from your take-home (non-concessional)</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-amber-400">−{cur(afterTaxContrib)}</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-4 py-1.5">
                        <span className="font-semibold text-slate-200">Left to spend &amp; save</span>
                        <span className="shrink-0 font-semibold tabular-nums text-white">{cur(leftToSpend)}</span>
                      </div>
                    </>
                  )}
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted">
                  Employer Super Guarantee ({cur(sgTotal)}) is paid on top of your salary, straight into super — it
                  doesn&apos;t come out of your pay.
                </p>
              </section>

              {(rent > 0 || rentShortfall > 0 || rentByProperty.length > 0) && (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    Investment property income
                  </h3>
                  <div className="rounded-xl border border-line bg-panel px-4 py-1">
                    {propertyCount > 1 ? (
                      rentByProperty.map((rp) => (
                        <Row key={rp.name} color="#fb923c" label={rp.name}
                          sub={rp.net < 0 ? "Geared — loan interest and costs exceed its rent (a cash cost, funded from your pay)." : "Net rent after costs and loan interest."}
                          value={rp.net} />
                      ))
                    ) : (
                      <>
                        {rent > 0 && (
                          <Row color="#fb923c" label="Net rent" sub="Rent after costs and loan interest — income on top of your salary this year." value={rent} />
                        )}
                        {rentShortfall > 0 && (
                          <Row color="#fb923c" label="Rental shortfall" sub="Your geared property's loan interest and costs exceed its rent — a cash cost this year, funded from your pay (negatively geared)." value={-rentShortfall} />
                        )}
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-muted">
                    Shown as disposable income alongside your take-home. The tool doesn&apos;t assume it&apos;s saved —
                    set your annual savings to reflect what you put away.
                  </p>
                </section>
              )}

              {(row.breakdown.contribGross > 0 || afterTaxContrib > 0 || row.breakdown.ttrBenefit !== 0 || row.breakdown.savings > 0) && (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    What you&apos;re putting away this year
                  </h3>
                  <div className="rounded-xl border border-line bg-panel px-3 py-1">
                    {row.breakdown.ttrBenefit !== 0 && (
                      <Row
                        color="#a78bfa"
                        label="Transition to Retirement — tax saved"
                        sub="Extra sacrificed via a tax-free TTR pension, so your take-home holds. This is the income tax saved (net of the 15% contributions tax) added to super."
                        value={row.breakdown.ttrBenefit}
                      />
                    )}
                    {row.breakdown.contribGross > 0 && (
                      <Row
                        color="#34d399"
                        label="Into super — concessional"
                        sub={`Employer Super Guarantee${salarySacrifice > 0 ? ` (${cur(sgTotal)}) plus ${cur(salarySacrifice)} salary sacrifice` : ""}, before the 15% contributions tax.`}
                        value={row.breakdown.contribGross}
                      />
                    )}
                    {afterTaxContrib > 0 && (
                      <Row
                        color="#22d3ee"
                        label="Into super — after-tax"
                        sub="Non-concessional contributions from your take-home (already taxed, so no 15% on the way in)."
                        value={afterTaxContrib}
                      />
                    )}
                    {row.breakdown.savings > 0 && (
                      <Row
                        color="#38bdf8"
                        label="Into savings outside super"
                        sub="Added to your outside-super investments this year."
                        value={row.breakdown.savings}
                      />
                    )}
                  </div>
                </section>
              )}

              <div className="rounded-xl border border-line bg-panel-2 px-4 py-3 text-xs leading-relaxed text-muted">
                While you&apos;re working, your income is your salary — and each year a
                slice goes into super (growing tax-advantaged) and any savings. When you
                retire at {plan.retirementAge}, that&apos;s what your income switches to
                drawing on.
              </div>
            </>
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
                  {partnerStillWorking && (
                    <Row
                      color="#fbbf24"
                      label="A partner's salary (take-home)"
                      sub="One of you is still working — their take-home pay funds most of the household's spending during the gap."
                      value={salaryTakeHome}
                    />
                  )}
                  {(pension > 0 || row.age >= config.agePensionAge) && (
                    <Row color="#a78bfa" label="Age Pension" sub={pensionReason} value={pension} />
                  )}
                  {propertyCount > 1 ? (
                    rentByProperty.map((rp) => (
                      <Row key={rp.name} color="#fb923c" label={rp.name}
                        sub={rp.net < 0 ? "Geared — loan interest and costs exceed its rent (funded from the drawdown below)." : "Net rent after costs and loan interest."}
                        value={rp.net} />
                    ))
                  ) : (
                    <>
                      {rent > 0 && (
                        <Row color="#fb923c" label="Net rent" sub="Actual rent from your investment property, after costs and loan interest." value={rent} />
                      )}
                      {rentShortfall > 0 && (
                        <Row color="#fb923c" label="Rental shortfall" sub="Your geared property's loan interest and costs exceed its rent — the difference is funded from the drawdown below." value={-rentShortfall} />
                      )}
                    </>
                  )}
                  {spendableSuper > 0 && (
                    <Row color="#34d399" label="From your super" sub="Drawn tax-free (accessible from 60) — see the working below." value={spendableSuper} />
                  )}
                  {fromOutside > 0 && (
                    <Row color="#38bdf8" label="From outside super" sub="Drawn from your savings outside super to cover the rest." value={fromOutside} />
                  )}
                </div>
              </section>

              {pb && (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    How the Age Pension is worked out
                  </h3>
                  <div className="space-y-3 rounded-xl border border-line bg-panel px-3 py-3 text-xs">
                    <p className="text-muted">
                      Services Australia runs an <span className="text-slate-200">assets test</span> and an{" "}
                      <span className="text-slate-200">income test</span>, and pays the{" "}
                      <strong className="text-white">lower</strong> of the two. The maximum for a{" "}
                      {plan.household === "couple" ? "couple" : "single"} is {cur(side.maxAnnual)}/yr.
                    </p>

                    <div className={`rounded-lg border p-2.5 ${binding === "assets" ? "border-accent/40 bg-accent/5" : "border-line"}`}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="font-semibold text-slate-200">Assets test</span>
                        {binding === "assets" && (
                          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">Binding</span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="mb-0.5 text-[11px] uppercase tracking-wide text-muted">What&apos;s counted</div>
                        <DLine label="Savings outside super" value={pb.outsideAssets} />
                        <DLine label="Super" value={pb.accessibleSuper} />
                        {pb.propertyParts.map((part) => (
                          <DLine key={part.index} label={`${propLabel(part)} (net equity)`} value={part.equity} />
                        ))}
                        <div className="border-t border-line pt-1">
                          <DLine label="= Assessable assets" value={pb.assessableAssets} strong />
                        </div>
                        <DLine label={`− Free area (${plan.homeowner ? "homeowner" : "non-homeowner"})`} value={freeArea} />
                        <div className="border-t border-line pt-1">
                          <DLine label="= Amount over the free area" value={excessAssets} strong />
                        </div>
                        <DLine label={`− Taper ($${assetsPerK}/yr per $1,000 over)`} value={reductionAssets} />
                        <div className="border-t border-line pt-1">
                          <DLine label="= Assets-test entitlement" value={pb.assetsTestAnnual} strong />
                        </div>
                      </div>
                    </div>

                    <div className={`rounded-lg border p-2.5 ${binding === "income" ? "border-accent/40 bg-accent/5" : "border-line"}`}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="font-semibold text-slate-200">Income test</span>
                        {binding === "income" && (
                          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">Binding</span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="mb-0.5 text-[11px] uppercase tracking-wide text-muted">What&apos;s counted</div>
                        <DLine label={`Deemed on ${cur(pb.financialAssets)} savings + super`} value={pb.deemedIncome} />
                        {pb.otherIncome > 0 && <DLine label={rentLabel} value={pb.otherIncome} />}
                        {pb.otherIncome > 0 && (
                          <div className="border-t border-line pt-1">
                            <DLine label="= Assessable income" value={incomeTotal} strong />
                          </div>
                        )}
                        <DLine label="− Income free area" value={side.incomeFreeAreaAnnual} />
                        <div className="border-t border-line pt-1">
                          <DLine label="= Amount over the free area" value={excessIncome} strong />
                        </div>
                        <DLine label={`− Taper (${incomeCentsPerDollar}c per $1 over)`} value={reductionIncome} />
                        <div className="border-t border-line pt-1">
                          <DLine label="= Income-test entitlement" value={pb.incomeTestAnnual} strong />
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-line pt-2 text-slate-300">
                      You&apos;re paid the <strong className="text-white">lower</strong> of the two — the{" "}
                      <strong className="text-white">{binding}</strong> test →{" "}
                      <strong className="text-accent">{cur(pension)}</strong>.
                    </div>
                    <p className="text-[11px] text-muted">
                      Deeming assumes your financial assets earn a set rate regardless of actual returns.
                      The family home isn&apos;t counted{propertyCount > 0 ? "; an investment property's equity is (but its rent is assessed as actual income, not deemed)" : ""}.
                    </p>
                  </div>
                </section>
              )}

              {fromSuper > 0 && (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    How the &ldquo;from your super&rdquo; figure is worked out
                  </h3>
                  <div className="space-y-1.5 rounded-xl border border-line bg-panel px-3 py-3 text-xs">
                    <DLine label="Your spending goal" value={spend} />
                    <DLine label="− Age Pension" value={pension} />
                    {rent > 0 && <DLine label="− Net rent" value={rent} />}
                    {salaryTakeHome > 1 && <DLine label="− A partner's salary (take-home)" value={salaryTakeHome} />}
                    <div className="border-t border-line pt-1.5">
                      <DLine label="= Shortfall to fund from savings" value={privateNeed} strong />
                    </div>
                    <div className="border-t border-line pt-1.5 text-slate-300">
                      {parts.length > 1 ? (
                        <>
                          <div className="mb-1">Minimum drawdown — a legislated minimum, set for each of you:</div>
                          <div className="space-y-0.5">
                            {parts.map((pt, i) => (
                              <div key={i} className="flex justify-between gap-4 pl-1 text-[11px] text-muted">
                                <span>
                                  {i === 0 ? "You" : "Partner"} (age {pt.age}):{" "}
                                  <strong className="text-slate-200">{(pt.rate * 100).toFixed(0)}%</strong> × {cur(pt.balance)}
                                </span>
                                <span className="tabular-nums text-slate-200">{cur(pt.amount)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between gap-4 border-t border-line pt-0.5 font-semibold text-slate-200">
                              <span>Combined minimum</span>
                              <span className="tabular-nums">{cur(minDraw)}</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          Minimum drawdown, age {parts[0]?.age ?? row.age}:{" "}
                          <strong className="text-white">{((parts[0]?.rate ?? minRate) * 100).toFixed(0)}%</strong> ×{" "}
                          {cur(parts[0]?.balance ?? row.totalSuper)} super = <strong className="text-white">{cur(minDraw)}</strong>
                        </>
                      )}
                      <div className="mt-1 text-[11px] text-muted">
                        For account-based pensions, the minimum rate steps up with age (4% under 65, rising to 14% at 95+).
                      </div>
                    </div>
                    <div className="border-t border-line pt-1.5 text-slate-300">
                      <div className="mb-1.5 text-[11px] text-muted">
                        {hasAccum
                          ? "Then the shortfall is met in a tax-aware order — most-taxed money first, the tax-free pension preserved to last:"
                          : "Then the shortfall is met in order — savings outside super first, so the tax-free pension keeps compounding:"}
                      </div>
                      {(() => {
                        const steps = [
                          { show: minDraw > 1, label: "Pension minimum (mandatory)", value: minDraw },
                          { show: fromOutside > 1, label: "Outside super — dividends taxed yearly, gains on sale (50% discount)", value: fromOutside },
                          { show: accumDrawn > 1, label: "Accumulation super — earnings taxed 15%", value: accumDrawn },
                          {
                            show: pensionExtraDrawn > 1,
                            label: hasAccum ? "Pension above the minimum — tax-free" : "Super above the minimum",
                            value: pensionExtraDrawn,
                          },
                        ].filter((s) => s.show);
                        return (
                          <div className="space-y-1">
                            {steps.map((s, i) => (
                              <div key={i} className="flex items-baseline justify-between gap-3 text-[11px]">
                                <span className="text-muted">
                                  <span className="mr-1.5 font-mono text-slate-400">{i + 1}</span>
                                  {s.label}
                                </span>
                                <span className="shrink-0 tabular-nums font-semibold text-slate-200">{cur(s.value)}</span>
                              </div>
                            ))}
                            <div className="flex items-baseline justify-between gap-3 border-t border-line pt-1 text-[11px] font-semibold">
                              <span className="text-slate-200">Total drawn from savings</span>
                              <span className="tabular-nums text-accent">{cur(fromSuper + fromOutside)}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    {minReinvested && (
                      <p className="text-[11px] text-muted">
                        The minimum is more than the shortfall, so the surplus{" "}
                        {cur(superReinvested)} is reinvested into your outside savings — not spent.
                      </p>
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted">
                    Super is accessible and tax-free from age 60 (your preservation age). Before that,
                    spending is met from savings outside super instead.
                  </p>
                </section>
              )}

              <div className="rounded-xl border border-line bg-panel-2 px-4 py-3 text-xs leading-relaxed text-muted">
                {partnerStillWorking ? (
                  <>
                    While a partner is still working, their salary covers the household&apos;s
                    spending, so little or nothing needs to come from your savings. Super must
                    still pay its <span className="text-slate-200">ATO minimum</span>, but with
                    the spending already covered that&apos;s simply reinvested. Once they retire,
                    your income switches to super, savings and the means-tested Age Pension.
                  </>
                ) : (
                  <>
                    Each year we draw just enough to meet your spending. The means-tested{" "}
                    <span className="text-slate-200">Age Pension</span> comes first — a floor
                    that <em>grows</em> as your assessable assets fall — then any rent, then
                    top-ups from super and other savings. That&apos;s why the mix shifts toward
                    the Age Pension later in retirement.
                  </>
                )}
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
          Today&apos;s dollars · FY{config.financialYear} rules. {retired ? "Income is what you draw to fund spending, not investment growth." : "Salary is gross, before tax; super contributions are shown before the 15% contributions tax."}
        </div>
      </div>
    </div>
  );
}
