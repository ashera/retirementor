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
import { getInvestmentProperties, spendingForAge, startingSuperBalances } from "./types";
import { mortgageActiveAtAge, mortgageAnnualCost } from "./mortgage";
import { seniorEmploymentTax } from "./tax";
import {
  capitalGainsTax,
  netEquity,
  netRentCash,
  netSaleProceeds,
  propertyValueAt,
} from "./property";
import type { Phase, RetirementPlan, SimResult, YearBreakdown, YearRow } from "./types";

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
  const retireOffset = Math.max(
    0,
    Math.round(plan.retirementAge - plan.people[0].currentAge),
  );

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
  // stated value get the same default the downsize lever assumes.
  const homeBaseValue = plan.homeowner ? (plan.home?.value ?? 900_000) : 0;

  for (let t = 0; t <= horizon; t++) {
    const ages = plan.people.map((p) => p.currentAge + t);
    const oldest = Math.max(...ages);
    const working = t < retireOffset;

    // This year's returns (constant mean, or a Monte Carlo draw).
    const nom = nominalReturns ? (nominalReturns[t] ?? plan.investmentReturn) : plan.investmentReturn;
    // Deflate by wage inflation while working (pre-retirement), CPI once retired.
    const deflator = working ? wageInflation : cpi;
    const realReturn = realRate(nom, deflator); // outside super (no super fee)
    // Super returns are net of the % investment/admin fee. Accumulation also pays
    // 15% earnings tax; pension-phase super is tax-free.
    const superAccumReturn = realRate(nom * (1 - config.superEarningsTaxAccumulation) - feePct, deflator);
    const superPensionReturn = realRate(nom - feePct, deflator);

    // RG 276 two-stage boundary. The accumulation trajectory is expressed in
    // WAGE-deflated today's dollars; everything from retirement onward is
    // expressed in CPI today's dollars (retiree spending AND the Age Pension
    // thresholds both index to CPI, not wages). So as we cross into retirement we
    // re-express the accumulated stock from wage-real to CPI-real. This is exact:
    // the wage deflator was applied uniformly across the `retireOffset` working
    // years, so nominal/(1+wage)ⁿ becomes nominal/(1+cpi)ⁿ by scaling the whole
    // pool by ((1+wage)/(1+cpi))ⁿ. It also makes the means test assess the same
    // CPI-real balance the retiree actually holds. (No-op when wage == cpi.)
    if (t === retireOffset && retireOffset > 0) {
      const rebase = Math.pow((1 + wageInflation / 100) / (1 + cpi / 100), retireOffset);
      for (let i = 0; i < balances.length; i++) balances[i] *= rebase;
      outside *= rebase;
    }

    // Home downsize: free up equity once the oldest reaches the chosen age. The
    // downsizer portion lands in the primary's super (assessable once accessible),
    // the rest in outside savings (deemed). The home itself stays exempt.
    let homeProceedsThisYear = 0;
    let homeToSuperThisYear = 0;
    if (downsize && !downsized && oldest >= downsize.atAge) {
      const toSuper = Math.max(0, Math.min(downsize.toSuper, downsize.release));
      const toOutside = Math.max(0, downsize.release - toSuper);
      if (balances.length) balances[0] += toSuper;
      outside += toOutside;
      downsized = true;
      homeProceedsThisYear = downsize.release;
      homeToSuperThisYear = toSuper;
      if (mortgage) mortgageCleared = true; // discharged from the sale (freed equity is net of it)
    }
    // Sell up and rent: release all equity into savings (a mortgage is repaid
    // from proceeds, so `release` is net of it). Renter status/rent apply below.
    if (sellRent && !soldHome && oldest >= sellRent.atAge) {
      outside += Math.max(0, sellRent.release);
      soldHome = true;
      homeProceedsThisYear = sellRent.release;
      if (mortgage) mortgageCleared = true; // discharged from the sale
    }
    const isHomeowner = plan.homeowner && !(sellRent != null && oldest >= sellRent.atAge);
    const homeValueThisYear = soldHome ? 0 : downsized ? (downsize?.newValue ?? homeBaseValue) : homeBaseValue;

    // Balances at the START of this year (on the birthday) — this is what each
    // data point plots, so the peak lands on the retirement age, not the year before.
    const startSuper = sum(balances);
    const startOutside = outside;

    if (working) {
      // --- Accumulation: add contributions (net of 15%), then grow. ---
      let contribGross = 0;
      let contribTax = 0;
      let contribNet = 0;
      let superGrowth = 0;
      let earningsTax = 0;
      let feesPaid = 0;
      // Contributions arrive through the year, so grow ~half a year on average.
      const superHalf = Math.pow(1 + superAccumReturn, 0.5);
      plan.people.forEach((p, i) => {
        const concessional = Math.min(
          p.salary * config.sgRate + p.voluntaryConcessional,
          config.concessionalCap,
        );
        const ncc = Math.min(p.voluntaryNonConcessional, config.nonConcessionalCap);
        // Division 293: an extra 15% on the concessional contributions that push
        // income (salary + concessional) over the high-income threshold.
        const div293Income = p.salary + concessional;
        const taxed293 = Math.min(concessional, Math.max(0, div293Income - config.div293Threshold));
        const extra293 = taxed293 * config.div293ExtraTaxRate;
        const added = concessional * (1 - config.contributionsTax) - extra293 + ncc;
        const fee = fixedAdmin + insurance; // fixed admin + insurance while working
        const net = added - fee;
        const opening = balances[i];
        // Opening grows a full year; this year's net contribution grows half a year.
        balances[i] = opening * (1 + superAccumReturn) + net * superHalf;
        contribGross += concessional;
        contribTax += concessional * config.contributionsTax + extra293;
        contribNet += added;
        feesPaid += fee;
        superGrowth += balances[i] - opening - net;
        // Isolate the earnings tax (vs a tax-free, same-fee pool).
        earningsTax += opening * (superPensionReturn - superAccumReturn);
      });
      const savings = plan.annualOutsideSavings;
      const outsideHalf = Math.pow(1 + realReturn, 0.5);
      outside = startOutside * (1 + realReturn) + savings * outsideHalf;
      const outsideGrowth = outside - startOutside - savings;

      rows.push(
        row(oldest, startSuper, startOutside, 0, 0, 0, 0, "accumulation", true, 0, 0, {
          openingSuper: startSuper,
          openingOutside: startOutside,
          closingSuper: sum(balances),
          closingOutside: outside,
          contribGross,
          contribTax,
          contribNet,
          savings,
          salaryIncome: plan.people.reduce((s, p) => s + p.salary, 0),
          workIncome: 0,
          superGrowth,
          outsideGrowth,
          fees: feesPaid,
          earningsTax: Math.max(0, earningsTax),
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
        }),
      );
      continue;
    }

    // --- Retirement year ---
    if (t === retireOffset) {
      superAtRetirement = startSuper;
      totalAtRetirement = startSuper + startOutside;
    }

    const accessibleIdx = plan.people
      .map((_, i) => i)
      .filter((i) => ages[i] >= preservationAge);
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
    const workTax = grossWork > 0 ? workers * seniorEmploymentTax(grossWork / workers, plan.household) : 0;
    const netWork = grossWork - workTax;
    const assessableWork = Math.max(0, grossWork - 7_800 * workers);
    const assessableOther = rentAssessable + assessableWork;

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

    // Rent offsets the spending the household must fund from super/outside; any
    // surplus income (pension + rent beyond spending) is saved to outside super.
    const externalIncome = agePensionAmt + rentCash + netWork;
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
    let superGrowth = 0;
    let feesPaid = 0;
    plan.people.forEach((_, i) => {
      const fee = Math.min(fixedAdmin, Math.max(0, balances[i]));
      balances[i] -= fee;
      feesPaid += fee;
      const rate = ages[i] >= preservationAge ? superPensionReturn : superAccumReturn;
      superGrowth += balances[i] * rate;
      balances[i] *= 1 + rate;
    });
    const outsideGrowth = outside * realReturn;
    outside *= 1 + realReturn;

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
        contribGross: 0,
        contribTax: 0,
        contribNet: 0,
        savings: 0,
        salaryIncome: 0,
        workIncome: netWork,
        superGrowth,
        outsideGrowth,
        fees: feesPaid,
        earningsTax: 0,
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
    workIncome: breakdown.workIncome,
    homeValue: breakdown.homeValue,
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
