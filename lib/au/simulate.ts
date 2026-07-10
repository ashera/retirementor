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
  getInvestmentProperties,
  hasStaggeredRetirement,
  householdRetirementOffset,
  personRetirementAge,
  personRetirementOffset,
  spendingForAge,
  startingSuperBalances,
} from "./types";
import { mortgageActiveAtAge, mortgageAnnualCost } from "./mortgage";
import { incomeTax, seniorIncomeTax } from "./tax";
import {
  capitalGainsTax,
  netEquity,
  netRentCash,
  netSaleProceeds,
  propertyValueAt,
} from "./property";
import type { Person, Phase, RetirementPlan, SimResult, YearBreakdown, YearRow } from "./types";

const EPS = 1e-6;

function realRate(nominalPct: number, inflationPct: number): number {
  return (1 + nominalPct / 100) / (1 + inflationPct / 100) - 1;
}

// Optional per-year NOMINAL returns (percent). When omitted the deterministic mean
// (plan.investmentReturn) is used every year. Monte Carlo passes a random sequence.
export function simulate(
  plan: RetirementPlan,
  config: EngineConfig,
  nominalReturns?: number[],
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

  const balances = startingSuperBalances(plan);
  let outside = plan.outsideSuper;

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

  // A home loan carried into retirement. `mortgageCleared` flips true once a
  // "clear at retirement" lump sum has been paid off from super.
  const mortgage = plan.mortgage;
  let mortgageCleared = false;

  // Investment properties. `sold[i]` flips true once that property's "sell at age"
  // event has released its net proceeds into the outside-super pool.
  const properties = getInvestmentProperties(plan);
  const sold = properties.map(() => false);

  // Optional home downsize: a one-off equity release at an age (home stays
  // exempt). `downsized` guards it to a single event.
  const downsize = plan.home?.downsize;
  let downsized = false;
  // Optional sell-up-and-rent: releases all equity, then becomes a renter
  // (non-homeowner means test + ongoing rent) from `atAge`.
  const sellRent = plan.home?.sellAndRent;
  let soldHome = false;
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

    // This year's returns (constant mean, or a Monte Carlo draw).
    const nom = nominalReturns ? (nominalReturns[t] ?? plan.investmentReturn) : plan.investmentReturn;
    // Deflate by wage inflation pre-retirement, CPI from the household boundary on.
    const deflator = accumPhase ? wageInflation : cpi;
    const realReturn = realRate(nom, deflator); // outside super (no super fee)
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
      const takeHome = taxable - incomeTax(taxable);
      let ttrBenefit = 0;
      if (ttrEligible && plan.ttr && plan.ttr.extraSacrifice > 0) {
        const ttrSacrificed = Math.min(plan.ttr.extraSacrifice * scale, Math.max(0, cap - concessional));
        if (ttrSacrificed > 0) {
          const taxSaved = incomeTax(taxable) - incomeTax(Math.max(0, taxable - ttrSacrificed));
          ttrBenefit = taxSaved - ttrSacrificed * config.contributionsTax;
        }
      }
      const ncc = Math.min(p.voluntaryNonConcessional * scale, nccCap);
      const div293Income = salary + concessional;
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
      for (let i = 0; i < balances.length; i++) balances[i] *= rebase;
      outside *= rebase;
    }

    // The home appreciates in real terms over the prior year (until it is sold).
    if (t > 0 && homeVal > 0) homeVal *= 1 + homeGrowth;

    // Home downsize: free up equity once the oldest reaches the chosen age. The
    // freed equity is the GROWN home value less the new home and any loan, so a
    // later downsize frees more and net worth carries across the event. The
    // downsizer portion lands in the primary's super (assessable once accessible),
    // the rest in outside savings (deemed). The home itself stays exempt.
    const loanBal = mortgage?.balance ?? 0;
    let homeProceedsThisYear = 0;
    let homeToSuperThisYear = 0;
    if (downsize && !downsized && oldest >= downsize.atAge) {
      const release = Math.max(0, homeVal - downsize.newValue - loanBal);
      const toSuper = Math.max(0, Math.min(downsize.toSuper, release));
      const toOutside = Math.max(0, release - toSuper);
      if (balances.length) balances[0] += toSuper;
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
      mortgage && !mortgageCleared && isHomeowner && mortgageActiveAtAge(mortgage, oldest) ? mortgage.balance : 0;
    const homeEquityThisYear = Math.max(0, homeValueThisYear - outstandingLoan);

    // Balances at the START of this year (on the birthday) — this is what each
    // data point plots, so the peak lands on the retirement age, not the year before.
    const startSuper = sum(balances);
    const startOutside = outside;

    if (accumPhase) {
      // --- Accumulation: add contributions (net of 15%), then grow. ---
      let contribGross = 0;
      let contribTax = 0;
      let contribNet = 0;
      let superGrowth = 0;
      let earningsTax = 0;
      let feesPaid = 0;
      let takeHome = 0; // net cash from salary after income tax and pre-tax sacrifice
      let ttrBenefit = 0; // net super gained from a Transition-to-Retirement swap this year
      plan.people.forEach((p, i) => {
        const r = contribute(p, balances[i], 1, i === 0 && ages[i] >= preservationAge);
        balances[i] = r.newBalance;
        contribGross += r.contribGross;
        contribTax += r.contribTax;
        contribNet += r.contribNet;
        feesPaid += r.feesPaid;
        superGrowth += r.superGrowth;
        earningsTax += r.earningsTax;
        takeHome += r.takeHome;
        ttrBenefit += r.ttrBenefit;
      });
      const savings = plan.annualOutsideSavings;
      const outsideHalf = Math.pow(1 + realReturn, 0.5);
      outside = startOutside * (1 + realReturn) + savings * outsideHalf;
      const outsideGrowth = outside - startOutside - savings;

      // Held investment-property equity (value − loan) for the net-worth view.
      // Nothing sells while working, so every property still counts. The engine
      // otherwise only needs this in retirement (the means test), but the net-worth
      // band spans the whole timeline, so we compute it here too.
      const accumPropertyEquity = properties.reduce((s, prop) => s + netEquity(prop, propertyValueAt(prop, t)), 0);

      rows.push(
        row(oldest, startSuper, startOutside, 0, 0, 0, 0, "accumulation", true, 0, accumPropertyEquity, {
          openingSuper: startSuper,
          openingOutside: startOutside,
          closingSuper: sum(balances),
          closingOutside: outside,
          contribGross,
          contribTax,
          contribNet,
          savings,
          salaryIncome: plan.people.reduce((s, p) => s + p.salary, 0),
          takeHome,
          ttrBenefit,
          workIncome: 0,
          superGrowth,
          outsideGrowth,
          fees: feesPaid,
          earningsTax: Math.max(0, earningsTax),
          outsideTax: 0,
          agePension: 0,
          pension: null,
          rentIncome: 0,
          minDrawdown: 0,
          minDrawdownParts: [],
          livingSpend: 0,
          rentCost: 0,
          mortgageCost: 0,
          mortgageCleared: 0,
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
    plan.people.forEach((p, i) => {
      if (t >= retireOffsets[i]) return; // already retired — drawn down below
      const r = contribute(p, balances[i], gapScale, i === 0 && ages[i] >= preservationAge);
      balances[i] = r.newBalance;
      workContribGross += r.contribGross;
      workContribTax += r.contribTax;
      workContribNet += r.contribNet;
      workFees += r.feesPaid;
      workSuperGrowth += r.superGrowth;
      workEarningsTax += r.earningsTax;
      workTakeHome += r.takeHome;
      workGrossSalary += p.salary * gapScale;
    });

    // Only RETIRED members at/over preservation age can draw down (and are
    // assessed as financial assets); a partner still working keeps accumulating.
    const accessibleIdx = plan.people
      .map((_, i) => i)
      .filter((i) => t >= retireOffsets[i] && ages[i] >= preservationAge);
    let accessibleSuper = accessibleIdx.reduce((s, i) => s + balances[i], 0);

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
      accessibleSuper >= mortgage.balance
    ) {
      const ratio = mortgage.balance / accessibleSuper;
      accessibleIdx.forEach((i) => {
        balances[i] -= balances[i] * ratio;
      });
      accessibleSuper -= mortgage.balance;
      mortgageCleared = true;
      mortgageClearedNow = mortgage.balance;
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
    const livingSpend = spendingForAge(plan, oldest);
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
        const proceeds = netSaleProceeds(prop, value);
        propertyProceeds += proceeds;
        propertyCgt += capitalGainsTax(prop, value);
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

    // Part-time work in early retirement. Income tax applies (with SAPTO, so
    // modest amounts are near tax-free): the AFTER-TAX amount offsets drawdown,
    // while the GROSS amount is assessable under the Age Pension income test, net
    // of the Work Bonus ($300/fortnight, i.e. $7,800/yr per person). Tax is worked
    // out per person (split across a couple → two thresholds/offsets).
    const work = plan.workIncome;
    const workers = plan.people.length;
    const grossWork = work && oldest < work.untilAge ? Math.max(0, work.perYear) : 0;
    const workTax = grossWork > 0 ? workers * seniorIncomeTax(grossWork / workers, plan.household) : 0;
    const netWork = grossWork - workTax;
    const assessableWork = Math.max(0, grossWork - 7_800 * workers);
    // A still-working partner's salary is ordinary assessable income for the
    // pension income test (no Work Bonus — that's for pension-age workers).
    const assessableOther = rentAssessable + assessableWork + workGrossSalary;

    // Age Pension (household level, from pension age). Financial assets are deemed;
    // an investment property's equity is assessable but NOT deemed, and its rent is
    // counted as actual income — so these two are no longer the same figure.
    let agePensionAmt = 0;
    let pensionBreakdown: YearBreakdown["pension"] = null;
    if (oldest >= pensionAge) {
      const financialAssets = outside + accessibleSuper;
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
      agePensionAmt = ap.annual;
      pensionBreakdown = {
        outsideAssets: outside,
        accessibleSuper,
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

    // External income offsets the spending the household must fund from
    // super/outside; any surplus (income beyond spending — e.g. a working
    // partner's salary covering the retiree's needs) is saved to outside super.
    const externalIncome = agePensionAmt + rentCash + netWork + workTakeHome;
    const privateNeed = Math.max(0, spending - externalIncome);
    if (externalIncome > spending) outside += externalIncome - spending;

    // Draw from super first (reduces assessable assets), enforcing minimum drawdown.
    const minDrawdownParts = accessibleIdx.map((i) => {
      const rate = minDrawdownRate(ages[i], config);
      return { age: ages[i], balance: balances[i], rate, amount: balances[i] * rate };
    });
    const minDraw = minDrawdownParts.reduce((s, pt) => s + pt.amount, 0);
    const fromSuper = Math.min(Math.max(privateNeed, minDraw), accessibleSuper);
    if (accessibleSuper > EPS && fromSuper > 0) {
      const ratio = fromSuper / accessibleSuper;
      accessibleIdx.forEach((i) => {
        balances[i] -= balances[i] * ratio;
      });
    }

    // Any mandatory super drawn beyond need is reinvested outside super.
    const surplus = Math.max(0, fromSuper - privateNeed);
    outside += surplus;

    const stillNeed = Math.max(0, privateNeed - fromSuper);
    const outsideDrawn = Math.min(stillNeed, outside);
    outside -= outsideDrawn;

    const funded = externalIncome + fromSuper + outsideDrawn + EPS >= spending;

    // Deduct the fixed admin fee (no insurance in retirement), then grow. Pension-
    // phase super (≥ preservation age) is tax-free; both are net of the % fee.
    // Still-working members were already grown (and fee'd) by contribute() above,
    // so they carry their accumulation figures and are skipped here.
    let superGrowth = workSuperGrowth;
    let feesPaid = workFees;
    plan.people.forEach((_, i) => {
      if (t < retireOffsets[i]) return; // still working — handled by contribute()
      const fee = Math.min(fixedAdmin, Math.max(0, balances[i]));
      balances[i] -= fee;
      feesPaid += fee;
      const rate = ages[i] >= preservationAge ? superPensionReturn : superAccumReturn;
      superGrowth += balances[i] * rate;
      balances[i] *= 1 + rate;
    });
    const outsideGrowth = outside * realReturn;
    outside *= 1 + realReturn;

    // Super's real edge: pension-phase super earnings are tax-free, but earnings
    // on money held OUTSIDE super are taxable. In retirement we tax the (nominal)
    // outside-super earnings at the senior marginal rate, stacked on top of any
    // part-time work income so the tax-free threshold + SAPTO aren't double-used.
    // SAPTO shields modest amounts, so this mainly bites larger balances — which
    // is exactly when a downsizer contribution into super pays off. (Accumulation-
    // phase outside earnings are left untaxed, as before.)
    let outsideTax = 0;
    if (!accumPhase) {
      const outsideEarnings = Math.max(0, outside * (nom / 100)); // nominal, today's $
      if (outsideEarnings > 0) {
        const workPer = grossWork / workers;
        const earnPer = outsideEarnings / workers; // household earnings split per person
        outsideTax =
          workers * Math.max(0, seniorIncomeTax(workPer + earnPer, plan.household) - seniorIncomeTax(workPer, plan.household));
        outside = Math.max(0, outside - outsideTax);
      }
    }

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
        closingSuper: sum(balances),
        closingOutside: outside,
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
        earningsTax: Math.max(0, workEarningsTax),
        outsideTax,
        agePension: agePensionAmt,
        pension: pensionBreakdown,
        rentIncome: rentCash,
        minDrawdown: minDraw,
        minDrawdownParts,
        livingSpend,
        rentCost: rentExpense,
        mortgageCost,
        mortgageCleared: mortgageClearedNow,
        propertyProceeds,
        propertyCgt,
        homeProceeds: homeProceedsThisYear,
        homeProceedsToSuper: homeToSuperThisYear,
        homeValue: homeValueThisYear,
        homeEquity: homeEquityThisYear,
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
