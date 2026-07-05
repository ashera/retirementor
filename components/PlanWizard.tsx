"use client";

import { useState, type ReactNode } from "react";
import Field from "@/components/Field";
import InlineExplainer from "@/components/InlineExplainer";
import { simulate } from "@/lib/au/simulate";
import type { EngineConfig } from "@/lib/au/config";
import { fmtCurrency } from "@/lib/au/format";
import { incomeTestRent, netEquity, netRentCash } from "@/lib/au/property";
import {
  DEFAULT_PARTNER,
  DEFAULT_PLAN,
  deriveStages,
  type Household,
  type Person,
  type PropertyDetail,
  type RetirementPlan,
  type SpendingMode,
  type SpendingStages,
  type SuperMode,
} from "@/lib/au/types";

const DEFAULT_PROPERTY: PropertyDetail = {
  value: 600_000,
  growthReal: 2,
  grossYield: 4,
  costRatio: 28,
  loanBalance: 200_000,
  loanRate: 6,
  purchasePrice: 350_000,
  strategy: "hold",
  sellAtAge: 75,
};

const STAGES_ARTICLE =
  "https://www.caresuper.com.au/members/advice-and-resources/education-hub/how-retirement-goes-from-go-go-to-no-go";

interface PlanWizardProps {
  initial: RetirementPlan;
  configured: boolean;
  config: EngineConfig;
  onComplete: (plan: RetirementPlan) => void;
  onClose: () => void;
}

type OptMode = "no" | "yes";

/** A small circular "how complete is your plan" meter shown in the header. */
function CompletenessRing({ pct }: { pct: number }) {
  const r = 17;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <div className="relative h-11 w-11 shrink-0" aria-label={`Plan ${pct}% complete`}>
      <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="#232c40" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="#34d399"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums text-white">
        {pct}
      </div>
    </div>
  );
}

