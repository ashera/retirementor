"use client";

import { fmtCurrency } from "@/lib/au/format";
import { minDrawdownRate, type EngineConfig } from "@/lib/au/config";
import { getInvestmentProperties, type RetirementPlan, type YearRow } from "@/lib/au/types";

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
  const rent = Math.max(0, row.rentIncome ?? 0);
  const pension = row.agePension;
  const fromSuper = row.superDrawn;
  const fromOutside = row.outsideDrawn;
  const total = pension + rent + fromSuper + fromOutside;
  const spend = row.spending;
  const shortfall = Math.max(0, spend - total);

  // Per-person salary split for a couple's working years (salary is constant in
  // today's dollars, so each person's figure is their plan salary this year).
  const couple = plan.people.length > 1;
  const oldestCurrentAge = Math.max(...plan.people.map((pp) => pp.currentAge));
  const yearsElapsed = row.age - oldestCurrentAge;
  const propsList = getInvestmentProperties(plan);
  const propertyCount = propsList.length;
  // Label for a property line: its custom name, else "Property N" (or a lone
  // "Investment property"), matching the wizard's naming.
  const propLabel = (part: { name?: string; index: number }) =>
    part.name?.trim() || (propertyCount > 1 ? `Property ${part.index + 1}` : "Investment property");
  const rentLabel =
    propertyCount === 1
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
  const privateNeed = Math.max(0, spend - pension - rent);
  const minRate = minDrawdownRate(row.age, config);
  const minDraw = row.breakdown.minDrawdown;
  const parts = row.breakdown.minDrawdownParts;
  const target = Math.max(privateNeed, minDraw);
  const capped = fromSuper > 1 && fromSuper < target - 1; // hit the accessible-super ceiling
  const minDriven = minDraw > privateNeed + 1 && !capped; // minimum exceeds need → surplus saved

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
            <div className="text-xs font-semibold uppercase tracking-widest text-accent">{retired ? "Retirement income" : "Working income"}</div>
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
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Where it comes from</h3>
                <div className="rounded-xl border border-line bg-panel px-3 py-1">
                  <Row
                    color="#facc15"
                    label="Salary"
                    sub={couple ? "Combined gross salary for the household." : "Your gross salary."}
                    value={row.salaryIncome}
                  />
                  {couple && (
                    <div className="space-y-0.5 border-t border-line py-2 pl-[18px]">
                      {plan.people.map((pp, i) => (
                        <div key={i} className="flex justify-between gap-4 text-[11px] text-muted">
                          <span>
                            {i === 0 ? "You" : "Partner"}
                            {pp.currentAge + yearsElapsed > 0 && ` (age ${pp.currentAge + yearsElapsed})`}
                            {pp.salary <= 0 && " — not earning"}
                          </span>
                          <span className="tabular-nums text-slate-200">{cur(pp.salary)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {(row.breakdown.contribGross > 0 || row.breakdown.savings > 0) && (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    What you&apos;re putting away this year
                  </h3>
                  <div className="rounded-xl border border-line bg-panel px-3 py-1">
                    {row.breakdown.contribGross > 0 && (
                      <Row
                        color="#34d399"
                        label="Into super"
                        sub="Employer Super Guarantee plus any salary sacrifice, before the 15% contributions tax."
                        value={row.breakdown.contribGross}
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
                  {(pension > 0 || row.age >= config.agePensionAge) && (
                    <Row color="#a78bfa" label="Age Pension" sub={pensionReason} value={pension} />
                  )}
                  {rent > 0 && (
                    <Row color="#fb923c" label="Net rent" sub="Actual rent from your investment property, after costs and loan interest." value={rent} />
                  )}
                  {fromSuper > 0 && (
                    <Row color="#34d399" label="From your super" sub="Drawn tax-free (accessible from 60) — see the working below." value={fromSuper} />
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
                      You draw the <strong className="text-white">greater</strong> of the shortfall and the
                      minimum, capped at your balance →{" "}
                      <strong className="text-accent">{cur(fromSuper)}</strong> from super.
                    </div>
                    {minDriven && (
                      <p className="text-[11px] text-muted">
                        The minimum is more than you needed, so the surplus{" "}
                        {cur(fromSuper - privateNeed)} is added back to your outside savings — not spent.
                      </p>
                    )}
                    {capped && (
                      <p className="text-[11px] font-medium text-amber-400">
                        Your super couldn&apos;t cover the full shortfall — the rest came from your outside savings.
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
          Today&apos;s dollars · FY{config.financialYear} rules. {retired ? "Income is what you draw to fund spending, not investment growth." : "Salary is gross, before tax; super contributions are shown before the 15% contributions tax."}
        </div>
      </div>
    </div>
  );
}
