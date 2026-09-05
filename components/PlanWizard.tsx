"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Field from "@/components/Field";
import HomeEditor, { DEFAULT_HOME, defaultMortgage } from "@/components/HomeEditor";
import CompletenessRing from "@/components/CompletenessRing";
import BudgetBuilder from "@/components/BudgetBuilder";
import BudgetQuest from "@/components/BudgetQuest";
import PropertyCard from "@/components/PropertyCard";
import IncomeStreamsEditor from "@/components/IncomeStreamsEditor";
import { simulate } from "@/lib/au/simulate";
import { runMonteCarlo, MC_CONFIDENCE_MC, MC_CONFIDENCE_TARGET } from "@/lib/au/montecarlo";
import type { EngineConfig } from "@/lib/au/config";
import { fmtCompact, fmtCurrency } from "@/lib/au/format";
import { planCompleteness } from "@/lib/au/completeness";
import { essentialsFloor } from "@/lib/au/strategies";
import { mortgageAnnualCost } from "@/lib/au/mortgage";
import InfoTip from "@/components/InfoTip";
import { WizardHeaderCard } from "@/components/WizardArt";
import { STEP_META, personaAvatarSrc, StepIcon } from "@/components/wizardVisuals";
import { track } from "@/lib/analytics";
import {
  DEFAULT_PARTNER,
  DEFAULT_PLAN,
  getInvestmentProperties,
  hasInvestmentProperty,
  personRetirementAge,
  type HomeDetail,
  type HomeTenure,
  type Household,
  type MortgageDetail,
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

// A little inspiration on the overview — one is picked at random each time it opens.
const WIZARD_QUOTES: { text: string; author: string }[] = [
  { text: "The question isn't at what age I want to retire, it's at what income.", author: "George Foreman" },
  { text: "Do not save what is left after spending, but spend what is left after saving.", author: "Warren Buffett" },
  { text: "Someone's sitting in the shade today because someone planted a tree a long time ago.", author: "Warren Buffett" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese proverb" },
  { text: "A goal without a plan is just a wish.", author: "Antoine de Saint-Exupéry" },
  { text: "It's not how much money you make, but how much money you keep.", author: "Robert Kiyosaki" },
  { text: "The goal isn't more money. The goal is living life on your terms.", author: "Chris Brogan" },
  { text: "Don't simply retire from something; have something to retire to.", author: "Harry Emerson Fosdick" },
  { text: "Time is more valuable than money. You can get more money, but you cannot get more time.", author: "Jim Rohn" },
  { text: "Plan for the future, because that's where you're going to spend the rest of your life.", author: "Mark Twain" },
  { text: "Retirement is not the end of the road; it's the beginning of the open highway.", author: "Unknown" },
  { text: "Financial peace is learning to live on less than you make.", author: "Dave Ramsey" },
];

// Interesting financial facts for the Household card, tagged by who they're for.
const HOUSEHOLD_FACTS: { audience: "single" | "couple" | "both"; text: string }[] = [
  { audience: "both", text: "Your family home doesn't count towards the Age Pension assets test — no matter what it's worth." },
  { audience: "both", text: "The Age Pension is indexed twice a year (March and September), so it keeps pace with the cost of living." },
  { audience: "both", text: "Super earnings become completely tax-free once you start a retirement pension from age 60." },
  { audience: "both", text: "A 65-year-old Australian today can, on average, expect to live into their mid-80s — plan for a long retirement." },
  { audience: "single", text: "A single homeowner can hold around $314,000 in assets (on top of the home) and still get the full Age Pension." },
  { audience: "single", text: "Singles get a higher Age Pension rate per person than each half of a couple — the rules assume couples share costs." },
  { audience: "single", text: "The maximum Age Pension for a single is around $31,000 a year, including the supplements." },
  { audience: "single", text: "As a solo retiree you set every date and dial yourself — no need to sync two retirement ages or risk appetites." },
  { audience: "couple", text: "Couples can retire at different ages — whoever's still working keeps earning and topping up super." },
  { audience: "couple", text: "A couple's combined Age Pension is worth around $47,000 a year at the full rate." },
  { audience: "couple", text: "Two tax-free thresholds beat one: splitting income across a couple can cut your retirement tax bill." },
  { audience: "couple", text: "A couple's plan only needs to last while EITHER partner is alive — a quiet but powerful longevity buffer." },
  { audience: "couple", text: "If you both downsize, each partner can put up to $300,000 into super — $600,000 tax-free between you." },
];

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
  const [budgetPlayMode, setBudgetPlayMode] = useState(false); // Budget Quest opt-in play mode
  useEffect(() => {
    try { setBudgetPlayMode(localStorage.getItem("rw:budget-play") === "1"); } catch { /* ignore */ }
  }, []);
  const setBudgetPlay = (on: boolean) => {
    setBudgetPlayMode(on);
    try { localStorage.setItem("rw:budget-play", on ? "1" : "0"); } catch { /* ignore */ }
  };

  // Explicit "have you told us?" state for the optional sections that otherwise
  // default to $0 (so we can't tell "none" from "not answered yet"). Seeded from
  // the incoming plan; drives the completeness meter and reveals the fields.
  const hasContrib = initial.people.some((p) => p.voluntaryConcessional > 0 || p.voluntaryNonConcessional > 0);
  const hasOutside = initial.outsideSuper > 0 || initial.annualOutsideSavings > 0;
  // Recover the yes/no answer from data + the persisted `answered` flags.
  const [contribMode, setContribMode] = useState<OptMode | undefined>(hasContrib ? "yes" : initial.answered?.contributions ? "no" : undefined);
  const [outsideMode, setOutsideMode] = useState<OptMode | undefined>(hasOutside ? "yes" : initial.answered?.outside ? "no" : undefined);
  const [propMode, setPropMode] = useState<OptMode | undefined>(hasInvestmentProperty(initial) ? "yes" : initial.answered?.property ? "no" : undefined);
  const [incomeMode, setIncomeMode] = useState<OptMode | undefined>(
    (initial.incomeStreams ?? []).some((s) => s.perYear > 0) ? "yes" : initial.answered?.income ? "no" : undefined,
  );
  // Accordion: which property card is expanded (index), or null when all are
  // collapsed to summary rows. Reset to collapsed whenever the step/view changes
  // so arriving at the Property section always starts collapsed; adding a
  // property (same step) opens just that one.
  const [openProp, setOpenProp] = useState<number | null>(null);
  // One inspirational quote per wizard open, for the overview hero.
  const [quote] = useState(() => WIZARD_QUOTES[Math.floor(Math.random() * WIZARD_QUOTES.length)]);
  // A random financial fact for the Household card — re-rolled when single⇄couple
  // changes so it always fits the household.
  const pickFact = (household: RetirementPlan["household"]) => {
    const pool = HOUSEHOLD_FACTS.filter((f) => f.audience === "both" || f.audience === household);
    return pool[Math.floor(Math.random() * pool.length)]?.text ?? "";
  };
  const [householdFact, setHouseholdFact] = useState(() => pickFact(initial.household));
  useEffect(() => {
    setOpenProp(null);
  }, [step, view]);

  // Save progress when the user changes PAGE — the step or the overview view —
  // rather than on every keystroke. Editing a page stays fully local (snappy, no
  // server chatter); the current draft is mirrored to the plan only when they move
  // between pages, plus a flush on close so the last page's edits are never lost.
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;
  const liveDraftRef = useRef(draft);
  liveDraftRef.current = draft;
  const pageMounted = useRef(false);
  useEffect(() => {
    if (!pageMounted.current) {
      pageMounted.current = true; // skip the initial page (nothing to save on open)
      return;
    }
    progressRef.current?.(liveDraftRef.current);
  }, [step, view]);
  // Flush on close (covers ✕ / Close / backdrop / finishing).
  useEffect(() => () => progressRef.current?.(liveDraftRef.current), []);

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
  const answerIncome = (v: OptMode) => {
    setIncomeMode(v);
    setDraft((prev) => ({
      ...prev,
      answered: { ...prev.answered, income: true },
      ...(v === "no" ? { incomeStreams: [] } : {}),
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

  const setHousehold = (household: Household) => {
    if (household !== draft.household) setHouseholdFact(pickFact(household)); // fresh fact for the new household
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
  };

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

  // ── Family home (its own wizard step) ──────────────────────────────────────
  // Edits the same plan fields the budget reads (homeowner / home / mortgage). Tenure
  // is derived from those; local state preserves a home's value/loan if the user flips
  // to "renting" and back within the step.
  const oldestAtRetire =
    Math.max(...draft.people.map((p) => p.currentAge)) +
    Math.max(0, draft.retirementAge - draft.people[0].currentAge);
  const [homeTenure, setHomeTenure] = useState<HomeTenure>(
    !draft.homeowner ? "rent" : draft.mortgage ? "mortgage" : "own",
  );
  const [homeDetail, setHomeDetail] = useState<HomeDetail>(draft.home ?? DEFAULT_HOME);
  const [homeMortgage, setHomeMortgage] = useState<MortgageDetail>(draft.mortgage ?? defaultMortgage(oldestAtRetire));
  // Write the ACTIVE values through to the draft (renter → no home/loan; owner-outright
  // → no loan), mirroring how the budget resolved them.
  const syncHome = (t: HomeTenure, h: HomeDetail, m: MortgageDetail) =>
    patch({
      homeowner: t !== "rent",
      home: t !== "rent" ? h : undefined,
      mortgage: t === "mortgage" ? m : undefined,
    });
  const homeStrategyCompare = useMemo(() => {
    if (homeTenure !== "mortgage") return null;
    const base = { ...draft, homeowner: true, home: homeDetail, mortgage: homeMortgage };
    const run = (strategy: MortgageDetail["strategy"]) => simulate({ ...base, mortgage: { ...homeMortgage, strategy } }, config);
    const firstPension = (r: ReturnType<typeof simulate>) => r.rows.find((x) => x.phase === "pension")?.agePension ?? 0;
    const carry = run("carry");
    const clear = run("clear_at_retirement");
    return {
      carryLasts: carry.lastsToLifeExpectancy ? null : carry.depletedAge,
      clearLasts: clear.lastsToLifeExpectancy ? null : clear.depletedAge,
      pensionUplift: Math.round(firstPension(clear) - firstPension(carry)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeTenure, homeDetail, homeMortgage, draft, config]);
  // A homeowner's plan should carry a home value from the outset (net worth, the nav
  // summary, the budget presets) rather than sitting at $0 until they open the step.
  // Seed the default once when it's missing; existing plans with a home are untouched,
  // and renters get none.
  useEffect(() => {
    if (draft.homeowner && !draft.home) {
      patch(homeTenure === "mortgage" ? { home: homeDetail, mortgage: homeMortgage } : { home: homeDetail });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build steps dynamically (partner step only for couples).
  const personStep = (i: number, title: string, subtitle: string) => ({
    key: i === 0 ? "you" : "partner",
    nav: i === 0 ? "You" : "Partner",
    title,
    subtitle,
    body: (
      <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-2xl border border-line bg-panel-2/60 p-4 sm:col-span-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">Where you&apos;re starting from</div>
            <p className="mt-1 text-sm leading-relaxed text-slate-200">
              {i === 0
                ? "Your age, super balance and salary today — the starting point the whole projection is built on."
                : "Your partner's age, super and salary today — so we can project your retirement together."}
            </p>
          </div>
          <img
            src={personaAvatarSrc(draft.people[i]?.sex, i === 1)}
            alt=""
            aria-hidden
            className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-line"
          />
        </div>
        <Field
          label="Current age"
          value={draft.people[i].currentAge}
          onChange={setPerson(i, "currentAge")}
          min={18}
          max={75}
          integer
          suffix="yrs"
        />
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-200">
            Sex <span className="font-normal text-muted">(optional)</span>
            <InfoTip text="Only for the longevity (“Rich, Broke or Dead”) survival view on the stress test — never the projection." />
          </div>
          <Segmented
            value={draft.people[i].sex ?? ""}
            options={[
              { value: "female", label: "Female" },
              { value: "male", label: "Male" },
              { value: "", label: "Rather not say" },
            ]}
            onChange={(v) =>
              setDraft((prev) => ({
                ...prev,
                people: prev.people.map((p, idx) => (idx === i ? { ...p, sex: v === "" ? undefined : (v as "male" | "female") } : p)),
              }))
            }
          />
        </div>
        <div className="sm:col-span-2">
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
          <div className="sm:col-span-2">
            <Field
              label="Current super balance"
              value={draft.people[i].superBalance}
              onChange={setPerson(i, "superBalance")}
              min={0}
              max={3_000_000}
              step={1000}
              prefix="$"
            />
          </div>
        )}
      </div>
    ),
  });

  const contributionsStep = {
    key: "contributions",
    nav: "Super",
    title: "Extra super contributions",
    subtitle: "",
    body: (
      <div className="space-y-6">
        <WizardHeaderCard
          page="contributions"
          eyebrow="Boost your super"
          blurb="Voluntary contributions on top of the 12% your employer pays — small, regular top-ups compound into a lot over a working life."
        />
        <OptionalAnswer
          question="Do you add extra to super?"
          hint="On top of the 12% Super Guarantee your employer pays."
          mode={contribMode}
          onChange={answerContributions}
        />
        {contribMode === "no" && (
          <p className="text-xs text-muted">Just the employer Super Guarantee, then — you can change this anytime.</p>
        )}
        {contribMode === "yes" && draft.people.map((person, i) => {
          // The concessional cap covers the employer SG + any salary sacrifice, so the
          // room to sacrifice before hitting the cap is the cap less the SG (salary × SG
          // rate). We surface that headroom but let the slider run to the full cap so the
          // user can freely dial it up to max their cap (the engine caps the modelled
          // concessional at the annual cap, so sliding past the room just holds total at
          // the cap — it never over-contributes).
          const sg = Math.max(0, person.salary * config.sgRate);
          const room = Math.max(0, config.concessionalCap - sg);
          const remaining = Math.max(0, room - person.voluntaryConcessional);
          return (
          <div key={i} className="space-y-4">
            {isCouple && (
              <div className="text-xs font-semibold uppercase tracking-wide text-accent">
                {i === 0 ? "You" : "Partner"}
              </div>
            )}
            <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
              <Field
                label="Salary sacrifice (before tax)"
                value={person.voluntaryConcessional}
                onChange={setPerson(i, "voluntaryConcessional")}
                min={0}
                max={config.concessionalCap}
                step={500}
                prefix="$"
                hint={
                  room <= 0
                    ? `Your employer SG (~${fmtCurrency(sg)}/yr) already reaches the ${fmtCurrency(config.concessionalCap)} concessional cap.`
                    : remaining > 0
                      ? `Concessional cap ${fmtCurrency(config.concessionalCap)}/yr incl. your ~${fmtCurrency(sg)}/yr employer SG — ${fmtCurrency(remaining)} more before you hit the cap.`
                      : `✓ You've maxed the ${fmtCurrency(config.concessionalCap)} concessional cap (SG ${fmtCurrency(sg)} + ${fmtCurrency(room)} sacrifice). Anything above just holds at the cap — it isn't over-contributed.`
                }
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
          </div>
          );
        })}
      </div>
    ),
  };

  const outsideStep = {
    key: "outside",
    nav: "Savings",
    title: "Savings outside super",
    subtitle: "",
    body: (
      <div className="space-y-6">
        <WizardHeaderCard
          page="outside"
          eyebrow="Savings outside super"
          blurb="Investments you can reach any time — shares, savings, an offset. They fund the early-retirement years before super unlocks at 60."
        />
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
          <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
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
          </div>
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
    subtitle: "",
    body: (
      <div className="space-y-5">
        <WizardHeaderCard
          page="property"
          eyebrow="Investment property"
          blurb="Unlike your home, an investment property counts for the Age Pension — its net equity as an asset, its actual rent as income."
        />
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

  const homeStep = {
    key: "home",
    nav: "Your home",
    title: "Your family home",
    subtitle: "",
    body: (
      <div className="space-y-5">
        <WizardHeaderCard
          page="home"
          eyebrow="Your home"
          blurb="Your home is exempt from the Age Pension assets test. We track its value for your net-worth picture, and model any mortgage you carry into retirement."
        />
        <HomeEditor
          showTenure
          tenure={homeTenure}
          onTenure={(t) => {
            setHomeTenure(t);
            syncHome(t, homeDetail, homeMortgage);
          }}
          home={homeDetail}
          onHome={(p) => {
            const h = { ...homeDetail, ...p };
            setHomeDetail(h);
            syncHome(homeTenure, h, homeMortgage);
          }}
          mortgage={homeMortgage}
          onMortgage={(p) => {
            const m = { ...homeMortgage, ...p };
            setHomeMortgage(m);
            syncHome(homeTenure, homeDetail, m);
          }}
          oldestAtRetire={oldestAtRetire}
          lifeExpectancy={draft.lifeExpectancy}
          strategyCompare={homeStrategyCompare}
        />
      </div>
    ),
  };

  const incomeStep = {
    key: "income",
    nav: "Other income",
    title: "Other income",
    subtitle: "",
    body: (
      <div className="space-y-6">
        <WizardHeaderCard
          page="income"
          eyebrow="Other income"
          blurb="Income beyond your super and savings — a pension, annuity, dividend, or foreign pension (e.g. US Social Security), for life or a set period. It offsets what you draw from savings. Most people can skip this."
        />
        <OptionalAnswer
          question="Any other income to include?"
          hint="A pension, annuity, dividend, or foreign pension — for life or a set period (e.g. dividends until you retire)."
          mode={incomeMode}
          onChange={answerIncome}
        />
        {incomeMode === "no" && (
          <p className="text-xs text-muted">No other income streams — you can add them anytime.</p>
        )}
        {incomeMode === "yes" && (
          <IncomeStreamsEditor
            streams={draft.incomeStreams ?? []}
            minAge={Math.min(...draft.people.map((p) => p.currentAge).filter((a) => Number.isFinite(a) && a > 0), draft.retirementAge)}
            maxAge={draft.lifeExpectancy}
            defaultAge={draft.retirementAge}
            nonResident={draft.taxResidency === "non-resident"}
            couple={draft.household === "couple"}
            onChange={(incomeStreams) => setDraft((prev) => ({ ...prev, incomeStreams }))}
          />
        )}
      </div>
    ),
  };

  // Retirement-goal spending, for the Goal card: living (essentials + discretionary)
  // + any home loan + any rent. The spending "smile" only tapers the LIVING part.
  // The home loan is shown as its NOMINAL annual payment (mirroring the budget
  // builder, the single source of truth for the goal) — NOT the simulation's
  // today's-dollars-at-retirement value, so the two goal cards always agree. Because
  // it's a fixed dollar payment its REAL cost eases over the retirement years, which
  // the per-year income view reflects (a note below explains this).
  const goalFirstRow = preview.rows.find((r) => (r.spending ?? 0) > 0);
  const goalLiving = goalFirstRow?.breakdown.livingSpend ?? (Number.isFinite(previewSpend) ? previewSpend : 0);
  const goalEssentials = Math.min(essentialsFloor(draft, config), goalLiving);
  const goalDiscretionary = Math.max(0, goalLiving - goalEssentials);
  const goalMortgage = draft.mortgage && draft.mortgage.strategy === "carry" ? mortgageAnnualCost(draft.mortgage) : 0;
  const goalRent = goalFirstRow?.breakdown.rentCost ?? 0;
  const goalTotalSpend = goalLiving + goalMortgage + goalRent;
  const goalBreakdownParts = [
    goalEssentials > 0 ? `${fmtCurrency(Math.round(goalEssentials))} essentials` : null,
    goalDiscretionary > 0 ? `${fmtCurrency(Math.round(goalDiscretionary))} discretionary` : null,
    goalMortgage > 0 ? `${fmtCurrency(Math.round(goalMortgage))} home loan` : null,
    goalRent > 0 ? `${fmtCurrency(Math.round(goalRent))} rent` : null,
  ].filter(Boolean);

  const goalStep = {
    key: "goal",
    nav: "Goal",
    title: "Your retirement goal",
    subtitle: "",
    body: (
      <div className="space-y-6">
        <WizardHeaderCard
          page="goal"
          eyebrow="Your retirement goal"
          blurb="When you'll stop working and how much you'll spend each year — the target the whole plan is built to reach."
        />
        <div className="grid grid-cols-1 items-start gap-x-5 gap-y-5 sm:grid-cols-2">
          <Field
            label={isCouple ? "Your retirement age" : "Retirement age"}
            value={draft.retirementAge}
            onChange={(v) => patch({ retirementAge: v })}
            min={40}
            max={75}
            integer
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
              integer
              suffix="yrs"
              hint="Partners can retire at different ages — whoever keeps working still earns, contributes, and helps cover spending."
            />
          )}
        </div>

        {/* Spending is set exclusively in the budget builder — one source of
            truth, so the wizard and budget can never disagree. */}
        <div className="rounded-xl border border-line bg-panel-2 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Retirement spending</div>
          <div className="mt-1 text-lg font-bold text-white">
            {!Number.isFinite(previewSpend)
              ? "Not set yet"
              : `${fmtCurrency(Math.round(goalTotalSpend))}/yr${draft.spendingMode === "stages" ? " go-go" : ""}`}
          </div>
          {Number.isFinite(previewSpend) && goalBreakdownParts.length > 0 && (
            <div className="mt-0.5 text-xs text-muted">{goalBreakdownParts.join(" · ")}</div>
          )}
          {draft.spendingMode === "stages" && (
            <div className="mt-0.5 text-xs text-muted">
              Living costs ease {fmtCurrency(draft.spendingStages.goGo)} → {fmtCurrency(draft.spendingStages.slowGo)} → {fmtCurrency(draft.spendingStages.noGo)} as you age
              {goalMortgage > 0 ? "; the home loan sits on top" : ""}
            </div>
          )}
          {goalMortgage > 0 && (
            <div className="mt-1 text-[11px] leading-snug text-muted">
              Your {fmtCurrency(Math.round(goalMortgage))}/yr home loan is a fixed dollar payment, so its
              real cost eases over the years — the year-by-year projection shows it a little lower.
            </div>
          )}
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
    draft.taxResidency === "non-resident" ||
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
    subtitle: "",
    body: (
      <div className="space-y-5">
        <WizardHeaderCard
          page="assumptions"
          eyebrow="The long-run numbers"
          blurb="Returns, inflation and fees behind the projection. Sensible defaults are set — tweak them only if you want to."
        />
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
        <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
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
          integer
          suffix="yrs"
        />
        </div>
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
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
        <div className="space-y-3 rounded-xl border border-line bg-panel-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              Tax residency (advanced)
            </div>
            <Segmented
              value={draft.taxResidency === "non-resident" ? "non-resident" : "resident"}
              onChange={(v) => patch({ taxResidency: v === "non-resident" ? "non-resident" : "resident" })}
              options={[
                { value: "resident", label: "Resident" },
                { value: "non-resident", label: "Non-resident" },
              ]}
            />
          </div>
          <p className="text-xs text-muted">
            Most people are <strong className="text-slate-300">Australian tax residents</strong>. Choose{" "}
            <strong className="text-slate-300">Non-resident</strong> if you live permanently overseas: retirement income is
            then taxed on the foreign-resident scale (no tax-free threshold, no Medicare or seniors offset), only{" "}
            <strong className="text-slate-300">Australian-sourced</strong> income is taxed (a foreign pension or your
            share portfolio falls outside Australian tax), and the Age Pension is treated as not claimable from abroad.
            Non-resident tax is complex (source rules and tax treaties vary) — this is an estimate.
          </p>
          {draft.taxResidency === "non-resident" && (
            <label className="flex items-center gap-2 text-xs text-slate-200">
              <input
                type="checkbox"
                checked={!!draft.claimAgePensionAbroad}
                onChange={(e) => patch({ claimAgePensionAbroad: e.target.checked })}
                className="h-4 w-4 accent-teal-500"
              />
              I keep an Age Pension entitlement while abroad (portability varies)
            </label>
          )}
        </div>
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
        {/* Persona + a household-appropriate financial fact */}
        <div className="flex items-center gap-4 rounded-2xl border border-line bg-panel-2/60 p-4">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">Did you know?</div>
            <p className="mt-1 text-sm leading-relaxed text-slate-200">{householdFact}</p>
          </div>
          <div className="flex shrink-0 items-center" aria-hidden>
            {draft.household === "couple" ? (
              <>
                <img src={personaAvatarSrc(draft.people[0]?.sex, false)} alt="" className="h-14 w-14 rounded-full object-cover ring-2 ring-panel-2" />
                <img src={personaAvatarSrc(draft.people[1]?.sex, true)} alt="" className="-ml-5 h-14 w-14 rounded-full object-cover ring-2 ring-panel-2" />
              </>
            ) : (
              <img src={personaAvatarSrc(draft.people[0]?.sex, false)} alt="" className="h-16 w-16 rounded-full object-cover ring-1 ring-line" />
            )}
          </div>
        </div>
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
    personStep(0, isCouple ? "About you" : "About you", ""),
    ...(isCouple ? [personStep(1, "About your partner", "")] : []),
    contributionsStep,
    outsideStep,
    propertyStep,
    homeStep,
    incomeStep,
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
      case "household": return isCouple ? "Couple" : "Single";
      case "home":
        return !draft.homeowner
          ? "Renting"
          : draft.mortgage
            ? `${fmtCurrency(draft.home?.value ?? 0)} · mortgage`
            : `${fmtCurrency(draft.home?.value ?? 0)} · owned`;
      case "you": return Number.isFinite(previewSuper) ? `${fmtCurrency(previewSuper)} super` : "Not set yet";
      case "partner": return draft.people[1] && Number.isFinite(draft.people[1].superBalance) ? `${fmtCurrency(draft.people[1].superBalance)} super` : "";
      case "contributions": return contribMode === undefined ? "Not set yet" : contribMode === "no" ? "None" : `${fmtCurrency(contribTotal)}/yr`;
      case "outside": return outsideMode === undefined ? "Not set yet" : outsideMode === "no" ? "None" : fmtCurrency(draft.outsideSuper);
      case "property": return propMode === undefined ? "Not set yet" : propMode === "no" ? "None" : "Included";
      case "income": {
        const streams = (draft.incomeStreams ?? []).filter((s) => s.perYear > 0);
        if (streams.length === 0) return incomeMode === undefined ? "Not set yet" : "None";
        const total = streams.reduce((s, x) => s + x.perYear, 0);
        return `${fmtCurrency(total)}/yr${streams.length > 1 ? ` · ${streams.length} streams` : ""}`;
      }
      case "goal": return Number.isFinite(previewSpend) ? `${fmtCurrency(Math.round(goalTotalSpend))}/yr · retire ${draft.retirementAge}` : "Not set yet";
      case "assumptions": return `${draft.investmentReturn}% · CPI ${draft.inflation}% · to ${draft.lifeExpectancy}`;
      default: return "";
    }
  };
  const stepStatus = (key: string): { text: string; tone: string } => {
    if (key === "assumptions") return tuned ? { text: "★ Tuned", tone: "text-cyan-300" } : { text: "Defaults", tone: "text-muted" };
    // The home always has a value (owner/renter defaults), so it's never "needs info".
    if (key === "home") return { text: "✓ Done", tone: "text-accent" };
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
      <div key={view} className="wizfade relative z-10 flex max-h-[90vh] w-full max-w-lg sm:max-w-[720px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
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
              <div className="grid grid-cols-1 items-center gap-5 sm:grid-cols-2">
                <div className="flex flex-col items-center text-center">
                  <CompletenessRing pct={pct} size={148} />
                  <div className="mt-2 text-base font-semibold text-accent">{tier}</div>
                  <div className="text-xs text-muted">
                    {completeCount} of {total} details provided{tuned ? " · ★ fine-tuned" : ""}
                  </div>
                </div>
                <figure className="relative rounded-2xl border border-line bg-panel-2/60 p-5">
                  <span aria-hidden className="absolute left-3 top-1 select-none text-4xl leading-none text-accent/30">&ldquo;</span>
                  <blockquote className="relative pl-3 text-sm italic leading-relaxed text-slate-200">
                    {quote.text}
                  </blockquote>
                  <figcaption className="mt-2 pl-3 text-xs font-medium text-muted">— {quote.author}</figcaption>
                </figure>
              </div>

              <p className="mt-4 text-center text-xs text-muted sm:text-left">Tap a section to add detail, or jump straight to your plan.</p>

              <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
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
                Close
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
            // "Your home" isn't in the shared completeness meter (kept out so the meter's
            // denominator is unchanged for existing plans), but it always has a value
            // (owner/renter defaults) — so treat it as complete for the nav tick.
            const complete = isAssump ? tuned : s.key === "home" ? true : sec?.complete;
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
        <div className="h-[470px] max-h-[calc(90vh-320px)] overflow-y-auto px-6 py-6">
          {current.subtitle && <p className="mb-5 text-sm text-muted">{current.subtitle}</p>}
          {current.body}
        </div>

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
              setStep(safeStep + 1); // the page-change effect saves the draft

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
      {budgetOpen && (budgetPlayMode ? (
        <BudgetQuest
          plan={draft}
          config={config}
          onApply={(update) => {
            setDraft((prev) => ({ ...prev, ...update }));
            setBudgetOpen(false);
          }}
          onProgress={(update) => setDraft((prev) => ({ ...prev, ...update }))}
          onClose={() => setBudgetOpen(false)}
          onSwitchToClassic={() => setBudgetPlay(false)}
        />
      ) : (
        <BudgetBuilder
          plan={draft}
          config={config}
          onApply={(update) => {
            setDraft((prev) => ({ ...prev, ...update }));
            setBudgetOpen(false);
          }}
          onProgress={(update) => setDraft((prev) => ({ ...prev, ...update }))}
          onClose={() => setBudgetOpen(false)}
          onSwitchToPlay={() => setBudgetPlay(true)}
        />
      ))}
    </div>
  );
}