/** "No / Yes" answer for an optional section, so it can reach a definite state. */
function OptionalAnswer({
  question,
  hint,
  mode,
  onChange,
}: {
  question: string;
  hint?: string;
  mode: OptMode | undefined;
  onChange: (v: OptMode) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel-2 px-4 py-3">
      <div>
        <span className="text-sm font-medium text-slate-200">{question}</span>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <Segmented
        value={(mode ?? "") as OptMode}
        options={[
          { value: "no" as OptMode, label: "No" },
          { value: "yes" as OptMode, label: "Yes" },
        ]}
        onChange={onChange}
      />
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-panel-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${
            value === o.value
              ? "bg-accent text-ink"
              : "text-muted hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function PlanWizard({
  initial,
  configured,
  config,
  onComplete,
  onClose,
}: PlanWizardProps) {
  const [draft, setDraft] = useState<RetirementPlan>(initial);
  const [step, setStep] = useState(0);

  // Explicit "have you told us?" state for the optional sections that otherwise
  // default to $0 (so we can't tell "none" from "not answered yet"). Seeded from
  // the incoming plan; drives the completeness meter and reveals the fields.
  const hasContrib = initial.people.some((p) => p.voluntaryConcessional > 0 || p.voluntaryNonConcessional > 0);
  const hasOutside = initial.outsideSuper > 0 || initial.annualOutsideSavings > 0;
  const [contribMode, setContribMode] = useState<OptMode | undefined>(hasContrib ? "yes" : undefined);
  const [outsideMode, setOutsideMode] = useState<OptMode | undefined>(hasOutside ? "yes" : undefined);
  const [propMode, setPropMode] = useState<OptMode | undefined>(initial.investmentProperty ? "yes" : undefined);

  const patch = (p: Partial<RetirementPlan>) =>
    setDraft((prev) => ({ ...prev, ...p }));

  const answerContributions = (v: OptMode) => {
    setContribMode(v);
    if (v === "no") setDraft((prev) => ({ ...prev, people: prev.people.map((pp) => ({ ...pp, voluntaryConcessional: 0, voluntaryNonConcessional: 0 })) }));
  };
  const answerOutside = (v: OptMode) => {
    setOutsideMode(v);
    if (v === "no") setDraft((prev) => ({ ...prev, outsideSuper: 0, annualOutsideSavings: 0 }));
  };

  const setPerson =
    (i: number, key: keyof Person) => (value: number) =>
      setDraft((prev) => {
        const people = prev.people.map((person, idx) =>
          idx === i ? { ...person, [key]: value } : person,
        );
        return { ...prev, people };
      });

  const setStage = (key: keyof SpendingStages) => (value: number) =>
    setDraft((prev) => ({
      ...prev,
      spendingStages: { ...prev.spendingStages, [key]: value },
    }));

  const setSpendingMode = (mode: SpendingMode) =>
    setDraft((prev) => {
      if (mode === "stages") {
        const untouched =
          JSON.stringify(prev.spendingStages) ===
          JSON.stringify(DEFAULT_PLAN.spendingStages);
        return {
          ...prev,
          spendingMode: mode,
          // Seed stages from the flat amount the first time (until they're edited).
          spendingStages: untouched
            ? deriveStages(prev.targetSpending)
            : prev.spendingStages,
        };
      }
      return { ...prev, spendingMode: mode };
    });

  const setHousehold = (household: Household) =>
    setDraft((prev) => {
      if (household === "couple" && prev.people.length === 1) {
        return { ...prev, household, people: [prev.people[0], { ...DEFAULT_PARTNER }] };
      }
      if (household === "single" && prev.people.length === 2) {
        // Single households are always individual.
        return { ...prev, household, superMode: "individual", people: [prev.people[0]] };
      }
      return { ...prev, household };
    });

  const setSuperMode = (mode: SuperMode) =>
    setDraft((prev) => {
      // Seed the joint balance from the sum of member balances on first switch.
      if (mode === "joint" && !prev.jointSuperBalance) {
        return {
          ...prev,
          superMode: mode,
          jointSuperBalance: prev.people.reduce((s, p) => s + p.superBalance, 0),
        };
      }
      return { ...prev, superMode: mode };
    });

  const isCouple = draft.household === "couple";
  const preview = simulate(draft, config);

  // Build steps dynamically (partner step only for couples).
  const personStep = (i: number, title: string, subtitle: string) => ({
    key: i === 0 ? "you" : "partner",
    nav: i === 0 ? "You" : "Partner",
    title,
    subtitle,
    body: (
      <div className="space-y-6">
        <Field
          label="Current age"
          value={draft.people[i].currentAge}
          onChange={setPerson(i, "currentAge")}
          min={18}
          max={75}
          suffix="yrs"
        />
        {draft.superMode === "joint" && isCouple ? (
          i === 0 ? (
            <>
              <Field
                label="Combined super balance (SMSF)"
                value={draft.jointSuperBalance}
                onChange={(v) => patch({ jointSuperBalance: v })}
                min={0}
                max={6_000_000}
                step={1000}
                prefix="$"
                hint="Your household's single pooled SMSF balance."
              />
              <Field
                label="Your share of the SMSF"
                value={draft.jointSuperSplit}
                onChange={(v) => patch({ jointSuperSplit: v })}
                min={0}
                max={100}
                step={5}
                suffix="%"
                hint={`You ${fmtCurrency((draft.jointSuperBalance * draft.jointSuperSplit) / 100)} · Partner ${fmtCurrency((draft.jointSuperBalance * (100 - draft.jointSuperSplit)) / 100)}. Mostly matters when there's an age gap.`}
              />
            </>
          ) : null
        ) : (
          <Field
            label="Current super balance"
            value={draft.people[i].superBalance}
            onChange={setPerson(i, "superBalance")}
            min={0}
            max={3_000_000}
            step={1000}
            prefix="$"
          />
        )}
        <Field
          label="Annual salary"
          value={draft.people[i].salary}
          onChange={setPerson(i, "salary")}
          min={0}
          max={500_000}
          step={1000}
          prefix="$"
          hint={`Employer pays ${fmtCurrency(draft.people[i].salary * config.sgRate)}/yr in super (${(config.sgRate * 100).toFixed(0)}% SG).`}
        />
      </div>
    ),
  });

  const contributionsStep = {
    key: "contributions",
    nav: "Super",
    title: "Extra super contributions",
    subtitle: "Voluntary contributions on top of the 12% your employer pays.",
    body: (
      <div className="space-y-6">
        <OptionalAnswer
          question="Do you add extra to super?"
          hint="On top of the 12% Super Guarantee your employer pays."
          mode={contribMode}
          onChange={answerContributions}
        />
        {contribMode === "no" && (
          <p className="text-xs text-muted">Just the employer Super Guarantee, then — you can change this anytime.</p>
        )}
        {contribMode === "yes" && draft.people.map((person, i) => (
          <div key={i} className="space-y-6">
            {isCouple && (
              <div className="text-xs font-semibold uppercase tracking-wide text-accent">
                {i === 0 ? "You" : "Partner"}
              </div>
            )}
            <Field
              label="Salary sacrifice (before tax)"
              value={person.voluntaryConcessional}
              onChange={setPerson(i, "voluntaryConcessional")}
              min={0}
              max={config.concessionalCap}
              step={500}
              prefix="$"
              hint={`Concessional cap is ${fmtCurrency(config.concessionalCap)}/yr incl. the SG.`}
            />
            <Field
              label="After-tax contributions"
              value={person.voluntaryNonConcessional}
              onChange={setPerson(i, "voluntaryNonConcessional")}
              min={0}
              max={130_000}
              step={1000}
              prefix="$"
            />
          </div>
        ))}
      </div>
    ),
  };

  const outsideStep = {
    key: "outside",
    nav: "Savings",
    title: "Savings outside super",
    subtitle:
      "Investments you can access any time — these fund an early-retirement bridge before super unlocks at 60.",
    body: (
      <div className="space-y-6">
        <OptionalAnswer
          question="Any savings outside super?"
          hint="Shares, savings, an offset — anything you can access before 60."
          mode={outsideMode}
          onChange={answerOutside}
        />
        {outsideMode === "no" && (
          <p className="text-xs text-muted">No outside-super savings recorded — you can add them anytime.</p>
        )}
        {outsideMode === "yes" && (
          <>
            <Field
              label="Current outside-super investments"
              value={draft.outsideSuper}
              onChange={(v) => patch({ outsideSuper: v })}
              min={0}
              max={5_000_000}
              step={1000}
              prefix="$"
            />
            <Field
              label="Added each year (while working)"
              value={draft.annualOutsideSavings}
              onChange={(v) => patch({ annualOutsideSavings: v })}
              min={0}
              max={200_000}
              step={500}
              prefix="$"
            />
          </>
        )}
      </div>
    ),
  };

  const p = draft.investmentProperty;
  const setProperty = (patchP: Partial<PropertyDetail>) =>
    setDraft((prev) =>
      prev.investmentProperty
        ? { ...prev, investmentProperty: { ...prev.investmentProperty, ...patchP } }
        : prev,
    );
  const toggleProperty = (on: boolean) =>
    setDraft((prev) => ({
      ...prev,
      investmentProperty: on
        ? (prev.investmentProperty ?? { ...DEFAULT_PROPERTY, sellAtAge: prev.retirementAge + 8 })
        : undefined,
    }));

  const propertyStep = {
    key: "property",
    nav: "Property",
    title: "Investment property",
    subtitle:
      "Unlike your home, an investment property is counted by the Age Pension — its net equity as an asset, and its actual rent as income.",
    body: (
      <div className="space-y-5">
        <Segmented
          value={(propMode ?? "") as "no" | "yes"}
          options={[
            { value: "no", label: "None" },
            { value: "yes", label: "I have one" },
          ]}
          onChange={(v) => {
            setPropMode(v === "yes" ? "yes" : "no");
            toggleProperty(v === "yes");
          }}
        />

        {p && (
          <div className="space-y-5">
            <Field
              label="Current market value"
              value={p.value}
              onChange={(v) => setProperty({ value: v })}
              min={0}
              max={5_000_000}
              step={10_000}
              prefix="$"
            />
            <Field
              label="Loan secured against it"
              value={p.loanBalance}
              onChange={(v) => setProperty({ loanBalance: v })}
              min={0}
              max={5_000_000}
              step={5_000}
              prefix="$"
              hint="Only a loan against THIS property reduces its assessed value (interest-only)."
            />
            <Field
              label="Loan interest rate"
              value={p.loanRate}
              onChange={(v) => setProperty({ loanRate: v })}
              min={0}
              max={12}
              step={0.1}
              suffix="%"
            />
            <Field
              label="Gross rental yield"
              value={p.grossYield}
              onChange={(v) => setProperty({ grossYield: v })}
              min={0}
              max={12}
              step={0.1}
              suffix="%"
              hint={`about ${fmtCurrency(Math.round((p.value * p.grossYield) / 100))}/yr gross rent`}
            />
            <Field
              label="Running costs & vacancy"
              value={p.costRatio}
              onChange={(v) => setProperty({ costRatio: v })}
              min={0}
              max={60}
              step={1}
              suffix="% of rent"
            />
            <Field
              label="Capital growth (real, after inflation)"
              value={p.growthReal}
              onChange={(v) => setProperty({ growthReal: v })}
              min={-2}
              max={6}
              step={0.5}
              suffix="% p.a."
            />
            <Field
              label="What you paid (cost base for CGT)"
              value={p.purchasePrice}
              onChange={(v) => setProperty({ purchasePrice: v })}
              min={0}
              max={5_000_000}
              step={10_000}
              prefix="$"
            />

            <div>
              <div className="mb-2 text-sm font-semibold text-slate-200">
                In retirement, will you…
              </div>
              <Segmented
                value={p.strategy}
                options={[
                  { value: "hold", label: "Hold for income" },
                  { value: "sell", label: "Sell it" },
                ]}
                onChange={(v) => setProperty({ strategy: v as PropertyDetail["strategy"] })}
              />
            </div>
            {p.strategy === "sell" && (
              <Field
                label="Sell at age"
                value={p.sellAtAge}
                onChange={(v) => setProperty({ sellAtAge: v })}
                min={draft.retirementAge}
                max={draft.lifeExpectancy}
                step={1}
                suffix="yrs"
                hint="Triggers CGT (50% discount); net proceeds move into your outside-super savings."
              />
            )}

            <div className="rounded-xl border border-line bg-panel-2 px-4 py-3 text-xs text-muted">
              <InlineExplainer
                label="Net rent (after costs & interest)"
                value={`${fmtCurrency(Math.round(netRentCash(p, p.value)))}/yr`}
                valueClassName={netRentCash(p, p.value) < 0 ? "text-amber-400" : "text-accent"}
              >
                <div className="space-y-1">
                  <div className="flex justify-between gap-4">
                    <span>Gross rent ({p.grossYield}% of {fmtCurrency(p.value)})</span>
                    <span className="tabular-nums">
                      {fmtCurrency(Math.round((p.value * p.grossYield) / 100))}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>− Running costs &amp; vacancy ({p.costRatio}% of rent)</span>
                    <span className="tabular-nums">
                      −{fmtCurrency(Math.round((p.value * p.grossYield * p.costRatio) / 10000))}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>− Loan interest ({p.loanRate}% of {fmtCurrency(p.loanBalance)})</span>
                    <span className="tabular-nums">
                      −{fmtCurrency(Math.round((p.loanBalance * p.loanRate) / 100))}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 border-t border-line pt-1 font-semibold text-white">
                    <span>Net rent</span>
                    <span className="tabular-nums">
                      {fmtCurrency(Math.round(netRentCash(p, p.value)))}/yr
                    </span>
                  </div>
                </div>
                <p className="mt-2">
                  Loan <em>principal</em> isn&apos;t subtracted — it&apos;s not a rental expense.
                  This net figure is what the Age Pension income test assesses (your actual rent,
                  not a deemed rate).
                </p>
              </InlineExplainer>
              <div className="mt-1 flex justify-between">
                <span>Assessable net equity</span>
                <span className="font-semibold tabular-nums text-slate-200">
                  {fmtCurrency(netEquity(p, p.value))}
                </span>
              </div>
              <p className="mt-2">
                Counts as {fmtCurrency(Math.round(incomeTestRent(p, p.value)))}/yr of income
                (actual rent, not deemed) and {fmtCurrency(netEquity(p, p.value))} of assessable
                assets.
              </p>
            </div>
          </div>
        )}
      </div>
    ),
  };

  const comfortable = isCouple
    ? config.asfa.comfortable.couple
    : config.asfa.comfortable.single;
  const modest = isCouple ? config.asfa.modest.couple : config.asfa.modest.single;

  const stages = draft.spendingStages;
  const goalStep = {
    key: "goal",
    nav: "Goal",
    title: "Your retirement goal",
    subtitle: "When you want to stop working and how much you'll spend.",
    body: (
      <div className="space-y-6">
        <Field
          label="Retirement age"
          value={draft.retirementAge}
          onChange={(v) => patch({ retirementAge: v })}
          min={40}
          max={75}
          suffix="yrs"
          hint={
            draft.retirementAge < 60
              ? "Before 60 you'll rely on outside-super until your super unlocks."
              : "Super is accessible from age 60."
          }
        />

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-200">
              Spending plan
            </span>
            <Segmented
              value={draft.spendingMode}
              onChange={setSpendingMode}
              options={[
                { value: "flat", label: "Flat" },
                { value: "stages", label: "Stages" },
              ]}
            />
          </div>

          {draft.spendingMode === "flat" ? (
            <div className="space-y-4">
              <Field
                label="Target annual spending"
                value={draft.targetSpending}
                onChange={(v) => patch({ targetSpending: v })}
                min={20_000}
                max={200_000}
                step={1000}
                prefix="$"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => patch({ targetSpending: modest })}
                  className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-xs text-slate-200 hover:border-accent/50"
                >
                  ASFA modest {fmtCurrency(modest)}
                </button>
                <button
                  onClick={() => patch({ targetSpending: comfortable })}
                  className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-xs text-slate-200 hover:border-accent/50"
                >
                  ASFA comfortable {fmtCurrency(comfortable)}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-xs text-muted">
                The{" "}
                <a
                  href={STAGES_ARTICLE}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  go-go, slow-go, no-go
                </a>{" "}
                approach steps spending down as you age — most active early,
                quieter later. Amounts and ages are editable.
              </p>
              <Field
                label="Go-go spend"
                value={stages.goGo}
                onChange={setStage("goGo")}
                min={15_000}
                max={200_000}
                step={1000}
                prefix="$"
                hint={`Active years, retirement to age ${stages.slowGoAge}.`}
              />
              <Field
                label="Slow-go spend"
                value={stages.slowGo}
                onChange={setStage("slowGo")}
                min={15_000}
                max={200_000}
                step={1000}
                prefix="$"
                hint={`From age ${stages.slowGoAge} to ${stages.noGoAge}.`}
              />
              <Field
                label="No-go spend"
                value={stages.noGo}
                onChange={setStage("noGo")}
                min={15_000}
                max={200_000}
                step={1000}
                prefix="$"
                hint={`From age ${stages.noGoAge}.`}
              />
              <Field
                label="Slow-go starts at"
                value={stages.slowGoAge}
                onChange={setStage("slowGoAge")}
                min={65}
                max={85}
                suffix="yrs"
              />
              <Field
                label="No-go starts at"
                value={stages.noGoAge}
                onChange={setStage("noGoAge")}
                min={70}
                max={95}
                suffix="yrs"
              />
            </div>
          )}
        </div>
      </div>
    ),
  };

  const assumptionsStep = {
    key: "assumptions",
    nav: "Assumptions",
    title: "Assumptions",
    subtitle: "The long-run numbers behind the projection.",
    body: (
      <div className="space-y-6">
        <Field
          label="Investment return"
          value={draft.investmentReturn}
          onChange={(v) => patch({ investmentReturn: v })}
          min={1}
          max={12}
          step={0.1}
          suffix="%"
          hint="Nominal annual return (super in accumulation is taxed 15% on earnings)."
        />
        <Field
          label="Inflation"
          value={draft.inflation}
          onChange={(v) => patch({ inflation: v })}
          min={0}
          max={8}
          step={0.1}
          suffix="%"
          hint="CPI (ASIC RG 276 default 2.5%). Two-stage today's-dollars deflation: pre-retirement uses wage inflation of CPI + 1.2%; retirement uses CPI."
        />
        <Field
          label="Plan until age"
          value={draft.lifeExpectancy}
          onChange={(v) => patch({ lifeExpectancy: v })}
          min={75}
          max={105}
          suffix="yrs"
        />
        {(() => {
          const fees = draft.fees ?? config.fees;
          const setFee = (patchFee: Partial<typeof fees>) => patch({ fees: { ...fees, ...patchFee } });
          return (
            <div className="space-y-4 rounded-xl border border-line bg-panel-2 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                Super fees (advanced)
              </div>
              <Field
                label="Admin + investment fee"
                value={fees.adminInvestmentPct}
                onChange={(v) => setFee({ adminInvestmentPct: v })}
                min={0}
                max={3}
                step={0.05}
                suffix="%"
                hint="Combined percentage fee, deducted from your super each year (Moneysmart-style default 0.85%)."
              />
              <Field
                label="Fixed admin fee"
                value={fees.fixedAdminAnnual}
                onChange={(v) => setFee({ fixedAdminAnnual: v })}
                min={0}
                max={1000}
                step={1}
                prefix="$"
                hint="Fixed dollar member fee per account, per year."
              />
              <Field
                label="Insurance premium"
                value={fees.insuranceAnnual}
                onChange={(v) => setFee({ insuranceAnnual: v })}
                min={0}
                max={5000}
                step={10}
                prefix="$"
                hint="Default insurance premium deducted while working. Leave at $0 if none."
              />
            </div>
          );
        })()}
      </div>
    ),
  };

  const householdStep = {
    key: "household",
    nav: "Household",
    title: "Your household",
    subtitle: "Age Pension rates and means-test thresholds differ for singles and couples.",
    body: (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-200">Household</span>
          <Segmented
            value={draft.household}
            onChange={setHousehold}
            options={[
              { value: "single", label: "Single" },
              { value: "couple", label: "Couple" },
            ]}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-slate-200">
              Own your home?
            </span>
            <p className="text-xs text-muted">
              Your home is exempt from the assets test; renters get higher thresholds.
            </p>
          </div>
          <Segmented
            value={draft.homeowner ? "yes" : "no"}
            onChange={(v) => patch({ homeowner: v === "yes" })}
            options={[
              { value: "yes", label: "Own" },
              { value: "no", label: "Rent" },
            ]}
          />
        </div>
        {isCouple && (
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-slate-200">
                How is your super held?
              </span>
              <p className="text-xs text-muted">
                Choose &lsquo;Joint (SMSF)&rsquo; to enter one pooled balance
                instead of two.
              </p>
            </div>
            <Segmented
              value={draft.superMode}
              onChange={setSuperMode}
              options={[
                { value: "individual", label: "Individual" },
                { value: "joint", label: "Joint (SMSF)" },
              ]}
            />
          </div>
        )}
      </div>
    ),
  };

  const steps: { key: string; nav: string; title: string; subtitle: string; body: ReactNode }[] = [
    householdStep,
    personStep(0, isCouple ? "About you" : "About you", "Where you're starting from today."),
    ...(isCouple ? [personStep(1, "About your partner", "Your partner's starting point.")] : []),
    contributionsStep,
    outsideStep,
    propertyStep,
    goalStep,
    assumptionsStep,
  ];

  const safeStep = Math.min(step, steps.length - 1);
  const current = steps[safeStep];
  const isLast = safeStep === steps.length - 1;

  // ── Completeness meter — measures what the user has TOLD us, not steps clicked.
  // Core sections gate the tier; Assumptions is a bonus ★, not part of the score.
  const p0 = draft.people[0];
  const p1 = draft.people[1];
  const goalSet = draft.retirementAge > 0 && (draft.spendingMode === "stages" ? draft.spendingStages.goGo > 0 : draft.targetSpending > 0);
  const sectionState: Record<string, { core: boolean; optional: boolean; complete: boolean; label: string }> = {
    household: { core: true, optional: false, complete: true, label: "household" },
    you: { core: true, optional: false, complete: p0.superBalance > 0 || p0.salary > 0, label: "your details" },
    ...(isCouple ? { partner: { core: true, optional: false, complete: !!p1 && (p1.superBalance > 0 || p1.salary > 0), label: "your partner" } } : {}),
    contributions: { core: false, optional: true, complete: contribMode !== undefined, label: "extra contributions" },
    outside: { core: false, optional: true, complete: outsideMode !== undefined, label: "outside savings" },
    property: { core: false, optional: true, complete: propMode !== undefined, label: "an investment property" },
    goal: { core: true, optional: false, complete: goalSet, label: "retirement goal" },
  };
  const scored = Object.values(sectionState);
  const completeCount = scored.filter((s) => s.complete).length;
  const total = scored.length;
  const pct = Math.round((completeCount / total) * 100);
  const coreComplete = scored.every((s) => !s.core || s.complete);
  const enrichDone = scored.filter((s) => s.optional && s.complete).length;
  const tier = !coreComplete
    ? "Sketch"
    : pct === 100
      ? "Complete picture"
      : enrichDone === 0
        ? "Working model"
        : "Detailed";
  const tuned =
    draft.investmentReturn !== DEFAULT_PLAN.investmentReturn ||
    draft.inflation !== DEFAULT_PLAN.inflation ||
    draft.lifeExpectancy !== DEFAULT_PLAN.lifeExpectancy ||
    (!!draft.fees && JSON.stringify(draft.fees) !== JSON.stringify(config.fees));
  // The nudge: point at the essentials first, then the first open enrichment.
  const gap = scored.find((s) => s.core && !s.complete) ?? scored.find((s) => s.optional && !s.complete);
  const gapStepIndex = gap ? steps.findIndex((s) => sectionState[s.key]?.label === gap.label) : -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        {/* Header — completeness ring + tier, with the current step title */}
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <CompletenessRing pct={pct} />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold leading-tight text-white">
                {current.title}
              </h2>
              <div className="mt-0.5 text-xs font-medium text-accent transition-colors">
                {tier} · {completeCount}/{total} details told{tuned ? " · ★ fine-tuned" : ""}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-panel-2 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Step navigation — each pill shows its state: ✓ told us, ＋ opportunity */}
        <div className="flex flex-wrap gap-1.5 px-6 pt-4">
          {steps.map((s, i) => {
            const sec = sectionState[s.key];
            const isCurrent = i === safeStep;
            // Assumptions is a bonus (★ when fine-tuned) — never an amber "＋" gap.
            const isAssump = s.key === "assumptions";
            const complete = isAssump ? tuned : sec?.complete;
            const opportunity = !isAssump && !complete && sec?.optional;
            const cls = isCurrent
              ? "bg-accent text-ink"
              : complete
                ? "bg-accent/15 text-accent hover:bg-accent/25"
                : opportunity
                  ? "border border-dashed border-amber-400/40 text-amber-300/90 hover:text-amber-200"
                  : "bg-panel-2 text-muted hover:text-white";
            const mark = isCurrent ? "" : isAssump ? (tuned ? "★ " : "") : complete ? "✓ " : opportunity ? "＋ " : "";
            return (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                aria-current={isCurrent ? "step" : undefined}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${cls}`}
              >
                {mark}{s.nav}
              </button>
            );
          })}
        </div>

        {/* Body (scrolls) */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <p className="mb-5 text-sm text-muted">{current.subtitle}</p>
          {current.body}
        </div>

        {/* Completeness nudge — celebrate at 100%, else point at the next gap */}
        {pct === 100 ? (
          <div className="mx-6 mb-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-center text-xs font-medium text-accent">
            ✓ Complete picture — that&apos;s as detailed as your model gets.
          </div>
        ) : gap ? (
          <div className="mx-6 mb-2">
            <button
              type="button"
              onClick={() => gapStepIndex >= 0 && setStep(gapStepIndex)}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-panel-2 px-4 py-2.5 text-left text-xs transition hover:border-accent/40"
            >
              <span className="text-slate-300">
                {gap.core ? (
                  <>Add <span className="font-semibold text-white">{gap.label}</span> to finish the essentials</>
                ) : (
                  <>＋ Add <span className="font-semibold text-white">{gap.label}</span> for a sharper model</>
                )}
              </span>
              <span className="shrink-0 font-semibold text-accent">→</span>
            </button>
          </div>
        ) : null}

        {/* Live preview */}
        <div className="mx-6 mb-2 flex items-center justify-between rounded-xl border border-line bg-panel-2 px-4 py-3">
          <div>
            <div className="text-xs text-muted">Super at retirement</div>
            <div className="text-base font-bold tabular-nums text-white">
              {fmtCurrency(preview.superAtRetirement)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted">Money lasts</div>
            <div
              className={`text-base font-bold tabular-nums ${
                preview.lastsToLifeExpectancy ? "text-accent" : "text-amber-400"
              }`}
            >
              {preview.lastsToLifeExpectancy
                ? `to age ${draft.lifeExpectancy} ✓`
                : `to age ${preview.depletedAge}`}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          <button
            onClick={() => (safeStep === 0 ? onClose() : setStep(safeStep - 1))}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted transition hover:text-white"
          >
            {safeStep === 0 ? "Cancel" : "← Back"}
          </button>
          <button
            onClick={() => (isLast ? onComplete(draft) : setStep(safeStep + 1))}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft"
          >
            {isLast ? (configured ? "Update plan" : "See my plan") : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
