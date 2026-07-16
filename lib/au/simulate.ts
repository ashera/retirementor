// Year-by-year retirement simulation for the Australian system.
//
// Everything is modelled in TODAY'S DOLLARS: we use a real (inflation-adjusted)
// return, and Age Pension figures — which are indexed to wages/CPI — are treated
// as roughly constant in real terms. All rates/thresholds come from the supplied
// EngineConfig (the active DB version).
//
// Phases:
//   accumulation — still working: super grows (SG + voluntary, 15% earnings tax)
//   bridge       — retired but everyone < preservation age: live off outside-super
//   drawdown     — retired, preservation age..pension age: tax-free super + outside
//   pension      — pension age+: means-tested Age Pension tops up private drawdown

import { minDrawdownRate, type EngineConfig } from "./config";
import { agePension, deemedIncome } from "./agePension";
import {
  getCareerBreaks,
  getInvestmentProperties,
  hasStaggeredRetirement,
  householdRetirementOffset,
  personRetirementAge,
  personRetirementOffset,
  spendingForAge,
  startingSuperBalances,
} from "./types";
import { mortgageActiveAtAge, mortgageAnnualCost } from "./mortgage";
import { budgetSplit, presetCategories } from "./budget";
import { residentIncomeTax, seniorIncomeTax, medicareLevy, personTax, type CgtParams } from "./tax";
import {
  capitalGainsTax,
  netEquity,
  netRentCash,
  netSaleProceeds,
  propertyValueAt,
} from "./property";
import type { Person, PersonTaxDetail, Phase, RetirementPlan, SimResult, YearBreakdown, YearRow } from "./types";

const EPS = 1e-6;

function realRate(nominalPct: number, inflationPct: number): number {
  return (1 + nominalPct / 100) / (1 + inflationPct / 100) - 1;
}

