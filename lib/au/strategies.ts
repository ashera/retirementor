// What-If strategies: each is a pure transform (plan, params) => plan, plus an
// applicability guard so the catalog reflects the baseline scenario. The What-If
// board toggles these on a baseline and re-runs the engine on the composed plan.
// Phase 1 covers the levers that already map to the engine; home downsizing,
// sell-&-rent and part-time work land in later phases.

import type { RetirementPlan } from "./types";
import { getInvestmentProperties, startingSuperBalances } from "./types";
import { fmtCurrency } from "./format";
import { propertyValueAt, capitalGainsTax, netSaleProceeds } from "./property";
import { budgetSplit, presetCategories } from "./budget";
import { incomeTax } from "./tax";
import { simulate } from "./simulate";
import { runMonteCarlo } from "./montecarlo";
import type { EngineConfig } from "./config";

export type StrategyGroup = "home" | "mortgage" | "property" | "timing" | "work";

export const GROUP_LABEL: Record<StrategyGroup, string> = {
  home: "Your home",
  mortgage: "Mortgage",
  property: "Investment property",
  timing: "Timing & contributions",
  work: "Work",
};

export interface StrategyParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  prefix?: string;
  suffix?: string;
  // Optional upper bound derived from the card's other live param values (e.g.
  // the downsizer contribution can't exceed the equity actually freed, which
  // depends on the chosen new-home value and downsize age). The effective slider
  // max is min(max, dynamicMax(values)); returns Infinity to impose no extra cap.
  dynamicMax?: (values: Record<string, number>) => number;
  hint?: string;
}

export interface StrategyCard {
  id: string;
  group: StrategyGroup;
  label: string;
  blurb?: string;
  exclusive?: string; // only one active card per exclusivity key (e.g. "home")
  params: StrategyParam[];
  // Optional live consequence line derived from the card's current param values
  // (e.g. the CGT and net proceeds at the chosen sale age). Shown under the params.
  note?: (values: Record<string, number>) => string;
  apply: (plan: RetirementPlan, values: Record<string, number>) => RetirementPlan;
}

const maxCurrentAge = (p: RetirementPlan) => Math.max(...p.people.map((x) => x.currentAge));
const primarySpend = (p: RetirementPlan) =>
  p.spendingMode === "stages" ? p.spendingStages.goGo : p.targetSpending;

/**
 * The essential ("needs") floor of a plan's spending, held fixed by the Adjust
 * discretionary spending lever. Uses the plan's own guided budget when it has
 * one; otherwise the essential portion of an ASFA 'modest' budget for the
 * household/tenure. Never exceeds current spend (you can't hold more than you spend).
 */
export function essentialsFloor(plan: RetirementPlan, config: EngineConfig): number {
  const cats = plan.budget?.categories ?? presetCategories(config, plan.household, plan.homeowner, "modest");
  const essential = budgetSplit(cats).essential;
  return Math.min(Math.round(essential), Math.round(primarySpend(plan)));
}

/** Set the plan's spend, scaling any staged amounts proportionally to keep shape. */
export function withSpend(p: RetirementPlan, spend: number): RetirementPlan {
  if (p.spendingMode !== "stages") return { ...p, targetSpending: Math.round(spend) };
  const base = p.spendingStages.goGo || spend || 1;
  const f = spend / base;
  return {
    ...p,
    targetSpending: Math.round(spend),
    spendingStages: {
      ...p.spendingStages,
      goGo: Math.round(spend),
      slowGo: Math.round(p.spendingStages.slowGo * f),
      noGo: Math.round(p.spendingStages.noGo * f),
    },
  };
}

/**
 * The highest spend (today's $) at which the plan's money still lasts to life
 * expectancy, found by bisection over withSpend(). Rounded down to $1,000. Used
 * for the "you could spend up to ~$X" read-out on the Adjust spending lever.
 */
