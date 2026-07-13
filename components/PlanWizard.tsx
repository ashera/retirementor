"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Field from "@/components/Field";
import CompletenessRing from "@/components/CompletenessRing";
import BudgetBuilder from "@/components/BudgetBuilder";
import PropertyCard from "@/components/PropertyCard";
import { simulate } from "@/lib/au/simulate";
import { runMonteCarlo, MC_CONFIDENCE_MC, MC_CONFIDENCE_TARGET } from "@/lib/au/montecarlo";
import type { EngineConfig } from "@/lib/au/config";
import { fmtCompact, fmtCurrency } from "@/lib/au/format";
import { planCompleteness } from "@/lib/au/completeness";
import { track } from "@/lib/analytics";
import {
  DEFAULT_PARTNER,
  DEFAULT_PLAN,
  getInvestmentProperties,
  hasInvestmentProperty,
  personRetirementAge,
  type Household,
  type Person,
  type PropertyDetail,
  type RetirementPlan,
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


interface PlanWizardProps {
  initial: RetirementPlan;
  configured: boolean;
  config: EngineConfig;
  onComplete: (plan: RetirementPlan) => void;
  /** Called on every "Next" so the host can save progress as the user advances. */
  onProgress?: (plan: RetirementPlan) => void;
  onClose: () => void;
}

type OptMode = "no" | "yes";

// Per-step presentation for the overview hub: accent colour, a line icon, and a
// one-line reason the step exists (mirrors the budget-builder category cards).
const STEP_META: Record<string, { color: string; desc: string }> = {
  household: { color: "#34d399", desc: "Sets your Age Pension rates and means-test thresholds." },
  you: { color: "#38bdf8", desc: "Your age, super and salary — the starting point." },
  partner: { color: "#818cf8", desc: "Your partner's age, super and salary." },
  contributions: { color: "#fbbf24", desc: "Extra super you add beyond the employer 12%." },
  outside: { color: "#a78bfa", desc: "Savings you can use before super unlocks at 60." },
  property: { color: "#fb923c", desc: "An investment property is counted by the Age Pension." },
  goal: { color: "#fb7185", desc: "When you retire and how much you'll spend." },
  assumptions: { color: "#22d3ee", desc: "Long-run return, inflation and fees." },
};

function StepIcon({ stepKey, size = 22 }: { stepKey: string; size?: number }) {
  const color = STEP_META[stepKey]?.color ?? "#94a3b8";
  const paths: Record<string, ReactNode> = {
    household: (<><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v10h13V10" /><path d="M10 20v-5h4v5" /></>),
    you: (<><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></>),
    partner: (<><circle cx="9" cy="8" r="2.6" /><circle cx="16" cy="9" r="2.2" /><path d="M4 20a5 5 0 0 1 10 0" /><path d="M14.5 20a4.2 4.2 0 0 1 5.5-4" /></>),
    contributions: (<><path d="M12 21V7" /><path d="M7 12l5-5 5 5" /><path d="M5 4h14" /></>),
    outside: (<><rect x="3.5" y="7" width="17" height="12" rx="2" /><path d="M3.5 11h17" /><circle cx="16" cy="15" r="1.4" /></>),
    property: (<><path d="M4 21V6l7-3v18" /><path d="M11 21V9l8 3v9" /><path d="M7 9v0M7 13v0M7 17v0M15 14v0M15 18v0" /></>),
    goal: (<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>),
    assumptions: (<><path d="M4 7h10" /><path d="M18 7h2" /><circle cx="16" cy="7" r="2" /><path d="M4 17h2" /><path d="M10 17h10" /><circle cx="8" cy="17" r="2" /></>),
  };
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl"
      style={{ backgroundColor: `${color}1f`, width: size + 18, height: size + 18 }}
      aria-hidden
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        {paths[stepKey] ?? <circle cx="12" cy="12" r="8" />}
      </svg>
    </span>
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
  onProgress,
  onClose,
}: PlanWizardProps) {
  const [draft, setDraft] = useState<RetirementPlan>(initial);
  const [step, setStep] = useState(0);
  const [view, setView] = useState<"summary" | "step">("summary");
  const [budgetOpen, setBudgetOpen] = useState(false); // budget builder, nested over the wizard

  // Explicit "have you told us?" state for the optional sections that otherwise
  // default to $0 (so we can't tell "none" from "not answered yet"). Seeded from
  // the incoming plan; drives the completeness meter and reveals the fields.
  const hasContrib = initial.people.some((p) => p.voluntaryConcessional > 0 || p.voluntaryNonConcessional > 0);
  const hasOutside = initial.outsideSuper > 0 || initial.annualOutsideSavings > 0;
  // Recover the yes/no answer from data + the persisted `answered` flags.
  const [contribMode, setContribMode] = useState<OptMode | undefined>(hasContrib ? "yes" : initial.answered?.contributions ? "no" : undefined);
  const [outsideMode, setOutsideMode] = useState<OptMode | undefined>(hasOutside ? "yes" : initial.answered?.outside ? "no" : undefined);
  const [propMode, setPropMode] = useState<OptMode | undefined>(hasInvestmentProperty(initial) ? "yes" : initial.answered?.property ? "no" : undefined);
  // Accordion: which property card is expanded (index), or null when all are
  // collapsed to summary rows. Reset to collapsed whenever the step/view changes
  // so arriving at the Property section always starts collapsed; adding a
  // property (same step) opens just that one.
  const [openProp, setOpenProp] = useState<number | null>(null);
  useEffect(() => {
    setOpenProp(null);
  }, [step, view]);

  const patch = (p: Partial<RetirementPlan>) =>
    setDraft((prev) => ({ ...prev, ...p }));

  const answerContributions = (v: OptMode) => {
    setContribMode(v);
    setDraft((prev) => ({
      ...prev,
      answered: { ...prev.answered, contributions: true },
      ...(v === "no" ? { people: prev.people.map((pp) => ({ ...pp, voluntaryConcessional: 0, voluntaryNonConcessional: 0 })) } : {}),
    }));
  };
  const answerOutside = (v: OptMode) => {
    setOutsideMode(v);
    setDraft((prev) => ({
      ...prev,
      answered: { ...prev.answered, outside: true },
      ...(v === "no" ? { outsideSuper: 0, annualOutsideSavings: 0 } : {}),
    }));
  };

  const setPerson =
    (i: number, key: keyof Person) => (value: number) =>
      setDraft((prev) => {
        const people = prev.people.map((person, idx) =>
          idx === i ? { ...person, [key]: value } : person,
        );
        return { ...prev, people };
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

  // A first-run wizard starts blank (empty Fields = NaN). Don't show a projection
  // — or NaN figures — until the essentials have actually been entered.
  const previewSuper = draft.superMode === "joint" ? draft.jointSuperBalance : draft.people[0].superBalance;
  const previewSpend = draft.spendingMode === "stages" ? draft.spendingStages.goGo : draft.targetSpending;
  const previewReady =
    draft.people.every((pp) => Number.isFinite(pp.currentAge) && Number.isFinite(pp.salary)) &&
    Number.isFinite(previewSuper) &&
    Number.isFinite(previewSpend) &&
    Number.isFinite(draft.retirementAge);

  // The honest "will it last?" answer is the Monte Carlo likelihood, not whether it
  // survives on a single smooth-return line (which a very early retirement can pass
  // at a ~46% real-world chance). Use the same run + 85% bar as the "maximise spend"
  // tool. Memoised on the draft so it only recomputes when inputs actually change.
  const previewMc = useMemo(
    () => (previewReady ? runMonteCarlo(draft, config, MC_CONFIDENCE_MC) : null),
    [previewReady, draft, config],
  );
  const successPct = previewMc ? Math.round(previewMc.successRate * 100) : 0;
  const passesBar = previewMc ? previewMc.successRate >= MC_CONFIDENCE_TARGET : false;

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
          label="Annual salary (excluding super)"
          value={draft.people[i].salary}
          onChange={setPerson(i, "salary")}
          min={0}
          max={500_000}
          step={1000}
          prefix="$"
          hint={
            Number.isFinite(draft.people[i].salary)
              ? `Enter your base salary — your employer pays ${fmtCurrency(draft.people[i].salary * config.sgRate)}/yr super on top (${(config.sgRate * 100).toFixed(0)}% SG), so don't include it here.`
              : `Enter your base salary before super — your employer adds ${(config.sgRate * 100).toFixed(0)}% on top (the Super Guarantee). If your package is quoted "including super", exclude that part.`
          }
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

  const properties = getInvestmentProperties(draft);
  const newProperty = (retirementAge: number): PropertyDetail => ({
    ...DEFAULT_PROPERTY,
    sellAtAge: retirementAge + 8,
  });
  // Write to investmentProperties (the array source of truth) and clear the
  // legacy single field so the two never disagree.
  const writeProperties = (arr: PropertyDetail[]) =>
    setDraft((prev) => ({ ...prev, investmentProperties: arr, investmentProperty: undefined }));
  const setPropertyAt = (i: number, patchP: Partial<PropertyDetail>) => {
    const arr = getInvestmentProperties(draft).slice();
    arr[i] = { ...arr[i], ...patchP };
    writeProperties(arr);
  };
  const addProperty = () => {
    const arr = [...getInvestmentProperties(draft), newProperty(draft.retirementAge)];
    setOpenProp(arr.length - 1); // expand the one just added
    writeProperties(arr);
  };
  const removePropertyAt = (i: number) => {
    const arr = getInvestmentProperties(draft).slice();
    arr.splice(i, 1);
    writeProperties(arr);
  };
  const toggleProperty = (on: boolean) => {
    const existing = getInvestmentProperties(draft);
    writeProperties(on ? (existing.length ? existing : [newProperty(draft.retirementAge)]) : []);
  };

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
            setDraft((prev) => ({ ...prev, answered: { ...prev.answered, property: true } }));
          }}
        />

        {properties.length > 0 && (
          <div className="space-y-4">
            {properties.map((pp, i) => (
              <PropertyCard
                key={i}
                index={i}
                total={properties.length}
                property={pp}
                retirementAge={draft.retirementAge}
                lifeExpectancy={draft.lifeExpectancy}
                expanded={i === openProp}
                onToggle={() => setOpenProp((prev) => (prev === i ? null : i))}
                onChange={(patchP) => setPropertyAt(i, patchP)}
                onRemove={() => removePropertyAt(i)}
              />
            ))}
            <button
              type="button"
              onClick={addProperty}
              className="w-full rounded-xl border border-dashed border-line py-2.5 text-sm font-medium text-muted transition hover:border-accent/50 hover:text-white"
            >
              + Add another property
            </button>
          </div>
        )}

      </div>
    ),
  };

  const goalStep = {
    key: "goal",
    nav: "Goal",
    title: "Your retirement goal",
    subtitle: "When you want to stop working and how much you'll spend.",
    body: (
      <div className="space-y-6">
        <Field
          label={isCouple ? "Your retirement age" : "Retirement age"}
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
        {isCouple && (
          <Field
            label="Partner's retirement age"
            value={draft.people[1]?.retirementAge ?? personRetirementAge(draft, 1)}
            onChange={(v) => setPerson(1, "retirementAge")(v)}
            min={40}
            max={75}
            suffix="yrs"
            hint="Partners can retire at different ages. Whoever's still working keeps earning and paying into super, and their pay helps cover the household's spending until they retire too."
          />
        )}

        {/* Spending is set exclusively in the budget builder — one source of
            truth, so the wizard and budget can never disagree. */}
        <div className="rounded-xl border border-line bg-panel-2 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Retirement spending</div>
          <div className="mt-1 text-lg font-bold text-white">
            {!Number.isFinite(previewSpend)
              ? "Not set yet"
              : draft.spendingMode === "stages"
                ? `${fmtCurrency(draft.spendingStages.goGo)}/yr go-go`
                : `${fmtCurrency(draft.targetSpending)}/yr`}
          </div>
          {draft.spendingMode === "stages" && (
            <div className="mt-0.5 text-xs text-muted">
              {fmtCurrency(draft.spendingStages.goGo)} → {fmtCurrency(draft.spendingStages.slowGo)} → {fmtCurrency(draft.spendingStages.noGo)} as you age
            </div>
          )}
          <p className="mt-2 text-xs text-muted">
            {draft.budget
              ? "From the detailed budget you built."
              : "Pick a lifestyle preset or fine-tune each category in the budget builder."}{" "}
            Spending lives in one place, so it stays consistent across the app.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setBudgetOpen(true)}
          className="w-full rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent/20"
        >
          {draft.budget ? "Edit your spending budget →" : "Set your retirement spending →"}
        </button>
      </div>
    ),
  };

  // Have the model/economic assumptions been moved off the app defaults? (returns,
  // volatility, inflation, super fees, and the outside-super overrides). Life
  // expectancy is a personal planning choice, not an assumption, so it's excluded.
  const assumptionsTuned =
    draft.investmentReturn !== DEFAULT_PLAN.investmentReturn ||
    draft.returnVolatility !== DEFAULT_PLAN.returnVolatility ||
    draft.inflation !== DEFAULT_PLAN.inflation ||
    draft.outsideReturn != null ||
    draft.outsideVolatility != null ||
    (!!draft.fees && JSON.stringify(draft.fees) !== JSON.stringify(config.fees));
  const resetAssumptions = () =>
    patch({
      investmentReturn: DEFAULT_PLAN.investmentReturn,
      returnVolatility: DEFAULT_PLAN.returnVolatility,
      inflation: DEFAULT_PLAN.inflation,
      fees: undefined,
      outsideReturn: undefined,
      outsideVolatility: undefined,
    });

  const assumptionsStep = {
    key: "assumptions",
    nav: "Assumptions",
    title: "Assumptions",
    subtitle: "The long-run numbers behind the projection.",
    body: (
      <div className="space-y-6">
        {assumptionsTuned && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={resetAssumptions}
              className="text-xs font-medium text-accent transition hover:underline"
            >
              ↺ Reset assumptions to defaults
            </button>
          </div>
        )}
        {(() => {
          const feePct = draft.fees?.adminInvestmentPct ?? config.fees.adminInvestmentPct;
          const afterFees = +(draft.investmentReturn - feePct).toFixed(2);
          return (
            <Field
              label="Investment return (before fees)"
              value={draft.investmentReturn}
              onChange={(v) => patch({ investmentReturn: v })}
              min={1}
              max={12}
              step={0.1}
              suffix="%"
              hint={`Gross return, before fees — super funds usually quote returns AFTER investment fees, so this sits a little higher. We take the ${feePct}% fee out separately (≈ ${afterFees}% after fees) and 15% earnings tax while you're working.`}
            />
          );
        })()}
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
        {(() => {
          const oReturn = draft.outsideReturn ?? draft.investmentReturn;
          const oVol = draft.outsideVolatility ?? draft.returnVolatility;
          const differs = draft.outsideReturn != null || draft.outsideVolatility != null;
          return (
            <div className="space-y-4 rounded-xl border border-line bg-panel-2 p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Outside-super investments (advanced)
                </div>
                {differs && (
                  <button
                    type="button"
                    onClick={() => patch({ outsideReturn: undefined, outsideVolatility: undefined })}
                    className="text-[11px] font-medium text-accent hover:underline"
                  >
                    Reset to super
                  </button>
                )}
              </div>
              <p className="text-xs text-muted">
                By default your outside-super money grows at the same return as your super.
                Set these if you hold it differently — e.g. more conservatively, or as cash
                (a low return with low volatility).
              </p>
              <Field
                label="Outside-super return"
                value={oReturn}
                onChange={(v) => patch({ outsideReturn: v })}
                min={0}
                max={12}
                step={0.1}
                suffix="%"
                hint="Nominal return on money outside super. No super fee applies. Dividends are taxed each year at your marginal rate; capital growth is deferred and taxed only when sold (with the 50% CGT discount)."
              />
              <Field
                label="Outside-super volatility"
                value={oVol}
                onChange={(v) => patch({ outsideVolatility: v })}
                min={0}
                max={20}
                step={0.5}
                suffix="%"
                hint="Year-to-year swing for the outside pool (for the likelihood). Set near 0 for cash."
              />
            </div>
          );
        })()}
        <div className="space-y-3 rounded-xl border border-line bg-panel-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              Super in retirement (advanced)
            </div>
            <Segmented
              value={draft.keepSuperInAccumulation ? "accum" : "pension"}
              onChange={(v) => patch({ keepSuperInAccumulation: v === "accum" })}
              options={[
                { value: "pension", label: "Pension" },
                { value: "accum", label: "Accumulation" },
              ]}
            />
          </div>
          <p className="text-xs text-muted">
            By default, super converts to a tax-free <strong className="text-slate-300">account-based pension</strong>{" "}
            at retirement: earnings are tax-free, but you must draw a minimum each year (any part you don&apos;t need
            is reinvested outside super). Choose <strong className="text-slate-300">Accumulation</strong> to leave it
            in accumulation instead — no forced minimum drawdown, but earnings are taxed 15%. Handy to model when your
            outside-super savings already cover your spending, though starting a pension is usually more tax-effective.
          </p>
        </div>
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

  // Funnel: record which wizard step a visitor reaches (and in what order), so
  // GA4 path/funnel exploration shows where people drop off before finishing.
  useEffect(() => {
    if (view === "step") track("Wizard step", { step: current.key, index: safeStep });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, safeStep]);

  // ── Completeness meter — shared with the dashboard (measures what the user has
  // TOLD us, not steps clicked). Assumptions is a bonus ★, not part of the score.
  const comp = planCompleteness(draft);
  const { pct, tier, completeCount, total } = comp;
  const sectionState = comp.byKey;
  const tuned =
    draft.investmentReturn !== DEFAULT_PLAN.investmentReturn ||
    draft.inflation !== DEFAULT_PLAN.inflation ||
    draft.lifeExpectancy !== DEFAULT_PLAN.lifeExpectancy ||
    (!!draft.fees && JSON.stringify(draft.fees) !== JSON.stringify(config.fees));
  // The nudge: point at the essentials first, then the first open enrichment.
  const gap = comp.gapKey ? comp.byKey[comp.gapKey] : null;
  const gapStepIndex = comp.gapKey ? steps.findIndex((s) => s.key === comp.gapKey) : -1;

  // Overview-card values & status per step.
  const contribTotal = draft.people.reduce((s, pp) => s + pp.voluntaryConcessional + pp.voluntaryNonConcessional, 0);
  // Impact hints: what each optional section adds to the projection (vs. without it).
  const contribImpact =
    previewReady && contribMode === "yes" && contribTotal > 0
      ? Math.max(0, preview.superAtRetirement - simulate({ ...draft, people: draft.people.map((pp) => ({ ...pp, voluntaryConcessional: 0, voluntaryNonConcessional: 0 })) }, config).superAtRetirement)
      : 0;
  const outsideImpact =
    previewReady && outsideMode === "yes" && (draft.outsideSuper > 0 || draft.annualOutsideSavings > 0)
      ? Math.max(0, preview.totalAtRetirement - simulate({ ...draft, outsideSuper: 0, annualOutsideSavings: 0 }, config).totalAtRetirement)
      : 0;
  const stepValue = (key: string): string => {
    switch (key) {
      case "household": return `${isCouple ? "Couple" : "Single"} · ${draft.homeowner ? "Owner" : "Renter"}`;
      case "you": return Number.isFinite(previewSuper) ? `${fmtCurrency(previewSuper)} super` : "Not set yet";
      case "partner": return draft.people[1] && Number.isFinite(draft.people[1].superBalance) ? `${fmtCurrency(draft.people[1].superBalance)} super` : "";
      case "contributions": return contribMode === undefined ? "Not set yet" : contribMode === "no" ? "None" : `${fmtCurrency(contribTotal)}/yr`;
      case "outside": return outsideMode === undefined ? "Not set yet" : outsideMode === "no" ? "None" : fmtCurrency(draft.outsideSuper);
      case "property": return propMode === undefined ? "Not set yet" : propMode === "no" ? "None" : "Included";
      case "goal": return Number.isFinite(previewSpend) ? `${fmtCurrency(previewSpend)}/yr · retire ${draft.retirementAge}` : "Not set yet";
      case "assumptions": return `${draft.investmentReturn}% · CPI ${draft.inflation}% · to ${draft.lifeExpectancy}`;
      default: return "";
    }
  };
  const stepStatus = (key: string): { text: string; tone: string } => {
    if (key === "assumptions") return tuned ? { text: "★ Tuned", tone: "text-cyan-300" } : { text: "Defaults", tone: "text-muted" };
    const sec = sectionState[key];
    if (!sec?.complete) return sec?.optional ? { text: "＋ Add", tone: "text-amber-300" } : { text: "Needs info", tone: "text-amber-300" };
    // Complete — for enrichments, show what they add to the projection.
    if (key === "contributions" && contribImpact > 500) return { text: `✓ +${fmtCompact(contribImpact)} super`, tone: "text-accent" };
    if (key === "outside" && outsideImpact > 500) return { text: `✓ +${fmtCompact(outsideImpact)}`, tone: "text-accent" };
    return { text: "✓ Done", tone: "text-accent" };
  };
  const goToStep = (i: number) => { setStep(i); setView("step"); };

  // Finish only when the essentials are actually entered; otherwise jump to the
  // first step still missing a required figure (rather than completing on NaN).
  const finish = () => {
    if (previewReady) {
      onComplete(draft);
      return;
    }
    const youMissing =
      !draft.people.every((pp) => Number.isFinite(pp.currentAge) && Number.isFinite(pp.salary)) ||
      !Number.isFinite(previewSuper);
    const idx = steps.findIndex((s) => s.key === (youMissing ? "you" : "goal"));
    if (idx >= 0) goToStep(idx);
  };

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
      <div key={view} className="wizfade relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        {view === "summary" ? (
          <>
            {/* Overview header */}
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="text-lg font-bold text-white">Your plan overview</h2>
              <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted transition hover:bg-panel-2 hover:text-white">✕</button>
            </div>

            {/* Big progress donut + a card per section (budget-builder style).
                Height matches the step pages so the modal doesn't jump. */}
            <div className="h-[622px] max-h-[calc(90vh-150px)] overflow-y-auto px-6 py-5">
              <div className="flex flex-col items-center text-center">
                <CompletenessRing pct={pct} size={88} />
                <div className="mt-2 text-sm font-semibold text-accent">{tier}</div>
                <div className="text-xs text-muted">
                  {completeCount} of {total} details provided{tuned ? " · ★ fine-tuned" : ""}
                </div>
                <p className="mt-1 text-xs text-muted">Tap a section to add detail.</p>
              </div>

              <div className="mt-4 space-y-1.5">
                {steps.map((s, i) => {
                  const st = stepStatus(s.key);
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => goToStep(i)}
                      className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel-2/60 px-3 py-1 text-left transition hover:border-accent/40"
                    >
                      <StepIcon stepKey={s.key} size={18} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-white">{s.nav}</div>
                        <div className="truncate text-xs text-muted">{STEP_META[s.key]?.desc}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold tabular-nums text-white">{stepValue(s.key)}</div>
                        <div className={`text-[11px] font-semibold ${st.tone}`}>{st.text}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Overview footer */}
            <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
              <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-muted transition hover:text-white">
                Cancel
              </button>
              <button
                onClick={() => (gapStepIndex >= 0 ? goToStep(gapStepIndex) : finish())}
                className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft"
              >
                {gapStepIndex >= 0 ? "Add missing details →" : configured ? "Update plan" : "See my plan"}
              </button>
            </div>
          </>
        ) : (
        <>
        {/* Header — completeness ring + tier, with the current step title */}
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <CompletenessRing pct={pct} />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold leading-tight text-white">
                {current.title}
              </h2>
              <div className="mt-0.5 text-xs font-medium text-accent transition-colors">
                {tier} · {completeCount}/{total} details provided{tuned ? " · ★ fine-tuned" : ""}
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
          <button
            type="button"
            onClick={() => setView("summary")}
            className="rounded-full bg-panel-2 px-2.5 py-1 text-xs font-medium text-muted transition hover:text-white"
            title="Back to overview"
          >
            ☰ Overview
          </button>
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

        {/* Body — fixed height so the modal doesn't resize between steps; scrolls
            internally when a step's content is taller. */}
        <div className="h-[420px] max-h-[calc(90vh-340px)] overflow-y-auto px-6 py-6">
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
              <span className="min-w-0 truncate text-slate-300">
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
        {previewReady ? (
          <div className="mx-6 mb-2 flex items-center justify-between rounded-xl border border-line bg-panel-2 px-4 py-3">
            <div>
              <div className="text-xs text-muted">Super at retirement <span className="text-muted/70">(today&apos;s $)</span></div>
              <div className="text-base font-bold tabular-nums text-white">
                {fmtCurrency(preview.superAtRetirement)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted">Chance it lasts to {draft.lifeExpectancy}</div>
              <div
                className={`text-base font-bold tabular-nums ${
                  successPct >= Math.round(MC_CONFIDENCE_TARGET * 100)
                    ? "text-accent"
                    : successPct >= 60
                      ? "text-amber-400"
                      : "text-red-400"
                }`}
              >
                {successPct}%{passesBar ? " ✓" : ""}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-6 mb-2 rounded-xl border border-line bg-panel-2 px-4 py-3 text-center text-xs text-muted">
            Add your age, super, salary and spending to see your projection.
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          <button
            onClick={() => (safeStep === 0 ? setView("summary") : setStep(safeStep - 1))}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted transition hover:text-white"
          >
            {safeStep === 0 ? "← Overview" : "← Back"}
          </button>
          <button
            onClick={() => {
              if (isLast) {
                finish();
                return;
              }
              onProgress?.(draft); // save progress as they advance
              setStep(safeStep + 1);
            }}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft"
          >
            {isLast ? (configured ? "Update plan" : "See my plan") : "Next →"}
          </button>
        </div>
        </>
        )}
      </div>

      {/* Budget builder, nested over the wizard — applies back to the draft and
          returns here on close, so spending stays in one place. */}
      {budgetOpen && (
        <BudgetBuilder
          plan={draft}
          config={config}
          onApply={(update) => {
            setDraft((prev) => ({ ...prev, ...update }));
            setBudgetOpen(false);
          }}
          onClose={() => setBudgetOpen(false)}
        />
      )}
    </div>
  );
}