// Optional per-year NOMINAL returns (percent), one entry per year. When omitted the
// deterministic means are used every year — plan.investmentReturn for super and
// plan.outsideReturn (falling back to investmentReturn) for the outside-super pool.
// Monte Carlo passes random sequences for each. `outsideReturns` defaults to
// `nominalReturns` when only one is supplied, so callers that don't care about the
// split keep the old single-sequence behaviour.
export function simulate(
  plan: RetirementPlan,
  config: EngineConfig,
  nominalReturns?: number[],
  outsideReturns?: number[],
): SimResult {
  const preservationAge = config.preservationAge;
  const pensionAge = config.agePensionAge;

  // ASIC RG 276 two-stage deflation: pre-retirement (accumulation) amounts are
  // expressed in today's dollars via WAGE inflation (CPI + rise in living
  // standards); from retirement onward via CPI alone.
  const cpi = plan.inflation;
  const wageInflation = plan.inflation + (config.livingStandardsGrowthPct ?? 0);

  // Super fees (per-plan override, else the config default). The % fee reduces
  // the investment return; the fixed admin and insurance amounts are $ deductions.
  const fees = plan.fees ?? config.fees;
  const feePct = fees?.adminInvestmentPct ?? 0;
  const fixedAdmin = fees?.fixedAdminAnnual ?? 0;
  const insurance = fees?.insuranceAnnual ?? 0;
  const meanRealReturn = realRate(plan.investmentReturn, cpi);
  // Outside-super money can be held with its own return (e.g. conservative/cash),
  // defaulting to the super return so unset plans are unchanged.
  const outsideMeanNom = plan.outsideReturn ?? plan.investmentReturn;
  // When only the super sequence is supplied, the outside pool shares it (old
  // single-return behaviour); its deterministic mean falls back likewise.
  const outsideSeq = outsideReturns ?? nominalReturns;

  // Super is tracked as two pools per person: a tax-free PENSION pool (account-
  // based pension, with a forced minimum drawdown) and a taxed ACCUMULATION pool
  // (15% on earnings, no minimum). Everyone starts fully in accumulation; at
  // retirement a one-time TRANSFER moves up to the Transfer Balance Cap into the
  // pension pool, whose growth then stays tax-free even if it later exceeds the cap.
  const accum = startingSuperBalances(plan);
  const pension = plan.people.map(() => 0);
  const transferred = plan.people.map(() => false);
  const superOf = (i: number) => accum[i] + pension[i];
  const totalSuper = () => plan.people.reduce((s, _p, i) => s + superOf(i), 0);
  // Add a contribution to super: into the pension pool up to Transfer Balance Cap
  // room (only once a pension exists), the remainder into accumulation.
  const addToSuper = (i: number, amount: number) => {
    if (amount <= 0) return;
    const room = transferred[i] ? Math.max(0, config.transferBalanceCap - pension[i]) : 0;
    const toPension = Math.min(amount, room);
    pension[i] += toPension;
    accum[i] += amount - toPension;
  };
  // Draw `amount` from the accessible members' super, ACCUMULATION first (to
  // preserve the tax-free pension pool), proportionally within each pool. Returns
  // how much came from each pool, so the drawdown order can be shown.
  const drawSuper = (accessible: number[], amount: number) => {
    let remaining = amount;
    const drawn = { accum: 0, pension: 0 };
    for (const key of ["accum", "pension"] as const) {
      if (remaining <= EPS) break;
      const pool = key === "accum" ? accum : pension;
      const total = accessible.reduce((s, i) => s + pool[i], 0);
      if (total <= EPS) continue;
      const take = Math.min(remaining, total);
      const r = take / total;
      accessible.forEach((i) => (pool[i] -= pool[i] * r));
      drawn[key] = take;
      remaining -= take;
    }
    return drawn;
  };
  let outside = plan.outsideSuper;
  // Deferred-CGT bookkeeping for the outside-super pool: the running UNREALISED
  // capital gain (value − cost base). Capital growth accrues here untaxed; a
  // withdrawal (or transfer out) realises a proportional slice, taxed with the CGT
  // discount. Contributions/inflows add at cost, so they dilute the gain fraction
  // automatically — no need to touch every `outside +=` site. Basis is reset to the
  // pool's value at the retirement boundary (pre-retirement growth is left untaxed,
  // matching the accumulation-phase treatment below), so it starts at 0.
  let unrealizedGain = 0;
  const outsideIncomeYield = (config.outsideTax?.incomeYieldPct ?? 0) / 100;
  const cgtDiscount = 1 - (config.outsideTax?.cgtDiscountPct ?? 0) / 100;
  const cgtRegime = config.outsideTax?.cgtRegime ?? "indexed";
  const cgtMinRate = (config.outsideTax?.cgtMinRatePct ?? 30) / 100;
  const cgtParamsBase: Omit<CgtParams, "onAgePension"> = {
    regime: cgtRegime,
    discountPct: config.outsideTax?.cgtDiscountPct ?? 50,
    minRatePct: config.outsideTax?.cgtMinRatePct ?? 30,
  };
  // One person's consolidated tax for the tax-analysis modal: all ordinary income
  // (salary, part-time work, net rent, dividends) taxed together with a single LITO
  // + SAPTO, plus Medicare and CGT on any realised gain.
  const taxDetailFor = (
    i: number,
    comps: { salary: number; work: number; rent: number; dividends: number; gain: number },
    senior: boolean,
    onAgePension: boolean,
  ): PersonTaxDetail => {
    const pt = personTax(
      [
        { key: "salary", amount: comps.salary },
        { key: "work", amount: comps.work },
        { key: "rent", amount: comps.rent },
        { key: "dividends", amount: comps.dividends },
      ],
      comps.salary + comps.work,
      comps.gain,
      senior,
      plan.household,
      { ...cgtParamsBase, onAgePension },
    );
    return {
      label: plan.people.length > 1 && i === 1 ? "Your partner" : "You",
      salary: comps.salary, work: comps.work, rent: comps.rent, dividends: comps.dividends, gain: comps.gain,
      gross: pt.gross, lito: pt.lito, sapto: pt.sapto, incomeTax: pt.incomeTax, medicare: pt.medicare, cgt: pt.cgt,
    };
  };

  const startOldest = Math.max(...plan.people.map((p) => p.currentAge));
  const horizon = Math.max(0, Math.round(plan.lifeExpectancy - startOldest));
  // Per-person retirement offsets (years from now). The household enters the
  // retirement/spending phase at the EARLIEST of them; a partner retiring later
  // keeps earning and contributing through the gap (their salary offsets the
  // drawdown). With a single shared retirement age these all coincide, so the
  // whole staggered path collapses to the original single-boundary behaviour.
  const retireOffsets = plan.people.map((_, i) => personRetirementOffset(plan, i));
  const earliestOffset = householdRetirementOffset(plan);

  const rows: YearRow[] = [];
  let depletedAge: number | null = null;
  let firstAgePensionAge: number | null = null;
  let superAtRetirement = 0;
  let totalAtRetirement = 0;
  // The (oldest-person's) age at which a member's PRESERVED super first unlocks
  // and transfers into the tax-free pension pool AFTER the household has already
  // entered retirement — i.e. an early retiree waiting to turn 60. Drives a chart
  // marker that explains the accumulation→pension band flip. null when the transfer
  // coincides with retirement (nothing to distinguish from the Retire marker).
  let superUnlockAge: number | null = null;
  let superUnlockIsPartner = false; // whose super it is — a partner's (index > 0) vs your own

  // A home loan carried into retirement. `mortgageCleared` flips true once a
  // "clear at retirement" lump sum has been paid off from super.
  const mortgage = plan.mortgage;
  let mortgageCleared = false;

  // Investment properties. `sold[i]` flips true once that property's "sell at age"
  // event has released its net proceeds into the outside-super pool.
  const properties = getInvestmentProperties(plan);
  const sold = properties.map(() => false);
  // Career breaks ("gap years"), possibly one per partner (see getCareerBreaks).
  const careerBreaks = getCareerBreaks(plan);

  // Optional home downsize: a one-off equity release at an age (home stays
  // exempt). `downsized` guards it to a single event.
  const downsize = plan.home?.downsize;
  let downsized = false;
  // Optional sell-up-and-rent: releases all equity, then becomes a renter
  // (non-homeowner means test + ongoing rent) from `atAge`.
  const sellRent = plan.home?.sellAndRent;
  let soldHome = false;
  // Optional one-off lump sum withdrawn (and spent) from super at a chosen age.
  const lumpSum = plan.lumpSum;
  let lumpSumTaken = false;
  // Optional recontribution: annual after-tax top-up of super from outside savings.
  const recontribute = plan.recontribute;
  // Optional Guyton-Klinger guardrails: dynamic spending that flexes with the
  // portfolio. Living-spend starts at the plan's target and is nudged each year —
  // cut past the upper rail, raised past the lower — measured on the NET-OF-PENSION
  // withdrawal rate (D1), floored at essentials or floorPct% of the initial spend (D3).
  const guardrails = plan.guardrails;
  const guardWidth = (guardrails?.guardPct ?? 20) / 100; // rail half-width vs initial rate
  const guardStep = (guardrails?.adjustPct ?? 10) / 100; // cut / raise size
  const guardFloorPct = Math.min(1, (guardrails?.floorPct ?? 70) / 100); // a floor > 100% of start makes no sense — clamp so it never exceeds the start spend
  // Essentials floor (needs) — the same budget-derived figure the What-If spend
  // lever holds fixed; guardrail cuts never trim below it.
  const guardEssentials = guardrails
    ? budgetSplit(plan.budget?.categories ?? presetCategories(config, plan.household, plan.homeowner, "modest")).essential
    : 0;
  let guardSpend: number | null = null; // dynamic living-spend (today's $), set on the first retired year
  let guardWr0: number | null = null; // initial net-of-pension withdrawal rate (the rail reference)
  let guardFloor = 0; // max(essentials, floorPct% of the initial spend)
  // The (exempt) home value tracked for the net-worth view: the current value
  // until a downsize (→ the smaller home) or a sale (→ 0). Homeowners without a
  // stated value get the same default the downsize lever assumes. It appreciates
  // at `growthReal` (real, CPI-basis) each year, so the freed equity at a downsize
  // reflects appreciation and net worth carries across the event.
  const homeBaseValue = plan.homeowner ? (plan.home?.value ?? 900_000) : 0;
  const homeGrowth = (plan.home?.growthReal ?? 2) / 100;
  let homeVal = homeBaseValue; // start-of-year (CPI-real) value, grown in the loop

  for (let t = 0; t <= horizon; t++) {
    const ages = plan.people.map((p) => p.currentAge + t);
    const oldest = Math.max(...ages);
    // Household accumulation phase: BEFORE anyone has retired. Once the first
    // person retires the household is "in retirement" even if a partner still
    // works (handled per-person inside the retirement branch below).
    const accumPhase = t < earliestOffset;

    // Is member `i` on a scheduled career break this year? Hoisted to loop scope so
    // BOTH the accumulation branch and the staggered-retirement working loop honour
    // it (a break landing in the retirement gap used to be silently ignored).
    const onBreak = (i: number) =>
      careerBreaks.some((b) => b.who === i && ages[i] >= b.atAge && ages[i] < b.atAge + b.years);

    // This year's returns (constant mean, or a Monte Carlo draw). Super and the
    // outside pool each carry their own nominal return.
    const nom = nominalReturns ? (nominalReturns[t] ?? plan.investmentReturn) : plan.investmentReturn;
    const outsideNom = outsideSeq ? (outsideSeq[t] ?? outsideMeanNom) : outsideMeanNom;
    // Deflate by wage inflation pre-retirement, CPI from the household boundary on.
    const deflator = accumPhase ? wageInflation : cpi;
    const realReturn = realRate(outsideNom, deflator); // outside super (no super fee)
    // Super returns are net of the % investment/admin fee. Accumulation also pays
    // 15% earnings tax; pension-phase super is tax-free.
    const superAccumReturn = realRate(nom * (1 - config.superEarningsTaxAccumulation) - feePct, deflator);
    const superPensionReturn = realRate(nom - feePct, deflator);

    // Per-person accumulation for a still-working member. `scale` converts a
    // wage-real-constant salary into this year's CPI-real terms: 1 during the
    // pre-retirement accumulation phase, and ((1+wage)/(1+cpi))^t during a
    // staggered gap (after the household's wage→CPI boundary), so a partner who
    // keeps working carries the same real wage growth their contributions had
    // before the boundary. Returns the new balance and ledger deltas.
    const superHalf = Math.pow(1 + superAccumReturn, 0.5);
    const contribute = (p: Person, opening: number, scale: number, ttrEligible: boolean) => {
      const salary = p.salary * scale;
      const cap = config.concessionalCap * scale;
      const nccCap = config.nonConcessionalCap * scale;
      const div293Threshold = config.div293Threshold * scale;
      const concessional = Math.min(salary * config.sgRate + p.voluntaryConcessional * scale, cap);
      const sacrificed = Math.max(0, concessional - salary * config.sgRate);
      const taxable = Math.max(0, salary - sacrificed);
      // Take-home is real cash the household spends/banks, so it must include the 2%
      // Medicare levy (unlike residentIncomeTax, which omits it for the CGT use).
      const takeHome = taxable - residentIncomeTax(taxable) - medicareLevy(taxable);
      let ttrBenefit = 0;
      if (ttrEligible && plan.ttr && plan.ttr.extraSacrifice > 0) {
        const ttrSacrificed = Math.min(plan.ttr.extraSacrifice * scale, Math.max(0, cap - concessional));
        if (ttrSacrificed > 0) {
          const taxSaved = residentIncomeTax(taxable) - residentIncomeTax(Math.max(0, taxable - ttrSacrificed));
          ttrBenefit = taxSaved - ttrSacrificed * config.contributionsTax;
        }
      }
      // Non-concessional cap falls to $0 once the person's total super balance is at
      // or above the threshold (~$2.1M). During accumulation `opening` is the whole
      // super balance, so it's the right gauge for a working-age contributor.
      const ncc = opening >= config.totalSuperBalanceNccThreshold * scale ? 0 : Math.min(p.voluntaryNonConcessional * scale, nccCap);
      const div293Income = taxable + concessional; // taxable income + low-tax contributions (sacrifice already removed from taxable)
      const taxed293 = Math.min(concessional, Math.max(0, div293Income - div293Threshold));
      const extra293 = taxed293 * config.div293ExtraTaxRate;
      const added = concessional * (1 - config.contributionsTax) - extra293 + ncc;
      const fee = fixedAdmin + insurance;
      const net = added - fee + ttrBenefit;
      const newBalance = opening * (1 + superAccumReturn) + net * superHalf;
      return {
        newBalance,
        contribGross: concessional,
        contribTax: concessional * config.contributionsTax + extra293,
        contribNet: added,
        feesPaid: fee,
        earningsTax: opening * (superPensionReturn - superAccumReturn),
        superGrowth: newBalance - opening - net,
        takeHome,
        taxable, // taxable salary (after sacrifice) — the base a rental loss/gain stacks on
        salaryIncomeTax: residentIncomeTax(taxable), // personal income tax on the salary (after LITO), surfaced for the tax analysis
        medicareLevyPaid: medicareLevy(taxable),
        ttrBenefit,
      };
    };

    // RG 276 two-stage boundary. The accumulation trajectory is expressed in
    // WAGE-deflated today's dollars; everything from retirement onward is
    // expressed in CPI today's dollars (retiree spending AND the Age Pension
    // thresholds both index to CPI, not wages). So as we cross into retirement we
    // re-express the accumulated stock from wage-real to CPI-real. This is exact:
    // the wage deflator was applied uniformly across the `retireOffset` working
    // years, so nominal/(1+wage)ⁿ becomes nominal/(1+cpi)ⁿ by scaling the whole
    // pool by ((1+wage)/(1+cpi))ⁿ. It also makes the means test assess the same
    // CPI-real balance the retiree actually holds. (No-op when wage == cpi.)
    if (t === earliestOffset && earliestOffset > 0) {
      const rebase = Math.pow((1 + wageInflation / 100) / (1 + cpi / 100), earliestOffset);
      for (let i = 0; i < accum.length; i++) {
        accum[i] *= rebase;
        pension[i] *= rebase;
      }
      outside *= rebase;
    }

    // The home appreciates in real terms over the prior year (until it is sold).
    if (t > 0 && homeVal > 0) homeVal *= 1 + homeGrowth;

    // Home downsize: free up equity once the oldest reaches the chosen age. The
    // freed equity is the GROWN home value less the new home and any loan, so a
    // later downsize frees more and net worth carries across the event. The
    // downsizer portion lands in the primary's super (assessable once accessible),
    // the rest in outside savings (deemed). The home itself stays exempt.
    // Only net an outstanding loan off the equity release if it's actually still
    // owed: a mortgage already discharged (paid off at its payoff age, or cleared
    // earlier from super) must NOT be subtracted, or downsizing/selling after payoff
    // would silently destroy that much freed equity. (An active interest-only loan
    // keeps its balance; a P&I loan's balance isn't amortised here — a smaller,
    // conservative under-statement — but a GONE loan must count as $0.)
    // A fixed nominal loan balance is worth less in today's dollars each year — the
    // same way the repayment (mortgageCost, below) is deflated. Deflate it wherever
    // it meets a real-dollar figure (equity release, net worth, clear-from-super), or
    // an inflation-era clear/downsize over-states the debt and destroys real equity.
    const loanBalReal = mortgage ? mortgage.balance / Math.pow(1 + plan.inflation / 100, t) : 0;
    const loanBal =
      mortgage && !mortgageCleared && mortgageActiveAtAge(mortgage, oldest) ? loanBalReal : 0;
    let homeProceedsThisYear = 0;
    let homeToSuperThisYear = 0;
    if (downsize && !downsized && oldest >= downsize.atAge) {
      const release = Math.max(0, homeVal - downsize.newValue - loanBal);
      // The downsizer contribution is capped at $300k PER PERSON by law, regardless
      // of how much equity is freed or requested (the UI slider caps too, but the
      // engine is the source of truth for saved/seeded plans).
      const toSuper = Math.max(0, Math.min(downsize.toSuper, release, 300_000 * plan.people.length));
      const toOutside = Math.max(0, release - toSuper);
      if (accum.length) addToSuper(0, toSuper);
      outside += toOutside;
      downsized = true;
      homeProceedsThisYear = release;
      homeToSuperThisYear = toSuper;
      homeVal = downsize.newValue; // the new (smaller) home, which grows from here
      if (mortgage) mortgageCleared = true; // discharged from the sale (freed equity is net of it)
    }
    // Sell up and rent: release all equity into savings (grown value net of any
    // loan, which is repaid from proceeds). Renter status/rent apply below.
    if (sellRent && !soldHome && oldest >= sellRent.atAge) {
      const release = Math.max(0, homeVal - loanBal);
      outside += release;
      soldHome = true;
      homeProceedsThisYear = release;
      homeVal = 0;
      if (mortgage) mortgageCleared = true; // discharged from the sale
    }
    const isHomeowner = plan.homeowner && !(sellRent != null && oldest >= sellRent.atAge);
    const homeValueThisYear = homeVal;
    // Net-worth band = home equity = market value less any mortgage still owed
    // against it. Netting the loan keeps net worth continuous across a downsize,
    // which discharges the loan from the sale proceeds (mortgageCleared is already
    // set at the top of this loop when a downsize/sale happens).
    const outstandingLoan =
      mortgage && !mortgageCleared && isHomeowner && mortgageActiveAtAge(mortgage, oldest) ? loanBalReal : 0;
    const homeEquityThisYear = Math.max(0, homeValueThisYear - outstandingLoan);

    // Balances at the START of this year (on the birthday) — this is what each
    // data point plots, so the peak lands on the retirement age, not the year before.
    const startSuper = totalSuper();
    const startOutside = outside;

    if (accumPhase) {
      // --- Accumulation: add contributions (net of 15%), then grow. ---
      // Career breaks ("gap years"): a member on a break this year earns nothing —
      // no super contributions — and the household draws that break's living cost
      // from savings (below). Savings additions pause only when EVERY member is on
      // a break (nobody's earning). Super keeps earning on the existing balance; the
      // missed contributions and their compounding are the real cost.
      const anyoneWorking = plan.people.some((_, i) => !onBreak(i));
      let contribGross = 0;
      let contribTax = 0;
      let contribNet = 0;
      let superGrowth = 0;
      let earningsTax = 0;
      let feesPaid = 0;
      let takeHome = 0; // net cash from salary after income tax and pre-tax sacrifice
      let ttrBenefit = 0; // net super gained from a Transition-to-Retirement swap this year
      let medicare = 0; // Medicare levy on salary
      const taxables: number[] = []; // per-person taxable salary — base for the rental tax/deduction
      plan.people.forEach((p, i) => {
        const brk = onBreak(i);
        const person = brk ? { ...p, salary: 0, voluntaryConcessional: 0 } : p;
        const r = contribute(person, accum[i], 1, i === 0 && ages[i] >= preservationAge && !brk);
        accum[i] = r.newBalance;
        contribGross += r.contribGross;
        contribTax += r.contribTax;
        contribNet += r.contribNet;
        feesPaid += r.feesPaid;
        superGrowth += r.superGrowth;
        earningsTax += r.earningsTax;
        takeHome += r.takeHome;
        ttrBenefit += r.ttrBenefit;
        medicare += r.medicareLevyPaid;
        taxables.push(r.taxable);
      });
      // Savings additions pause only when no one's earning (a single on a break, or
      // a couple both on a break at once); if one partner keeps working, household
      // savings continue (a documented simplification — their share isn't separated).
      const savings = anyoneWorking ? plan.annualOutsideSavings : 0;
      const outsideHalf = Math.pow(1 + realReturn, 0.5);
      outside = startOutside * (1 + realReturn) + savings * outsideHalf;
      const outsideGrowth = outside - startOutside - savings;

      // Tax the dividend/distribution yield on money held OUTSIDE super during the
      // working years too — assessable at each owner's marginal rate on top of their
      // salary (mirrors the retirement treatment; capital growth stays deferred and
      // the CGT basis still resets at the retirement boundary, so only the yield is
      // taxed here — no units are sold while working). Split equally across owners.
      const outsideIncomeAccum = Math.max(0, startOutside * outsideIncomeYield);
      const outsidePerAccum = outsideIncomeAccum / Math.max(1, plan.people.length);
      const accumOutsideTax =
        outsideIncomeAccum === 0
          ? 0
          : taxables.reduce((s, tx) => s + Math.max(0, residentIncomeTax(tx + outsidePerAccum) - residentIncomeTax(tx)), 0);
      outside -= accumOutsideTax;

      // Held investment-property equity (value − loan) for the net-worth view.
      // Nothing sells while working, so every property still counts. The engine
      // otherwise only needs this in retirement (the means test), but the net-worth
      // band spans the whole timeline, so we compute it here too.
      const accumPropertyEquity = properties.reduce((s, prop) => s + netEquity(prop, propertyValueAt(prop, t)), 0);
      // Net rent the properties throw off during the working years too (positive
      // income, or a negative cash drain for a geared property) — surfaced on the
      // income chart alongside take-home pay. Like salary take-home it's disposable
      // income, not auto-saved, so it doesn't itself move the balance.
      const accumRentCash = properties.reduce((s, prop) => s + netRentCash(prop, propertyValueAt(prop, t)), 0);
      // Income tax on that rent, marginal, stacked on each owner's taxable salary and
      // split equally across the household. A rental LOSS reduces income tax — this is
      // negative gearing (the working-years benefit). NEGATIVE rentTax = a tax saving.
      const accumRentPer = accumRentCash / Math.max(1, plan.people.length);
      const accumRentTax = accumRentCash === 0 ? 0 : taxables.reduce((s, tx) => s + (residentIncomeTax(tx + accumRentPer) - residentIncomeTax(tx)), 0);
      // Per-person consolidated tax for the tax modal (all ordinary income together).
      const accumTaxDetail = plan.people.map((_, i) =>
        taxDetailFor(i, { salary: taxables[i], work: 0, rent: accumRentPer, dividends: outsidePerAccum, gain: 0 }, false, false),
      );
      // Positive net rent (after its income tax) is reinvested into the outside pool,
      // so a cash-flow-positive property visibly builds wealth over the working years.
      // A geared loss is NOT drawn from the pool here — it's a disposable cash drain
      // funded from salary (its negative-gearing tax saving is already in accumRentTax).
      const rentSaved = Math.max(0, accumRentCash - accumRentTax);
      outside += rentSaved;
      // Living costs funded from savings during a career break (summed if both
      // partners are off at once), floored at what the outside pool actually holds
      // (super is preserved, so it can't fund a break).
      const breakSpend = careerBreaks.reduce(
        (s, b) => s + (ages[b.who] >= b.atAge && ages[b.who] < b.atAge + b.years ? b.spendFromSavings : 0),
        0,
      );
      const careerBreakDraw = Math.min(breakSpend, Math.max(0, outside));
      outside -= careerBreakDraw;

      rows.push(
        row(oldest, startSuper, startOutside, 0, 0, 0, 0, "accumulation", true, accumRentCash, accumPropertyEquity, {
          openingSuper: startSuper,
          openingOutside: startOutside,
          closingSuper: totalSuper(),
          closingOutside: outside,
          pensionSuper: 0, // all super is in accumulation while still working
          accumSuper: startSuper,
          accumDrawn: 0,
          pensionExtraDrawn: 0,
          contribGross,
          contribTax,
          contribNet,
          savings,
          salaryIncome: plan.people.reduce((s, p, i) => s + (onBreak(i) ? 0 : p.salary), 0),
          takeHome,
          ttrBenefit,
          workIncome: 0,
          superGrowth,
          outsideGrowth,
          fees: feesPaid,
          earningsTax: Math.max(0, earningsTax),
          outsideTax: accumOutsideTax,
          outsideDividend: outsideIncomeAccum,
          // Tax-analysis totals (consolidated per person — salary + net rent +
          // dividends taxed together with one LITO/SAPTO). No gains realised while
          // working, so no capital gains. `medicare` from the salary tax above.
          incomeTax: accumTaxDetail.reduce((s, d) => s + d.incomeTax, 0),
          medicare,
          capitalGains: 0,
          taxDetail: accumTaxDetail,
          agePension: 0,
          pension: null,
          rentIncome: accumRentCash,
          rentTax: accumRentTax,
          rentSaved,
          careerBreakDraw,
          onBreak: plan.people.some((_, i) => onBreak(i)), // any member on a gap year → charts shade it

          minDrawdown: 0,
          minDrawdownParts: [],
          livingSpend: 0,
          rentCost: 0,
          mortgageCost: 0,
          mortgageCleared: 0,
          lumpSum: 0,
          recontribution: 0,
          propertyProceeds: 0,
          propertyCgt: 0,
          homeProceeds: 0,
          homeProceedsToSuper: 0,
          homeValue: homeValueThisYear,
          homeEquity: homeEquityThisYear,
        }),
      );
      continue;
    }

    // --- Retirement year (at least one person has retired) ---
    if (t === earliestOffset) {
      superAtRetirement = startSuper;
      totalAtRetirement = startSuper + startOutside;
    }

    // Capital gains realised this year by selling outside-super units (to fund
    // spending, or to transfer into super) — taxed, with the discount, at year end.
    let realizedGain = 0;
    const realizeOutside = (amount: number) => {
      if (amount <= 0 || outside <= EPS) return;
      const gainFrac = Math.min(1, Math.max(0, unrealizedGain) / outside); // never realise more gain than the amount sold
      const g = amount * gainFrac;
      realizedGain += g;
      unrealizedGain -= g;
    };

    // A still-working partner (staggered retirement): keep accumulating their
    // super and bank their salary. Their take-home offsets the household's
    // drawdown; their gross salary is assessable for the Age Pension income test.
    // `gapScale` re-expresses their wage-real salary in this year's CPI-real
    // terms (see contribute()). With a shared retirement age no one is working
    // here, so all of this is a no-op and the original path is unchanged.
    const gapScale = Math.pow((1 + wageInflation / 100) / (1 + cpi / 100), t);
    let workContribGross = 0;
    let workContribTax = 0;
    let workContribNet = 0;
    let workFees = 0;
    let workSuperGrowth = 0;
    let workEarningsTax = 0;
    let workTakeHome = 0; // still-working partners' net salary → offsets spending
    let workGrossSalary = 0; // gross → Age Pension income test
    let workOnBreak = false; // any still-working partner on a career break this year
    plan.people.forEach((p, i) => {
      if (t >= retireOffsets[i]) return; // already retired — drawn down below
      // A career break landing in the staggered gap: no salary, no contributions
      // (super still earns on the existing balance) — the lost salary offset and
      // missed contributions ARE the cost; the household's retirement spend still
      // funds living, so we don't also draw spendFromSavings (that would double-count).
      const brk = onBreak(i);
      if (brk) workOnBreak = true;
      const person = brk ? { ...p, salary: 0, voluntaryConcessional: 0 } : p;
      const r = contribute(person, accum[i], gapScale, i === 0 && ages[i] >= preservationAge && !brk);
      accum[i] = r.newBalance;
      workContribGross += r.contribGross;
      workContribTax += r.contribTax;
      workContribNet += r.contribNet;
      workFees += r.feesPaid;
      workSuperGrowth += r.superGrowth;
      workEarningsTax += r.earningsTax;
      workTakeHome += r.takeHome;
      workGrossSalary += brk ? 0 : p.salary * gapScale;
    });

    // Only RETIRED members at/over preservation age can draw down (and are
    // assessed as financial assets); a partner still working keeps accumulating.
    const accessibleIdx = plan.people
      .map((_, i) => i)
      .filter((i) => t >= retireOffsets[i] && ages[i] >= preservationAge);

    // Transfer to pension phase: the first year a member is both retired and at
    // preservation age, move up to the Transfer Balance Cap from accumulation into
    // a new tax-free pension pool. Fixed at transfer — the pension pool's growth
    // stays tax-free thereafter even if it grows past the cap. The excess (if any)
    // stays in accumulation and keeps being taxed at 15%.
    // OPT-OUT: keepSuperInAccumulation leaves everything in accumulation (no
    // pension started) — earnings still taxed 15%, but no mandatory minimum
    // drawdown forces money out into taxable savings. Super is then only drawn
    // when outside-super is exhausted (drawSuper pulls from accumulation).
    if (!plan.keepSuperInAccumulation) {
      accessibleIdx.forEach((i) => {
        if (transferred[i]) return;
        const toPension = Math.min(accum[i], config.transferBalanceCap);
        // A preserved balance unlocking AFTER the household retired (an early
        // retiree turning 60) flips the accumulation band to pension mid-retirement
        // — flag the FIRST such age so the chart can explain it.
        if (t > earliestOffset && toPension > 1 && superUnlockAge === null) {
          superUnlockAge = oldest;
          superUnlockIsPartner = i > 0;
        }
        pension[i] += toPension;
        accum[i] -= toPension;
        transferred[i] = true;
      });
    }

    // Opening split of this year's super (post-transfer). The pension pool sums
    // across everyone; accum is whatever's left of the plotted opening balance, so
    // the two always add to startSuper (what the balance chart plots).
    const openPension = plan.people.reduce((s, _p, i) => s + pension[i], 0);
    const openAccum = Math.max(0, startSuper - openPension);

    let accessibleSuper = accessibleIdx.reduce((s, i) => s + superOf(i), 0);

    // Clear-at-retirement: once retired, pay the loan off from super as soon as
    // super is both accessible (preservation age, so tax-free) and enough to
    // cover it. This permanently removes the repayment AND lowers assessable
    // assets, so the Age Pension below is recomputed on the reduced balances —
    // the family home stays exempt regardless of any loan against it.
    let mortgageClearedNow = 0;
    if (
      mortgage &&
      mortgage.strategy === "clear_at_retirement" &&
      !mortgageCleared &&
      accessibleSuper >= loanBalReal
    ) {
      // Pay off the loan's TODAY'S-DOLLARS value (the same deflated basis the carry
      // repayment uses) — not the raw nominal balance, which would over-draw super.
      drawSuper(accessibleIdx, loanBalReal);
      accessibleSuper -= loanBalReal;
      mortgageCleared = true;
      mortgageClearedNow = loanBalReal;
    }

    // One-off lump sum withdrawn from super at a chosen age. Only accessible super
    // (preservation age 60+) can be drawn, so it's tax-free; HARD-CAPPED at the
    // accessible balance so it can never exceed what's actually there. It's spent
    // (leaves the portfolio) and lowers assessable assets for the Age Pension below.
    let lumpSumNow = 0;
    if (lumpSum && !lumpSumTaken && oldest >= lumpSum.atAge && accessibleSuper > EPS) {
      const take = Math.min(Math.max(0, lumpSum.amount), accessibleSuper);
      if (take > 0) {
        drawSuper(accessibleIdx, take);
        accessibleSuper -= take;
        lumpSumNow = take;
      }
      lumpSumTaken = true;
    }

    // Recontribution: each year (to age 75) move an after-tax amount from outside
    // savings back INTO super — a non-concessional contribution. It shelters money
    // in super's tax-free environment and pushes back against the age-based minimum
    // drawdown that would otherwise leak super into taxable savings. Capped at the
    // annual NCC cap, available savings, and the room under the total-super cap.
    let recontributionNow = 0;
    const reconFrom = recontribute?.fromAge ?? 60;
    const reconUntil = Math.max(reconFrom, recontribute?.untilAge ?? reconFrom);
    if (
      recontribute &&
      ages[0] >= reconFrom &&
      ages[0] <= reconUntil &&
      ages[0] <= 75 &&
      outside > EPS &&
      totalSuper() < config.transferBalanceCap
    ) {
      const room = config.transferBalanceCap - totalSuper();
      const take = Math.min(Math.max(0, recontribute.perYear), config.nonConcessionalCap, outside, room);
      if (take > 0) {
        realizeOutside(take); // moving units into super realises their gain
        outside -= take;
        addToSuper(0, take); // routes into the pension pool (tax-free) up to the cap
        if (ages[0] >= preservationAge) accessibleSuper += take; // joins the drawable/assessed pool
        recontributionNow = take;
      }
    }

    // Steady-state spend plus any ongoing loan cost. A repayment/interest bill is
    // fixed in nominal dollars, so in this today's-dollars model it erodes by
    // inflation each year and (for P&I) stops at payoff.
    let mortgageCost = 0;
    if (mortgage && !mortgageCleared && isHomeowner && mortgageActiveAtAge(mortgage, oldest)) {
      mortgageCost = mortgageAnnualCost(mortgage) / Math.pow(1 + plan.inflation / 100, t);
    }
    // Rent once sold up (today's-dollars flat, like living costs), itemised
    // separately so the ledger can show it as its own line.
    const rentExpense = sellRent != null && oldest >= sellRent.atAge ? Math.max(0, sellRent.rentPerYear) : 0;
    let livingSpend = spendingForAge(plan, oldest);
    // Guardrails own the spending schedule once retired: the first retired year
    // seeds the dynamic spend (and the floor); later years use the carried value,
    // updated at the end of each iteration from the realised withdrawal rate.
    if (guardrails) {
      if (guardSpend == null) {
        guardSpend = livingSpend;
        // The floor is the greater of essentials or floorPct% of the initial spend,
        // but never above the spend itself — you can't "hold" more than you spend
        // (a plan whose spend is already all-essentials just has no room to trim).
        guardFloor = Math.max(Math.min(guardEssentials, livingSpend), guardFloorPct * livingSpend);
      }
      livingSpend = guardSpend;
    }
    const spending = livingSpend + rentExpense + mortgageCost;

    // Investment property: real capital growth, actual net rent (income test) and
    // net equity (assets test — assessed, NOT deemed). An optional sale releases
    // its proceeds (after CGT + loan) into the deemed outside-super pool.
    let rentCash = 0; // net cash rent this year across held properties (negative if geared)
    let propertyEquity = 0; // combined assessable net equity (assets test)
    let propertyProceeds = 0; // combined net sale proceeds released this year
    let propertyCgt = 0; // combined CGT paid on sales this year
    const propertyParts: { name?: string; index: number; equity: number }[] = [];
    properties.forEach((prop, pi) => {
      if (sold[pi]) return;
      const value = propertyValueAt(prop, t);
      if (prop.strategy === "sell" && oldest >= prop.sellAtAge) {
        // The Age Pension exemption from the 30% minimum uses the PRIOR year's
        // receipt (this year's pension is worked out after the sale, below).
        const cgtRules = {
          regime: cgtRegime,
          discountPct: config.outsideTax?.cgtDiscountPct ?? 50,
          minRatePct: config.outsideTax?.cgtMinRatePct ?? 30,
          onAgePension: rows.length > 0 && rows[rows.length - 1].agePension > 0,
        };
        const proceeds = netSaleProceeds(prop, value, cgtRules);
        propertyProceeds += proceeds;
        propertyCgt += capitalGainsTax(prop, value, cgtRules);
        outside += proceeds;
        sold[pi] = true;
      } else {
        const eq = netEquity(prop, value);
        rentCash += netRentCash(prop, value);
        propertyEquity += eq;
        propertyParts.push({ name: prop.name, index: pi, equity: eq });
      }
    });
    // Income test assesses net rental income at the household level, so gains and
    // losses across properties offset before flooring at $0 (identical to the old
    // per-property flooring when there's a single property).
    const rentAssessable = Math.max(0, rentCash);

    // Retirement-phase income tax. SAPTO (the seniors offset) only applies from
    // Age Pension age — before that, part-time work and outside-super earnings are
    // taxed on the ordinary resident scale. Worked out per person: each of a
    // couple has their own threshold/offset, and their own age decides SAPTO.
    const taxAtAge = (inc: number, age: number) =>
      age >= pensionAge ? seniorIncomeTax(inc, plan.household) : residentIncomeTax(inc);

    // Part-time work in early retirement: the AFTER-TAX amount offsets drawdown,
    // while the GROSS amount is assessable under the Age Pension income test, net
    // of the Work Bonus ($300/fortnight, i.e. $7,800/yr per person).
    const work = plan.workIncome;
    const workers = plan.people.length;
    const grossWork = work && oldest < work.untilAge ? Math.max(0, work.perYear) : 0;
    const workTax = grossWork > 0 ? ages.reduce((s, a) => s + taxAtAge(grossWork / workers, a), 0) : 0;
    const netWork = grossWork - workTax;
    // Per-person EMPLOYMENT income = this person's share of part-time work plus, for a
    // still-working partner in the staggered gap, their career salary. The Work Bonus
    // excludes the first $7,800/yr of EACH PENSION-AGE person's employment income from
    // the income test — applied per person once they reach Age Pension age (not a flat
    // household deduction, and it now also covers a pension-age partner's salary).
    const employmentPer = plan.people.map((p, i) => {
      const career = t < retireOffsets[i] && !onBreak(i) ? p.salary * gapScale : 0;
      return grossWork / workers + career;
    });
    const assessableEmployment = employmentPer.reduce(
      (s, emp, i) => s + Math.max(0, emp - (ages[i] >= pensionAge ? Math.min(7_800, emp) : 0)),
      0,
    );
    const assessableOther = rentAssessable + assessableEmployment;

    // Age Pension (household level, from pension age). Financial assets are deemed;
    // an investment property's equity is assessable but NOT deemed, and its rent is
    // counted as actual income — so these two are no longer the same figure.
    let agePensionAmt = 0;
    let pensionBreakdown: YearBreakdown["pension"] = null;
    const pensionEligible = ages.filter((a) => a >= pensionAge).length;
    if (pensionEligible > 0) {
      // A member who has reached Age Pension age but is still WORKING holds their super
      // in accumulation — exempt only UNTIL pension age, so from pension age it IS
      // assessed (assets + deeming) even though it can't yet be drawn. accessibleSuper
      // already counts retired-at-preservation (pension-phase) balances; add any
      // pension-age worker's balance it misses.
      const workingPensionAgeSuper = plan.people.reduce(
        (s, _p, i) =>
          s +
          (ages[i] >= pensionAge && !(t >= retireOffsets[i] && ages[i] >= preservationAge) ? superOf(i) : 0),
        0,
      );
      const assessedSuper = accessibleSuper + workingPensionAgeSuper;
      const financialAssets = outside + assessedSuper;
      const ap = agePension(
        {
          household: plan.household,
          homeowner: isHomeowner,
          assessableAssets: financialAssets + propertyEquity,
          financialAssets,
          otherIncome: assessableOther,
        },
        config,
      );
      // When only ONE member of a couple has reached Age Pension age, the household
      // is paid the member-of-a-couple rate (half the means-tested couple amount) —
      // the means test still uses combined assets/income, but the under-age partner
      // gets nothing until they too qualify. Paying the full couple rate here
      // overstated income by ~half for every age-gap couple through the gap.
      agePensionAmt = plan.household === "couple" && pensionEligible < 2 ? ap.annual / 2 : ap.annual;
      pensionBreakdown = {
        outsideAssets: outside,
        accessibleSuper: assessedSuper,
        propertyEquity,
        propertyParts,
        assessableAssets: financialAssets + propertyEquity,
        financialAssets,
        deemedIncome: deemedIncome(financialAssets, plan.household, config),
        otherIncome: assessableOther,
        assetsTestAnnual: ap.assetsTestAnnual,
        incomeTestAnnual: ap.incomeTestAnnual,
        bindingTest: ap.bindingTest,
      };
      if (agePensionAmt > 0 && firstAgePensionAge === null) {
        firstAgePensionAge = oldest;
      }
    }

    // Income tax on the net rental income, at each owner's marginal rate stacked on
    // their WORK income (a still-working partner's salary + part-time work), split
    // equally across the household. A rental LOSS stacks as a negative → it reduces
    // tax (negative gearing), bounded by the tax on that work income (a loss with no
    // taxable income to offset yields no benefit — carry-forward isn't modelled).
    // Simplification: stacked on work/salary only, not outside-super earnings.
    let rentTax = 0;
    if (rentCash !== 0) {
      const rentPer = rentCash / workers;
      rentTax = ages.reduce((s, a, i) => {
        const workPer = (t < retireOffsets[i] ? plan.people[i].salary * gapScale : 0) + grossWork / workers;
        return s + (taxAtAge(workPer + rentPer, a) - taxAtAge(workPer, a));
      }, 0);
    }
    const afterTaxRent = rentCash - rentTax;

    // External income offsets the spending the household must fund from
    // super/outside; any surplus (income beyond spending — e.g. a working
    // partner's salary covering the retiree's needs) is saved to outside super.
    const externalIncome = agePensionAmt + afterTaxRent + netWork + workTakeHome;
    const privateNeed = Math.max(0, spending - externalIncome);
    if (externalIncome > spending) outside += externalIncome - spending;

    // Guardrails: update next year's spend from THIS year's realised withdrawal
    // rate — the net-of-pension draw over the whole investable portfolio (D1). The
    // first retired year fixes the reference rate; thereafter, drifting above the
    // upper rail cuts spending, below the lower rail raises it (floored, D3).
    // Only anchor/adjust the rails when the PORTFOLIO is actually funding spending.
    // A year fully covered by income (a still-working partner, part-time work, or the
    // Age Pension) has privateNeed 0 and no meaningful withdrawal rate — anchoring
    // there would peg the rails at ~0 and ratchet spending to the floor forever, and
    // a spurious "rate below the lower rail" would trigger an unwarranted raise. So
    // skip income-covered years; the anchor waits for the first real draw.
    if (guardrails && guardSpend != null && privateNeed > EPS) {
      const portfolio = startSuper + startOutside;
      // A depleted portfolio means the draw rate is effectively infinite (drawing
      // from nothing) — that must read as ABOVE the upper rail, never a "0%".
      const rate = portfolio > EPS ? privateNeed / portfolio : Infinity;
      if (guardWr0 == null) {
        guardWr0 = Number.isFinite(rate) ? rate : 0;
      } else if (rate > guardWr0 * (1 + guardWidth) && guardSpend > guardFloor + EPS) {
        guardSpend = Math.max(guardFloor, guardSpend * (1 - guardStep)); // pay cut
      } else if (Number.isFinite(rate) && rate < guardWr0 * (1 - guardWidth)) {
        guardSpend *= 1 + guardStep; // raise
      }
    }

    // Super must pay at least its ATO minimum each year; beyond that we spend
    // OUTSIDE super FIRST. Super in pension phase earns tax-free, whereas money
    // held outside is taxed on its earnings — so preserving the super pool for
    // longer is more tax-efficient and makes the plan last longer. The order is
    // neutral for the Age Pension (both pools are assessed, and the same total is
    // spent either way), so there's no means-test cost to it. A member still
    // under preservation age has no accessible super, so the outside pool
    // naturally funds the early-retirement bridge.
    // The legislated minimum applies only to the PENSION pool (accumulation has no
    // forced drawdown), and it comes out first.
    const minDrawdownParts = accessibleIdx.map((i) => {
      const rate = minDrawdownRate(ages[i], config);
      return { age: ages[i], balance: pension[i], rate, amount: pension[i] * rate };
    });
    const minDraw = minDrawdownParts.reduce((s, pt) => s + pt.amount, 0);
    accessibleIdx.forEach((i) => (pension[i] -= pension[i] * minDrawdownRate(ages[i], config)));

    // Fund the remaining private need in a tax-aware order: OUTSIDE super (taxed at
    // your marginal rate) first, then ACCUMULATION super (15% on earnings), then the
    // tax-free PENSION pool above its minimum, preserved to last. `drawSuper` draws
    // accumulation before pension, so it covers those two steps in order.
    const needAfterMin = Math.max(0, privateNeed - minDraw);
    const outsideDrawn = Math.min(needAfterMin, outside);
    realizeOutside(outsideDrawn); // selling units to fund spending realises their gain
    outside -= outsideDrawn;
    const extra = drawSuper(accessibleIdx, needAfterMin - outsideDrawn);
    const accumDrawn = extra.accum; // accumulation super drawn above the minimum
    const pensionExtraDrawn = extra.pension; // tax-free pension drawn above the minimum
    const fromSuper = minDraw + accumDrawn + pensionExtraDrawn;
    // A mandatory minimum drawn beyond the actual need is reinvested outside super.
    const surplus = Math.max(0, minDraw - privateNeed);
    outside += surplus;

    const funded = externalIncome + fromSuper + outsideDrawn + EPS >= spending;

    // Deduct the fixed admin fee (no insurance in retirement), then grow. Pension-
    // phase super (≥ preservation age) is tax-free; both are net of the % fee.
    // Still-working members were already grown (and fee'd) by contribute() above,
    // so they carry their accumulation figures and are skipped here.
    let superGrowth = workSuperGrowth;
    let feesPaid = workFees;
    let retAccumTax = 0; // 15% earnings tax on the accumulation pool in retirement
    plan.people.forEach((_, i) => {
      if (t < retireOffsets[i]) return; // still working — handled by contribute()
      // Fixed admin fee — deducted from accumulation first, then pension.
      const fee = Math.min(fixedAdmin, Math.max(0, superOf(i)));
      const feeFromAccum = Math.min(fee, accum[i]);
      accum[i] -= feeFromAccum;
      pension[i] -= fee - feeFromAccum;
      feesPaid += fee;
      // The accumulation pool is taxed 15% on earnings whether it's the excess over
      // the Transfer Balance Cap (retired, over preservation) or preserved bridge
      // super. That tax is the gap between the tax-free and taxed return.
      retAccumTax += accum[i] * (superPensionReturn - superAccumReturn);
      if (ages[i] >= preservationAge) {
        // Pension pool earns tax-free; accumulation pool net of 15% earnings tax.
        superGrowth += pension[i] * superPensionReturn + accum[i] * superAccumReturn;
        pension[i] *= 1 + superPensionReturn;
        accum[i] *= 1 + superAccumReturn;
      } else {
        // Retired but under preservation age — super stays preserved in accumulation.
        superGrowth += accum[i] * superAccumReturn;
        accum[i] *= 1 + superAccumReturn;
      }
    });
    const outsideGrowth = outside * realReturn;
    // Split the year's return into an income yield (dividends — realised, taxed now)
    // and capital growth (unrealised — deferred until units are sold). The whole
    // return still compounds into the balance; only the tax treatment differs.
    const outsideIncome = Math.max(0, outside * outsideIncomeYield);
    unrealizedGain += outsideGrowth - outsideIncome; // capital growth accrues untaxed
    outside *= 1 + realReturn;

    // Super's real edge: pension-phase super earnings are tax-free, but money held
    // OUTSIDE super is taxable. In retirement we tax the year's outside income — the
    // dividend yield PLUS the capital gain realised by this year's withdrawals — at
    // each person's marginal rate, stacked on any part-time/salary income so the
    // tax-free threshold + SAPTO aren't double-used. Deferring the unrealised growth
    // (only the yield is taxed each year) is what an ETF/share investor experiences;
    // taxing the whole return as income every year badly over-taxes equities.
    //   The capital gain's treatment follows `cgtRegime`:
    //   • "indexed" (post-1 July 2027 reform): the model is in today's dollars, so the
    //     tracked gain is already the CPI-indexed REAL gain — the WHOLE real gain is
    //     taxable at the marginal rate, subject to a `cgtMinRatePct` (30%) minimum,
    //     from which Age Pension recipients are exempt.
    //   • "discount" (pre-2027 law): only 50% of the real gain is assessable, marginal.
    // (During accumulation the dividend yield is taxed too — stacked on salary — but
    // no gains are realised, so it's yield-only.)
    let outsideTax = 0;
    let outsideDivTax = 0; // dividend portion (ordinary income) — for the tax analysis
    let outsideCgtTax = 0; // realised-gain portion (capital gains) — for the tax analysis
    if (!accumPhase && (outsideIncome > 0 || realizedGain > 0)) {
      const incPer = outsideIncome / workers;
      const gainPer = Math.max(0, realizedGain) / workers;
      const onAgePension = agePensionAmt > 0; // exemption from the 30% minimum
      const rentPer = rentCash / workers; // net rent already assessed this year (may be a loss)
      plan.people.forEach((p, i) => {
        // Outside earnings chain ON TOP of ALL this person's ordinary income already
        // assessed — employment AND net rent — so the tax-free threshold / LITO / SAPTO
        // aren't consumed separately by each source (matches personTax's single stack).
        const workPer = (t < retireOffsets[i] ? p.salary * gapScale : 0) + grossWork / workers;
        const ordBase = workPer + rentPer;
        // Dividends: ordinary income, marginal, stacked on employment + net rent.
        outsideDivTax += Math.max(0, taxAtAge(ordBase + incPer, ages[i]) - taxAtAge(ordBase, ages[i]));
        // Capital gain: stacked on top of employment + net rent + dividends.
        if (gainPer > 0) {
          const base = ordBase + incPer;
          if (cgtRegime === "discount") {
            outsideCgtTax += Math.max(0, taxAtAge(base + cgtDiscount * gainPer, ages[i]) - taxAtAge(base, ages[i]));
          } else {
            const marginal = Math.max(0, taxAtAge(base + gainPer, ages[i]) - taxAtAge(base, ages[i]));
            outsideCgtTax += onAgePension ? marginal : Math.max(marginal, cgtMinRate * gainPer);
          }
        }
      });
      outsideTax = outsideDivTax + outsideCgtTax;
      // Can't pay more tax than the pool holds — in the year outside is drawn to $0
      // to fund spending, the CGT on that final drawdown has nothing left to come
      // from (a small edge understatement; the recorded tax matches what's deducted
      // so the ledger reconciles). Apportion the cap across the two slices.
      const capped = Math.min(outsideTax, Math.max(0, outside));
      if (outsideTax > 0 && capped < outsideTax) {
        const f = capped / outsideTax;
        outsideDivTax *= f;
        outsideCgtTax *= f;
      }
      outsideTax = capped;
      outside -= outsideTax;
    }

    // Per-person consolidated tax for the tax modal (gap salary + part-time work +
    // net rent + dividends taxed together; realised gain on top with the regime).
    const onAgePensionRet = agePensionAmt > 0;
    const retTaxDetail = plan.people.map((p, i) =>
      taxDetailFor(
        i,
        {
          salary: t < retireOffsets[i] ? p.salary * gapScale : 0,
          work: grossWork / workers,
          rent: rentCash / workers,
          dividends: outsideIncome / workers,
          gain: Math.max(0, realizedGain) / workers,
        },
        ages[i] >= pensionAge,
        onAgePensionRet,
      ),
    );

    const phase: Phase =
      oldest >= pensionAge
        ? "pension"
        : ages.every((a) => a < preservationAge)
          ? "bridge"
          : "drawdown";

    rows.push(
      row(oldest, startSuper, startOutside, agePensionAmt, fromSuper, outsideDrawn, spending, phase, funded, rentCash, propertyEquity, {
        openingSuper: startSuper,
        openingOutside: startOutside,
        closingSuper: totalSuper(),
        closingOutside: outside,
        pensionSuper: openPension,
        accumSuper: openAccum,
        accumDrawn,
        pensionExtraDrawn,
        contribGross: workContribGross,
        contribTax: workContribTax,
        contribNet: workContribNet,
        savings: 0,
        salaryIncome: workGrossSalary,
        takeHome: workTakeHome,
        ttrBenefit: 0,
        workIncome: netWork,
        superGrowth,
        outsideGrowth,
        fees: feesPaid,
        earningsTax: Math.max(0, workEarningsTax + retAccumTax),
        outsideTax,
        outsideDividend: outsideIncome,
        // Tax-analysis totals (consolidated per person). Income tax = ordinary income
        // (gap salary + part-time work + net rent + dividends) taxed together with one
        // LITO/SAPTO; capital gains = outside realised gains + property-sale CGT. Super
        // pension drawdowns and the Age Pension are tax-free.
        incomeTax: retTaxDetail.reduce((s, d) => s + d.incomeTax, 0),
        medicare: retTaxDetail.reduce((s, d) => s + d.medicare, 0),
        capitalGains: retTaxDetail.reduce((s, d) => s + d.cgt, 0) + propertyCgt,
        taxDetail: retTaxDetail,
        agePension: agePensionAmt,
        pension: pensionBreakdown,
        rentIncome: rentCash,
        rentTax,
        minDrawdown: minDraw,
        minDrawdownParts,
        livingSpend,
        rentCost: rentExpense,
        mortgageCost,
        mortgageCleared: mortgageClearedNow,
        lumpSum: lumpSumNow,
        recontribution: recontributionNow,
        propertyProceeds,
        propertyCgt,
        homeProceeds: homeProceedsThisYear,
        homeProceedsToSuper: homeToSuperThisYear,
        homeValue: homeValueThisYear,
        homeEquity: homeEquityThisYear,
        onBreak: workOnBreak, // a still-working partner on a gap year → charts shade it
      }),
    );
  }

  // Depletion = the age the balance actually reaches $0 on the chart. A shortfall
  // year first appears when savings can't cover full spending; because the plot
  // shows start-of-year balances, the balance itself only hits zero the next year.
  // Reporting that zero age keeps the marker, card and narrative aligned with the graph.
  const firstShortAge = rows.find((r) => !r.funded)?.age ?? null;
  if (firstShortAge !== null) {
    const zeroRow = rows.find(
      (r) => r.phase !== "accumulation" && r.age >= firstShortAge && r.total < 1,
    );
    depletedAge = zeroRow ? zeroRow.age : firstShortAge;
  }

  return {
    rows,
    retirementAge: plan.retirementAge,
    partnerRetirementAge: hasStaggeredRetirement(plan) ? personRetirementAge(plan, 1) : null,
    superUnlockAge,
    superUnlockIsPartner,
    agePensionAge: pensionAge,
    superAtRetirement,
    totalAtRetirement,
    depletedAge,
    lastsToLifeExpectancy: depletedAge === null,
    firstAgePensionAge,
    realReturn: meanRealReturn,
  };
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function row(
  age: number,
  totalSuper: number,
  outside: number,
  agePensionAmt: number,
  superDrawn: number,
  outsideDrawn: number,
  spending: number,
  phase: Phase,
  funded: boolean,
  rentIncome: number,
  propertyEquity: number,
  breakdown: YearBreakdown,
): YearRow {
  return {
    age,
    totalSuper,
    outside,
    total: totalSuper + outside,
    agePension: agePensionAmt,
    pension: breakdown.pension,
    salaryIncome: breakdown.salaryIncome,
    takeHome: breakdown.takeHome,
    workIncome: breakdown.workIncome,
    homeValue: breakdown.homeValue,
    homeEquity: breakdown.homeEquity,
    superDrawn,
    outsideDrawn,
    spending,
    rentIncome,
    propertyEquity,
    phase,
    funded,
    breakdown,
  };
}