export function maxSustainableSpend(plan: RetirementPlan, config: EngineConfig): number {
  const lasts = (s: number) => simulate(withSpend(plan, s), config).lastsToLifeExpectancy;
  const lo0 = 10_000;
  const hi0 = 400_000;
  if (!lasts(lo0)) return lo0; // can't sustain even a minimal spend
  if (lasts(hi0)) return hi0; // sustains beyond the search ceiling
  let lo = lo0;
  let hi = hi0;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (lasts(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo / 1_000) * 1_000;
}

/**
 * The highest spend (today's $) whose Monte Carlo success rate still meets
 * `targetSuccess` (e.g. 0.85) — a *prudent* safe-spend that accounts for
 * sequence-of-returns risk, unlike {@link maxSustainableSpend} which only uses
 * the assumed average return. Bisection; success falls monotonically with spend.
 * ~12 MC runs, so callers should debounce it off the interaction path.
 */
export function maxSpendForConfidence(
  plan: RetirementPlan,
  config: EngineConfig,
  targetSuccess: number,
  mc: { iterations: number; seed: number },
): number {
  const success = (s: number) => runMonteCarlo(withSpend(plan, s), config, mc).successRate;
  const lo0 = 10_000;
  const hi0 = 300_000;
  if (success(lo0) < targetSuccess) return lo0; // can't hit the target even minimally
  if (success(hi0) >= targetSuccess) return hi0; // comfortably funded beyond the ceiling
  let lo = lo0;
  let hi = hi0;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (success(mid) >= targetSuccess) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo / 1_000) * 1_000;
}

/** The default value each param takes for a plan (used when a card is toggled on
 *  before the user tweaks anything). */
export function defaultValues(card: StrategyCard): Record<string, number> {
  return Object.fromEntries(card.params.map((pm) => [pm.key, pm.default]));
}

/** Resolve a card's values: its defaults, overridden by any user edits. */
export function resolveValues(card: StrategyCard, overrides?: Record<string, number>): Record<string, number> {
  return { ...defaultValues(card), ...(overrides ?? {}) };
}

/** Build the strategy catalog applicable to a baseline plan. `opts.superAtAge` /
 *  `opts.outsideAtAge` (when supplied — the board passes them from the baseline
 *  simulation) return the projected super / outside-savings balance at an age, so
 *  the lump-sum and recontribution levers can cap their sliders and notes at the
 *  balance that will actually be there. */
