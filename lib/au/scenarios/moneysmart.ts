// Moneysmart external-oracle layer.
//
// The analytical reference (./reference) shares the engine's modelling
// assumptions, so it can't flag where the MODEL itself is simplified (fees,
// Division 293, the Transfer Balance Cap). Moneysmart (ASIC's government
// Retirement Planner) is a genuinely independent third-party calculator. This
// module turns a persona into (a) a precise transcription worksheet telling you
// exactly what to enter into Moneysmart — including the assumption-alignment
// steps that make the two comparable — and (b) the engine's own values for the
// same comparison points, so a saved check becomes an external-anchored test.

import { simulate } from "../simulate";
import { fmtCurrency } from "../format";
import type { EngineConfig } from "../config";
import { DEFAULT_PLAN, type Household, type RetirementPlan } from "../types";

export const MONEYSMART_URL =
  "https://moneysmart.gov.au/plan-for-your-retirement/retirement-planner";

export interface MsPerson {
  currentAge: number;
  salary: number;
  superBalance: number;
}

export interface MsPlanInput {
  household: Household;
  people: MsPerson[];
  outsideSuper: number;
  retirementAge: number;
  targetSpending: number; // desired retirement income, today's dollars
  investmentReturn: number; // %
  inflation: number; // %
  lifeExpectancy: number;
  homeowner: boolean;
}

export const DEFAULT_MS_INPUT: MsPlanInput = {
  household: "single",
  people: [{ currentAge: 55, salary: 90_000, superBalance: 300_000 }],
  outsideSuper: 0,
  retirementAge: 67,
  targetSpending: 45_000,
  investmentReturn: 6,
  inflation: 2.5,
  lifeExpectancy: 92,
  homeowner: true,
};

/** Convert the compact Moneysmart persona into a full engine plan. */
export function toPlan(input: MsPlanInput): RetirementPlan {
  return {
    ...DEFAULT_PLAN,
    household: input.household,
    superMode: "individual",
    people: input.people.map((p) => ({
      currentAge: p.currentAge,
      superBalance: p.superBalance,
      salary: p.salary,
      voluntaryConcessional: 0,
      voluntaryNonConcessional: 0,
    })),
    homeowner: input.homeowner,
    outsideSuper: input.outsideSuper,
    annualOutsideSavings: 0,
    retirementAge: input.retirementAge,
    spendingMode: "flat",
    targetSpending: input.targetSpending,
    investmentReturn: input.investmentReturn,
    inflation: input.inflation,
    lifeExpectancy: input.lifeExpectancy,
    mortgage: undefined,
    investmentProperty: undefined,
    budget: undefined,
  };
}

export type MsUnit = "money" | "age";

export interface MsPointDef {
  key: string;
  label: string;
  unit: MsUnit;
  hint: string; // where to read this value on the Moneysmart results screen
}

// The comparison points — chosen because BOTH tools compute them from aligned
// inputs (accumulation, the means test, and longevity of the balance).
export const MS_POINTS: MsPointDef[] = [
  { key: "super_at_retirement", label: "Super balance at retirement", unit: "money", hint: "Moneysmart's projected super at your retirement age (today's dollars)." },
  { key: "age_pension_year1", label: "Age Pension, first year", unit: "money", hint: "The annual Age Pension shown once you reach pension age." },
  { key: "money_lasts_age", label: "Age your money lasts to", unit: "age", hint: "The age Moneysmart says your super/savings run out (use your planning age if it lasts the whole way)." },
];

/** The engine's own value for each comparison point. */
export function computeAppPoints(input: MsPlanInput, config: EngineConfig): Record<string, number> {
  const r = simulate(toPlan(input), config);
  const pensionRow = r.rows.find((x) => x.phase !== "accumulation" && x.age >= config.agePensionAge && x.agePension > 0);
  return {
    super_at_retirement: Math.round(r.superAtRetirement),
    age_pension_year1: Math.round(pensionRow?.agePension ?? 0),
    money_lasts_age: r.depletedAge ?? input.lifeExpectancy,
  };
}

export interface WorksheetLine {
  field: string;
  enter: string;
  warn?: boolean;
  note?: string;
}

/** Field-by-field instructions for entering the persona into Moneysmart. */
export function worksheet(input: MsPlanInput, config: EngineConfig): { align: string[]; lines: WorksheetLine[] } {
  const f = config.fees;
  const ls = config.livingStandardsGrowthPct ?? 0;
  const wage = input.inflation + ls;
  const align: string[] = [
    `Open the assumptions/advanced panel and set the investment return to ${input.investmentReturn}% (both before and after retirement).`,
    `Set the admin + investment fee to ${f.adminInvestmentPct}%, the fixed admin fee to ${fmtCurrency(f.fixedAdminAnnual)}/yr and insurance to ${fmtCurrency(f.insuranceAnnual)}/yr — this model now uses the same fee assumptions.`,
    `Leave inflation at CPI ${input.inflation}% and rising living standards at ${ls}% (so wage growth ≈ ${wage.toFixed(1)}%) — this model uses the same RG 276 two-stage deflation, so don't force wage growth down to CPI.`,
    "View results in today's dollars.",
  ];

  const lines: WorksheetLine[] = [];
  input.people.forEach((p, i) => {
    const who = input.household === "couple" ? (i === 0 ? " (you)" : " (partner)") : "";
    lines.push({ field: `Age${who}`, enter: `${p.currentAge}` });
    lines.push({ field: `Annual income before tax${who}`, enter: fmtCurrency(p.salary) });
    lines.push({ field: `Current super balance${who}`, enter: fmtCurrency(p.superBalance) });
  });
  lines.push({ field: "Extra contributions", enter: "None (Super Guarantee only)" });
  lines.push({ field: "Age you plan to retire", enter: `${input.retirementAge}` });
  lines.push({ field: "Income you want in retirement (today's $)", enter: `${fmtCurrency(input.targetSpending)}/yr` });
  lines.push({ field: "Do you own your home?", enter: input.homeowner ? "Yes" : "No (renting)" });
  lines.push({ field: "Planning age (life expectancy)", enter: `${input.lifeExpectancy}` });
  if (input.outsideSuper > 0) {
    lines.push({
      field: "Savings outside super",
      enter: fmtCurrency(input.outsideSuper),
      warn: true,
      note: "Moneysmart's planner has limited support for non-super savings. For the cleanest comparison, use a persona with $0 outside super — or note that this figure isn't represented and widen the tolerance.",
    });
  }
  return { align, lines };
}

// ── Saved checks (committed fixtures = external-anchored tests) ───────────────
export interface MsCheckPoint {
  key: string;
  moneysmart: number; // value read off Moneysmart
  tolerancePct: number;
}

export interface MsCheck {
  key: string; // slug
  name: string;
  input: MsPlanInput;
  points: MsCheckPoint[];
  notes: string;
  savedAt: string; // ISO date, stamped by the caller
}