export function buildStrategyCatalog(
  plan: RetirementPlan,
  opts?: { superAtAge?: (age: number) => number; outsideAtAge?: (age: number) => number },
): StrategyCard[] {
  const cards: StrategyCard[] = [];
  const oldest = maxCurrentAge(plan);
  const working = oldest < plan.retirementAge;
  // These levers act on person 0 ("you") — retirement age, salary sacrifice, TTR.
  // For a couple, spell that out so it's clear the partner isn't affected.
  const isCouple = plan.people.length > 1;
  const props = getInvestmentProperties(plan);

  // --- Your home ---
  if (plan.homeowner) {
    const homeVal = Math.max(300_000, Math.round(plan.home?.value ?? 900_000));
    const loan = plan.mortgage?.balance ?? 0;
    const people = plan.people.length;
    const superCap = 300_000 * people; // downsizer contribution cap ($300k/person)
    const oldestNow = Math.max(...plan.people.map((pp) => pp.currentAge));
    const homeGrowth = (plan.home?.growthReal ?? 2) / 100;
    // Equity freed by a downsize to `newValue` at `age`: the home appreciates in
    // real terms until then, net of the new home and any loan. The downsizer
    // contribution can't exceed this — so it bounds the "into super" slider.
    const freedEquity = (v: Record<string, number>) => {
      const yrs = Math.max(0, (v.age ?? oldestNow) - oldestNow);
      const grown = homeVal * Math.pow(1 + homeGrowth, yrs);
      return Math.max(0, grown - (v.newValue ?? homeVal) - loan);
    };
    cards.push({
      id: "downsize",
      group: "home",
      exclusive: "home",
      label: "Downsize your home",
      blurb: `Move from your ${fmtCurrency(homeVal)} home to a cheaper one — the difference${loan ? ", after discharging your mortgage," : ""} is freed into savings, with up to $300k per person able to go into super as a downsizer contribution. Your new (smaller) home stays exempt from the Age Pension, so your net worth carries over — it's just reallocated.`,
      params: [
        {
          key: "age",
          label: "Downsize at age",
          min: Math.max(60, plan.retirementAge),
          max: plan.lifeExpectancy,
          step: 1,
          default: Math.min(plan.lifeExpectancy, Math.max(plan.retirementAge, 66)),
          suffix: "yrs",
        },
        {
          key: "newValue",
          label: "Downsize to a home worth",
          min: 100_000,
          max: homeVal,
          step: 25_000,
          default: Math.round(homeVal * 0.6),
          prefix: "$",
        },
        {
          key: "toSuper",
          label: "Into super (downsizer)",
          min: 0,
          max: superCap,
          step: 10_000,
          default: 0,
          prefix: "$",
          // Can't put more into super than the downsize actually frees.
          dynamicMax: freedEquity,
        },
      ],
      note: (v) => {
        const yrs = Math.max(0, (v.age ?? oldestNow) - oldestNow);
        const grown = Math.round(homeVal * Math.pow(1 + homeGrowth, yrs));
        const newV = Math.round(v.newValue ?? homeVal * 0.6);
        const freed = Math.round(freedEquity(v));
        const toSuper = Math.min(Math.max(0, v.toSuper ?? 0), freed);
        const toSavings = freed - toSuper;
        return (
          `By age ${v.age} your ${fmtCurrency(homeVal)} home is projected to be worth about ` +
          `${fmtCurrency(grown)} in today's dollars (it keeps appreciating until you sell). ` +
          `Downsizing then frees ${fmtCurrency(freed)} — the ${fmtCurrency(grown)} sale price` +
          `${loan ? `, less the ${fmtCurrency(loan)} mortgage payoff,` : ""} less ` +
          `${fmtCurrency(newV)} for your new home` +
          `${toSuper > 0
            ? `, of which ${fmtCurrency(toSuper)} goes into super and ${fmtCurrency(toSavings)} into savings.`
            : ` — all into savings.`}`
        );
      },
      apply: (p, v) => ({
        ...p,
        // Keep the ORIGINAL home value; the new (smaller) value lives on the
        // downsize event, so the engine can grow the home and track it from big →
        // small, computing the freed equity from the grown value at the downsize
        // age so net worth carries across, just reallocated.
        home: {
          value: Math.max(0, p.home?.value ?? 900_000),
          growthReal: p.home?.growthReal ?? 2,
          downsize: { atAge: v.age, newValue: v.newValue, toSuper: v.toSuper },
        },
      }),
    });

    cards.push({
      id: "sell-and-rent",
      group: "home",
      exclusive: "home",
      label: "Sell up and rent",
      blurb: `Sell your ${fmtCurrency(homeVal)} home at the chosen age, freeing all your equity${loan ? " (net of the mortgage)" : ""} into savings, then rent. You move to the higher non-homeowner Age Pension asset thresholds, but pay rent for life (and lose the exempt home).`,
      params: [
        {
          key: "age",
          label: "Sell at age",
          min: Math.max(60, plan.retirementAge),
          max: plan.lifeExpectancy,
          step: 1,
          default: Math.min(plan.lifeExpectancy, Math.max(plan.retirementAge, 70)),
          suffix: "yrs",
        },
        { key: "rent", label: "Rent", min: 0, max: 80_000, step: 1_000, default: 30_000, prefix: "$", suffix: "/yr" },
      ],
      note: (v) => {
        const yrs = Math.max(0, (v.age ?? oldestNow) - oldestNow);
        const grown = Math.round(homeVal * Math.pow(1 + homeGrowth, yrs));
        const freed = Math.max(0, grown - loan);
        return (
          `By age ${v.age} your ${fmtCurrency(homeVal)} home is projected to be worth about ${fmtCurrency(grown)} in ` +
          `today's dollars. Selling frees ${fmtCurrency(freed)}${loan ? ` — the ${fmtCurrency(grown)} sale price less the ${fmtCurrency(loan)} mortgage` : ""} — ` +
          `into your savings. From then you pay ${fmtCurrency(v.rent)}/yr rent and, as a non-homeowner, sit under the higher Age Pension asset thresholds; the home is no longer an exempt asset.`
        );
      },
      apply: (p, v) => ({
        ...p,
        home: {
          value: Math.max(0, p.home?.value ?? 900_000),
          growthReal: p.home?.growthReal ?? 2,
          sellAndRent: { atAge: v.age, rentPerYear: v.rent },
        },
      }),
    });
  }

  // --- Mortgage ---
  if (plan.mortgage && plan.mortgage.strategy !== "clear_at_retirement") {
    cards.push({
      id: "clear-mortgage",
      group: "mortgage",
      label: "Clear the mortgage with super",
      blurb: "Repay the balance with a tax-free super lump sum at retirement — lowers your assessable assets, which can lift the Age Pension.",
      params: [],
      note: () => {
        const m = plan.mortgage!;
        const annual = Math.round(m.type === "interest_only" ? m.balance * (m.interestRate / 100) : m.annualRepayment);
        return (
          `At retirement you draw the ${fmtCurrency(m.balance)} loan balance from super (tax-free once you're 60+) and clear ` +
          `the mortgage. That ends the ~${fmtCurrency(annual)}/yr repayments, and because it lowers your assessable super it can ` +
          `lift your Age Pension — the trade-off is a one-off drop in your super balance.`
        );
      },
      apply: (p) => (p.mortgage ? { ...p, mortgage: { ...p.mortgage, strategy: "clear_at_retirement" } } : p),
    });
  }

  // --- Investment properties (one card each, when currently held) ---
  props.forEach((pr, i) => {
    if (pr.strategy === "sell") return; // already selling in the baseline
    const name = pr.name?.trim() || (props.length > 1 ? `property ${i + 1}` : "the property");
    cards.push({
      id: `sell-prop-${i}`,
      group: "property",
      label: `Sell ${name}`,
      blurb: "Net proceeds (after CGT and the loan) move into your savings.",
      params: [
        {
          key: "age",
          label: "Sell at age",
          min: plan.retirementAge,
          max: plan.lifeExpectancy,
          step: 1,
          default: Math.min(plan.lifeExpectancy, plan.retirementAge + 5),
          suffix: "yrs",
        },
      ],
      // Live tax read-out at the chosen sale age: sale price, CGT and what's left.
      note: (v) => {
        const value = propertyValueAt(pr, Math.max(0, v.age - oldest));
        const cgt = capitalGainsTax(pr, value);
        const loan = pr.loanBalance ?? 0;
        const net = netSaleProceeds(pr, value);
        return `At age ${v.age}: sells for ~${fmtCurrency(value)}${loan ? `, less the ${fmtCurrency(loan)} loan` : ""}, less ~${fmtCurrency(cgt)} CGT → ~${fmtCurrency(net)} into savings.`;
      },
      apply: (p, v) => {
        const arr = getInvestmentProperties(p).map((q, qi) =>
          qi === i ? { ...q, strategy: "sell" as const, sellAtAge: v.age } : q,
        );
        return { ...p, investmentProperties: arr, investmentProperty: undefined };
      },
    });
  });

  // --- Timing & contributions ---
  if (oldest < 75) {
    cards.push({
      id: "retire-later",
      group: "timing",
      label: "Retire later",
      blurb: "More years of contributions and fewer to fund.",
      params: [
        {
          key: "age",
          label: "Retire at",
          min: Math.max(55, oldest),
          max: 75,
          step: 1,
          default: Math.min(75, plan.retirementAge + 3),
          suffix: "yrs",
        },
      ],
      note: (v) => {
        const n = Math.max(0, v.age - plan.retirementAge);
        if (n === 0) return `Retiring at ${v.age} — the same as your current plan.`;
        const lead = isCouple
          ? `You retiring at ${v.age} instead of ${plan.retirementAge} (your partner's retirement age is unchanged)`
          : `Working to age ${v.age} instead of ${plan.retirementAge}`;
        return `${lead} adds ${n} more year${n === 1 ? "" : "s"} of super contributions and growth, ` +
          `and ${n} fewer retirement year${n === 1 ? "" : "s"} to fund — so your balance at retirement is higher ` +
          `and has to stretch over a shorter retirement.`;
      },
      apply: (p, v) => ({ ...p, retirementAge: v.age }),
    });
  }

  // Take a one-off lump sum out of super at a chosen age (tax-free from 60), for a
  // big expense. The slider is capped at the projected balance when available; the
  // engine hard-caps it regardless, so it can never exceed what's there.
  {
    const superAtAge = opts?.superAtAge;
    const minAge = Math.max(60, Math.min(plan.lifeExpectancy - 1, plan.retirementAge));
    cards.push({
      id: "lump-sum",
      group: "timing",
      label: "Take a lump sum",
      blurb:
        "Withdraw a one-off amount from super at a chosen age — a car, a renovation, a big trip, helping the kids. It's tax-free once you're 60, but it's spent, so it steps down what's left to fund the rest of retirement. Capped at your super balance at that age.",
      params: [
        {
          key: "age",
          label: "At age",
          min: minAge,
          max: plan.lifeExpectancy,
          step: 1,
          default: Math.min(plan.lifeExpectancy, Math.max(minAge, plan.retirementAge + 5)),
          suffix: "yrs",
        },
        {
          key: "amount",
          label: "Amount",
          min: 0,
          max: 1_000_000,
          step: 5_000,
          prefix: "$",
          default: 50_000,
          // Can't take more than the super projected to be there at the chosen age.
          dynamicMax: (v) => (superAtAge ? Math.max(0, superAtAge(v.age ?? minAge)) : Infinity),
        },
      ],
      note: (v) => {
        const bal = superAtAge ? Math.round(superAtAge(v.age ?? minAge)) : null;
        const take = bal != null ? Math.min(v.amount, bal) : v.amount;
        const balPart =
          bal != null
            ? ` Your super is projected to be about ${fmtCurrency(bal)} then, so you'd take ${fmtCurrency(take)}${take < v.amount ? " (capped at the balance)" : ""}.`
            : "";
        return (
          `Take ${fmtCurrency(v.amount)} out of super at age ${v.age}, tax-free (you're 60+).${balPart} ` +
          `It's a one-off you spend, so your balance — and how long it lasts — steps down from there.`
        );
      },
      apply: (p, v) => ({ ...p, lumpSum: { atAge: v.age, amount: v.amount } }),
    });
  }

  // Recontribute: move money from outside savings back into super as an after-tax
  // (non-concessional) contribution — a one-off (From age == Until age) or a yearly
  // stream (From age < Until age). Needs outside savings to draw on.
  if (plan.outsideSuper > 0 || plan.annualOutsideSavings > 0) {
    const outsideAtAge = opts?.outsideAtAge;
    const startAge = Math.min(75, Math.max(60, Math.round(plan.retirementAge)));
    cards.push({
      id: "recontribute",
      group: "timing",
      label: "Recontribute savings to super",
      blurb:
        "Move money from your outside-super savings back INTO super as an after-tax (non-concessional) contribution — a one-off, or every year over a range. Inside super its earnings are tax-free, instead of taxed in your own name outside, so the bigger your outside balance the more this saves. Allowed to age 75, within the non-concessional cap, your available savings and the total-super cap. (Its other real benefit — lower tax for your beneficiaries on death — isn't modelled here.)",
      params: [
        {
          key: "amount",
          label: "Amount (each year in the range)",
          min: 0,
          max: 130_000,
          step: 5_000,
          prefix: "$",
          default: 20_000,
          // Can't recontribute more in a year than your savings hold then.
          dynamicMax: (v) => (outsideAtAge ? Math.max(0, outsideAtAge(v.fromAge ?? startAge)) : Infinity),
        },
        { key: "fromAge", label: "From age", min: startAge, max: 75, step: 1, default: startAge, suffix: "yrs" },
        { key: "untilAge", label: "Until age (same as From = one-off)", min: startAge, max: 75, step: 1, default: 75, suffix: "yrs" },
      ],
      note: (v) => {
        const until = Math.max(v.fromAge, v.untilAge);
        const avail = outsideAtAge ? Math.round(outsideAtAge(v.fromAge)) : null;
        const take = avail != null ? Math.min(v.amount, avail) : v.amount;
        const availPart =
          avail != null
            ? ` Your savings outside super are projected to be about ${fmtCurrency(avail)} at ${v.fromAge}, so a year's contribution is capped at ${fmtCurrency(take)}${take < v.amount ? " (limited by your savings)" : ""}.`
            : "";
        const when =
          v.fromAge === until
            ? `A one-off ${fmtCurrency(v.amount)} from your savings into super at age ${v.fromAge}`
            : `Move ${fmtCurrency(v.amount)} from your savings into super each year from ${v.fromAge} to ${until}`;
        return (
          `${when}, as an after-tax contribution — no tax going in, and its earnings are then tax-free inside super rather ` +
          `than taxed outside.${availPart} It's a reallocation (net worth barely moves); the payoff is the tax saved over ` +
          `time, largest when your outside balance is big. Also capped at the non-concessional limit and the total-super cap; not past 75.`
        );
      },
      apply: (p, v) => ({ ...p, recontribute: { perYear: v.amount, fromAge: v.fromAge, untilAge: Math.max(v.fromAge, v.untilAge) } }),
    });
  }

  // --- Keep super in accumulation (don't start an account-based pension) ---
  const totalStartSuper = startingSuperBalances(plan).reduce((s, v) => s + v, 0);
  if (totalStartSuper > 1_000 && !plan.keepSuperInAccumulation) {
    cards.push({
      id: "keep-accumulation",
      group: "timing",
      label: "Keep super in accumulation",
      blurb: "Leave super in accumulation instead of starting an account-based pension at retirement — no mandatory minimum drawdown, but earnings are taxed 15% instead of tax-free.",
      params: [],
      note: () =>
        "Super stays in accumulation phase: there's no forced minimum drawdown, so nothing is pushed out into taxable savings — but its earnings are taxed at 15% rather than being tax-free. For most people, starting a pension and reinvesting any minimum you don't need is more tax-effective; use this to model the alternative (e.g. if your outside-super savings already cover your spending).",
      apply: (p) => ({ ...p, keepSuperInAccumulation: true }),
    });
  }

  const spend = Math.round(primarySpend(plan));
  if (spend > 0) {
    cards.push({
      id: "adjust-spending",
      group: "timing",
      label: "Adjust discretionary spending",
      blurb: "Your essentials stay fixed — this flexes only the discretionary spending on top. Drag down to trim it or up to live it up, and watch how long your money lasts and your net worth respond.",
      params: [
        {
          key: "spend",
          label: "Total spend",
          // Floor is raised to the essentials level in the board (needs config); the
          // draggable range above it is the discretionary portion.
          min: Math.min(15_000, Math.round(spend * 0.6)),
          max: Math.min(400_000, Math.max(Math.round(spend * 2), spend + 60_000)),
          step: 1_000,
          default: spend,
          prefix: "$",
          suffix: "/yr",
        },
      ],
      note: (v) => {
        const diff = v.spend - spend;
        return (
          `You're setting total spend to ${fmtCurrency(v.spend)}/yr` +
          `${Math.abs(diff) >= 500 ? ` (${diff > 0 ? "+" : "−"}${fmtCurrency(Math.abs(diff))} vs now)` : ""}. ` +
          `Your essentials stay fixed underneath — only the discretionary on top moves. Spending more runs your savings ` +
          `down faster (fewer years); spending less makes them last longer.`
        );
      },
      apply: (p, v) => withSpend(p, v.spend),
    });
  }

  // --- Flexible spending: Guyton-Klinger guardrails ---
  if (spend > 0 && !plan.guardrails) {
    cards.push({
      id: "guardrails",
      group: "timing",
      label: "Flexible spending (guardrails)",
      blurb: "Let spending flex with your portfolio — ease off a little after market falls, treat yourself after strong years — instead of drawing a fixed amount forever.",
      params: [],
      note: () =>
        "Guyton-Klinger guardrails: if your portfolio's withdrawal rate (after the Age Pension) drifts about 20% above where it started, spending is trimmed ~10%; if it drifts ~20% below, you get a ~10% raise — but never below your essentials. Instead of a fixed amount forever, your spending flexes with the markets — more in good years, less in bad — so you're much less likely to run out.",
      apply: (p) => ({ ...p, guardrails: {} }),
    });
  }

  // --- Work ---
  if (oldest < 75) {
    cards.push({
      id: "part-time-work",
      group: "work",
      label: "Work part-time in early retirement",
      blurb: "Earn some income in your first retirement years — it offsets what you draw down. Assessable under the Age Pension income test, but the Work Bonus exempts the first $7,800/yr each.",
      params: [
        { key: "perYear", label: "Earn per year", min: 0, max: 60_000, step: 1_000, default: 20_000, prefix: "$", suffix: "/yr" },
        {
          key: "untilAge",
          label: "Until age",
          min: plan.retirementAge + 1,
          max: Math.min(80, plan.lifeExpectancy),
          step: 1,
          default: Math.min(plan.lifeExpectancy, plan.retirementAge + 5),
          suffix: "yrs",
        },
      ],
      note: (v) => {
        const people = plan.people.length;
        const bonus = 7_800 * people;
        return (
          `Earning ${fmtCurrency(v.perYear)}/yr until age ${v.untilAge} means you draw about that much less from savings in ` +
          `each of those years. For the Age Pension income test the first ${fmtCurrency(bonus)}${people > 1 ? ` (${fmtCurrency(7_800)} each)` : ""} ` +
          `is exempt (the Work Bonus); the rest counts as income and is taxed at the senior rate.`
        );
      },
      apply: (p, v) => ({ ...p, workIncome: { perYear: v.perYear, untilAge: v.untilAge } }),
    });
  }

  // Gap years — person 0 takes a career break during their working years: no pay
  // or contributions, living off savings. The cost is the missed super
  // contributions and their compounding (plus the savings drawn to live).
  if (plan.people[0]?.salary > 0 && plan.people[0].currentAge < plan.retirementAge) {
    const p0 = plan.people[0];
    const startMin = p0.currentAge;
    const startMax = Math.max(startMin, plan.retirementAge - 1);
    const maxYears = Math.min(10, Math.max(1, plan.retirementAge - startMin - 1));
    cards.push({
      id: "gap-years",
      group: "work",
      label: "Take gap years off work",
      blurb: "Model a career break — a stretch of years with no pay and no super contributions, living off your savings. See what it costs your retirement, then pair it with 'Retire later' to make the time up.",
      params: [
        { key: "startAge", label: "Start at age", min: startMin, max: startMax, step: 1, default: Math.min(startMax, startMin + 5), suffix: "yrs" },
        { key: "years", label: "Years off", min: 1, max: maxYears, step: 1, default: Math.min(2, maxYears), suffix: "yrs" },
        { key: "spendFromSavings", label: "Spend from savings", min: 0, max: 120_000, step: 5_000, default: 40_000, prefix: "$", suffix: "/yr" },
      ],
      note: (v) => {
        const start = Math.round(v.startAge);
        const yrs = Math.round(v.years);
        const effYears = Math.max(0, Math.min(start + yrs, plan.retirementAge) - start);
        const runsPast = start + yrs > plan.retirementAge;
        return (
          `You take ${yrs} year${yrs === 1 ? "" : "s"} off from age ${start} to ${start + yrs}` +
          `${isCouple ? " (your partner keeps working)" : ""}: no salary and no super contributions in those years, and you ` +
          `draw ${fmtCurrency(v.spendFromSavings)}/yr from your savings to live${isCouple ? "" : " (and stop adding to savings)"}. ` +
          `Your super keeps earning on what's already there, but misses ${effYears} year${effYears === 1 ? "" : "s"} of ` +
          `contributions and their compounding — usually the biggest cost.` +
          `${runsPast ? ` (Capped at your retirement age of ${plan.retirementAge}.)` : ""} Pair with 'Retire later' to make the years up.`
        );
      },
      apply: (p, v) => ({ ...p, careerBreak: { atAge: v.startAge, years: v.years, spendFromSavings: v.spendFromSavings } }),
    });
  }

  if (working && plan.people[0]?.salary > 0) {
    cards.push({
      id: "salary-sacrifice",
      group: "timing",
      label: "Salary-sacrifice more",
      blurb: "Extra pre-tax super each year while you're still working.",
      params: [
        { key: "extra", label: "Extra per year", min: 0, max: 30_000, step: 1_000, default: 10_000, prefix: "$", suffix: "/yr" },
      ],
      note: (v) =>
        `Putting an extra ${fmtCurrency(v.extra)}/yr of your pre-tax pay into super each working year` +
        `${isCouple ? " (this is you — your partner's contributions are unchanged)" : ""}. It's taxed going in at ` +
        `15% instead of your marginal rate, so more of it lands in super — but it's locked away until you can access super (from age 60).`,
      apply: (p, v) => ({
        ...p,
        people: p.people.map((pp, i) =>
          i === 0 ? { ...pp, voluntaryConcessional: pp.voluntaryConcessional + v.extra } : pp,
        ),
      }),
    });
  }

  // Transition to Retirement — offered to any worker; the board only shows it
  // once the (composed) retirement age clears 60, so it also surfaces when the
  // Retire later lever opens a working-past-60 window. The engine applies it only
  // in years the person is 60+ and still working.
  if (working && plan.people[0]?.salary > 0) {
    const p0 = plan.people[0];
    cards.push({
      id: "ttr",
      group: "timing",
      label: "Transition to Retirement",
      blurb: "From age 60 you can salary-sacrifice more and draw a tax-free TTR pension to replace the pay you give up — shifting income from your marginal rate down to 15% tax. Your take-home holds; the tax saved builds your super.",
      params: [
        { key: "extra", label: "Extra sacrifice via TTR", min: 0, max: 30_000, step: 1_000, default: 15_000, prefix: "$", suffix: "/yr" },
      ],
      note: (v) => {
        const taxable = Math.max(0, p0.salary - p0.voluntaryConcessional);
        const taxSaved = incomeTax(taxable) - incomeTax(Math.max(0, taxable - v.extra));
        const benefit = Math.max(0, taxSaved - v.extra * 0.15);
        return `From age 60 until you retire: take-home unchanged, about ${fmtCurrency(benefit)}/yr of tax saving into super${isCouple ? " (for you; your partner isn't affected)" : ""} (capped at the concessional limit). Pairs with working past 60.`;
      },
      apply: (p, v) => ({ ...p, ttr: { extraSacrifice: v.extra } }),
    });
  }

  return cards;
}

/** Compose the active strategies onto the baseline plan. `active` holds enabled
 *  card ids; `values` holds any per-card param overrides. Exclusive groups keep
 *  only the first active card. */
export function applyStrategies(
  plan: RetirementPlan,
  cards: StrategyCard[],
  active: Set<string>,
  values: Record<string, Record<string, number>>,
): RetirementPlan {
  const seenExclusive = new Set<string>();
  let p = plan;
  for (const card of cards) {
    if (!active.has(card.id)) continue;
    if (card.exclusive) {
      if (seenExclusive.has(card.exclusive)) continue;
      seenExclusive.add(card.exclusive);
    }
    p = card.apply(p, resolveValues(card, values[card.id]));
  }
  return p;
}
