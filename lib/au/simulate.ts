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
  getLifeEvents,
  keepAccumConfig,
  hasStaggeredRetirement,
  householdHorizon,
  householdRetirementOffset,
  oldestCurrentAge,
  personRetirementAge,
  personRetirementOffset,
  spendingForAge,
  startingSuperBalances,
} from "./types";
import { mortgageActiveAtAge, mortgageAnnualCost, outstandingBalance } from "./mortgage";
import { budgetSplit, presetCategories } from "./budget";
import { residentIncomeTax, seniorIncomeTax, medicareLevy, personTax, type CgtParams } from "./tax";
import { capitalGainsTax, netEquity, netRentCash, propertyValueAt } from "./property";
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
  // Debt recycling: the outstanding geared investment loan. The sleeve's SHARES live
  // in `outside` (so they grow, pay taxed dividends and defer CGT like the rest of the
  // pool); this liability is netted out of the reported pool + net worth, and unwound
  // (repaid from the pool) from the retirement boundary on.
  let drLoan = 0;
  const drCfg = plan.debtRecycle;
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

  const startOldest = oldestCurrentAge(plan);
  // Run until the YOUNGEST reaches life expectancy (the timeline is still indexed by
  // the oldest's age, which therefore runs past LE in the tail — the survivor's years).
  const horizon = householdHorizon(plan);
  // Per-person retirement offsets (years from now). The household enters the
  // retirement/spending phase at the EARLIEST of them; a partner retiring later
  // keeps earning and contributing through the gap (their salary offsets the
  // drawdown). With a single shared retirement age these all coincide, so the
  // whole staggered path collapses to the original single-boundary behaviour.
  const retireOffsets = plan.people.map((_, i) => personRetirementOffset(plan, i));
  const earliestOffset = householdRetirementOffset(plan);
  // The wage→CPI re-express factor applied to the whole `outside` pool at the
  // retirement boundary (below). CPI-real amounts injected into `outside` BEFORE the
  // boundary (a property sale, downsize or sell-and-rent during the working years)
  // must be pre-divided by it, or the boundary rebase over-inflates them (they're
  // already CPI-real, not wage-real like salary-derived savings).
  const boundaryRebase = earliestOffset > 0 ? Math.pow((1 + wageInflation / 100) / (1 + cpi / 100), earliestOffset) : 1;
  // Add a CPI-real amount to the outside pool on the correct basis for the phase.
  const addCpiRealOutside = (amount: number, t: number) => {
    outside += t < earliestOffset ? amount / boundaryRebase : amount;
  };

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
  // Per-person version of the above: the (oldest-person) age each member's preserved
  // super first flips into the tax-free pension pool AFTER retirement began (an early
  // retiree turning 60, or a kept-in-accumulation member converting at Age-Pension
  // age). null when it coincided with their retirement (nothing distinct to mark).
  const superUnlockAges: (number | null)[] = plan.people.map(() => null);

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
  // Keep-super-in-accumulation config (per-person + mode), null when off.
  const keepAccum = keepAccumConfig(plan);
  // Optional one-off lump sum withdrawn (and spent) from super at a chosen age.
  const lumpSum = plan.lumpSum;
  let lumpSumTaken = false;
  // Committed life events: one-off windfalls (→ savings, untaxed) and one-off
  // expenses (an extra draw). Each fires ONCE, in the first year the oldest person
  // reaches its age; `eventFired` guards against re-firing (mirrors lumpSumTaken).
  const lifeEvents = getLifeEvents(plan);
  const eventFired = lifeEvents.map(() => false);
  // Sum this year's due events (marking them fired) into income + expense totals.
  const fireLifeEvents = (oldestAge: number) => {
    let income = 0;
    let expense = 0;
    lifeEvents.forEach((e, i) => {
      if (eventFired[i] || oldestAge < e.atAge) return;
      if (e.kind === "income") income += e.amount;
      else expense += e.amount;
      eventFired[i] = true;
    });
    return { income, expense };
  };
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
  // Guardrails flex AROUND the spending smile: living-spend = this age's smile spend
  // × a market-driven multiplier (guardFactor). The go-go/slow-go/no-go decline is
  // preserved; guardFactor moves only on genuine market over/under-performance,
  // measured on a smile-neutral withdrawal rate (below) so the smile's own decline
  // doesn't trip the rails. For a flat plan (smile constant) this is byte-identical
  // to the old fixed-dollar guardSpend.
  let guardFactor = 1; // market-flex multiplier on the age's smile spend (D2/D3 ratchet)
  let guardAnchorBase: number | null = null; // smile spend at the anchor year (the rail base)
  let guardWr0: number | null = null; // initial net-of-pension withdrawal rate (the rail reference)
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
    const contribute = (p: Person, opening: number, scale: number, ttrEligible: boolean, senior: boolean) => {
      const salary = p.salary * scale;
      const cap = config.concessionalCap * scale;
      const nccCap = config.nonConcessionalCap * scale;
      const div293Threshold = config.div293Threshold * scale;
      const concessional = Math.min(salary * config.sgRate + p.voluntaryConcessional * scale, cap);
      const sacrificed = Math.max(0, concessional - salary * config.sgRate);
      const taxable = Math.max(0, salary - sacrificed);
      // Personal income tax on the salary: a still-working partner who has reached Age
      // Pension age (a staggered gap) gets SAPTO, so use the senior scale — matching
      // taxAtAge in the retirement branch (the old flat resident scale over-taxed them).
      const netTax = senior ? (x: number) => seniorIncomeTax(x, plan.household) : residentIncomeTax;
      // Take-home is real cash the household spends/banks, so it must include the 2%
      // Medicare levy (unlike the income-tax fns, which omit it for the CGT use).
      const takeHome = taxable - netTax(taxable) - medicareLevy(taxable, senior);
      let ttrBenefit = 0;
      if (ttrEligible && plan.ttr && plan.ttr.extraSacrifice > 0) {
        const ttrSacrificed = Math.min(plan.ttr.extraSacrifice * scale, Math.max(0, cap - concessional));
        if (ttrSacrificed > 0) {
          // Sacrificing cuts taxable income, so it saves the marginal income tax AND
          // the 2% Medicare levy on that slice — net of the 15% contributions tax.
          const lower = Math.max(0, taxable - ttrSacrificed);
          const taxSaved =
            netTax(taxable) - netTax(lower) + (medicareLevy(taxable, senior) - medicareLevy(lower, senior));
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
      // Fixed admin + insurance are $ deductions. Cap them at what the account can
      // actually bear so a $0-balance, non-earning member (or a run-down account)
      // can't go NEGATIVE — matching the retirement branch, which already floors the
      // fee. For any funded account this is byte-identical to `fee * superHalf`.
      const feeNominal = fixedAdmin + insurance;
      const preFee = opening * (1 + superAccumReturn) + (added + ttrBenefit) * superHalf;
      const feeImpact = Math.max(0, Math.min(feeNominal * superHalf, preFee));
      const fee = superHalf > 0 ? feeImpact / superHalf : 0;
      const net = added - fee + ttrBenefit;
      const newBalance = preFee - feeImpact;
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
        salaryIncomeTax: netTax(taxable), // personal income tax on the salary (after LITO/SAPTO), surfaced for the tax analysis
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
      for (let i = 0; i < accum.length; i++) {
        accum[i] *= boundaryRebase;
        pension[i] *= boundaryRebase;
      }
      outside *= boundaryRebase;
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
    // The loan's TODAY'S-DOLLARS balance wherever it meets a real-dollar figure
    // (equity release, net worth, clear-from-super): the OUTSTANDING nominal balance —
    // amortised for a P&I loan part-way through its term, constant for interest-only —
    // deflated the same way the repayment (mortgageCost, below) is. Using the full
    // original balance would over-state the debt and destroy real equity.
    const loanBalReal = mortgage ? outstandingBalance(mortgage, t) / Math.pow(1 + plan.inflation / 100, t) : 0;
    const loanBal =
      mortgage && !mortgageCleared && mortgageActiveAtAge(mortgage, oldest, t) ? loanBalReal : 0;
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
      addCpiRealOutside(toOutside, t); // CPI-real freed equity — pre-boundary it's basis-corrected
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
      addCpiRealOutside(release, t); // CPI-real freed equity — pre-boundary it's basis-corrected
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
      mortgage && !mortgageCleared && isHomeowner && mortgageActiveAtAge(mortgage, oldest, t) ? loanBalReal : 0;
    const homeEquityThisYear = Math.max(0, homeValueThisYear - outstandingLoan);

    // Balances at the START of this year (on the birthday) — this is what each
    // data point plots, so the peak lands on the retirement age, not the year before.
    const startSuper = totalSuper();
    const startOutside = outside;
    const drStart = drLoan; // opening investment-loan balance (for net reporting)

    // Life events due this year (fired once). Income adds to savings in either
    // phase; an expense is an extra draw — from savings while working, folded into
    // the retirement drawdown once retired (see each branch).
    const { income: eventIncomeNow, expense: eventExpenseNow } = fireLifeEvents(oldest);

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
        const r = contribute(person, accum[i], 1, i === 0 && ages[i] >= preservationAge && !brk, ages[i] >= pensionAge);
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
      // A life-event windfall arrives mid-year, so it earns ~half a year's return
      // (like savings) — weighted here rather than added post-growth (0 return, the
      // old accumulation behaviour, inconsistent with the retirement phase).
      outside = startOutside * (1 + realReturn) + (savings + eventIncomeNow) * outsideHalf;
      const outsideGrowth = outside - startOutside - savings - eventIncomeNow;

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
          : taxables.reduce(
              (s, tx) =>
                s +
                Math.max(0, residentIncomeTax(tx + outsidePerAccum) - residentIncomeTax(tx)) +
                (medicareLevy(tx + outsidePerAccum) - medicareLevy(tx)), // 2% levy on the dividend income too
              0,
            );
      outside -= accumOutsideTax;

      // A property whose sale age falls in the WORKING years is sold then — its
      // proceeds (value less loan and CGT) land in savings — rather than the sale
      // being deferred to retirement. Proceeds are NOT floored: an underwater sale's
      // shortfall reduces savings. CGT splits across co-owners, standalone (no Age
      // Pension in the working years, so the 30% indexed minimum binds).
      let accumPropertyProceeds = 0;
      let accumPropertyCgt = 0;
      properties.forEach((prop, pi) => {
        if (sold[pi] || prop.strategy !== "sell" || oldest < prop.sellAtAge) return;
        const value = propertyValueAt(prop, t);
        const cgtPaid = capitalGainsTax(
          prop,
          value,
          { regime: cgtRegime, discountPct: config.outsideTax?.cgtDiscountPct ?? 50, minRatePct: config.outsideTax?.cgtMinRatePct ?? 30, onAgePension: false },
          plan.people.length,
        );
        const loanReal = prop.loanBalance / Math.pow(1 + plan.inflation / 100, t); // nominal IO loan → today's $
        const proceeds = value - loanReal - cgtPaid;
        addCpiRealOutside(proceeds, t); // CPI-real sale proceeds → basis-corrected before the boundary
        // Report the proceeds on the same (wage-real) basis as this accumulation-year
        // pool so the net-worth bridge reconciles; the boundary rebase restores CPI-real.
        accumPropertyProceeds += proceeds / boundaryRebase;
        accumPropertyCgt += cgtPaid;
        sold[pi] = true;
      });

      // Held investment-property equity (value − loan) for the net-worth view. A
      // sold property drops out (its equity became savings above). The engine
      // otherwise only needs this in retirement (the means test), but the net-worth
      // band spans the whole timeline, so we compute it here too.
      const accumPropDeflator = Math.pow(1 + plan.inflation / 100, t); // deflate the nominal IO loan to today's $
      const accumPropertyEquity = properties.reduce((s, prop, pi) => s + (sold[pi] ? 0 : netEquity({ ...prop, loanBalance: prop.loanBalance / accumPropDeflator }, propertyValueAt(prop, t))), 0);
      // Net rent the properties throw off during the working years too (positive
      // income, or a negative cash drain for a geared property) — surfaced on the
      // income chart alongside take-home pay. Like salary take-home it's disposable
      // income, not auto-saved, so it doesn't itself move the balance.
      const accumRentCash = properties.reduce((s, prop, pi) => s + (sold[pi] ? 0 : netRentCash({ ...prop, loanBalance: prop.loanBalance / accumPropDeflator }, propertyValueAt(prop, t))), 0);
      // Income tax on that rent, marginal, stacked on each owner's taxable salary and
      // split equally across the household. A rental LOSS reduces income tax — this is
      // negative gearing (the working-years benefit). NEGATIVE rentTax = a tax saving.
      const accumRentPer = accumRentCash / Math.max(1, plan.people.length);
      const accumRentTax =
        accumRentCash === 0
          ? 0
          : taxables.reduce(
              (s, tx) =>
                s +
                (residentIncomeTax(tx + accumRentPer) - residentIncomeTax(tx)) +
                (medicareLevy(tx + accumRentPer) - medicareLevy(tx)), // levy tracks net rent (a loss reduces it — negative gearing)
              0,
            );
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
      // Life events (working years): a windfall lands in savings untaxed (added with
      // half-year growth above); a one-off expense is drawn from savings — super is
      // preserved and can't fund it — so it's floored at what the outside pool holds
      // (an unaffordable expense just empties it).
      const eventExpensePaid = Math.min(eventExpenseNow, Math.max(0, outside));
      outside -= eventExpensePaid;
      // Living costs funded from savings during a career break (summed if both
      // partners are off at once), floored at what the outside pool actually holds
      // (super is preserved, so it can't fund a break).
      const breakSpend = careerBreaks.reduce(
        (s, b) => s + (ages[b.who] >= b.atAge && ages[b.who] < b.atAge + b.years ? b.spendFromSavings : 0),
        0,
      );
      const careerBreakDraw = Math.min(breakSpend, Math.max(0, outside));
      outside -= careerBreakDraw;

      // Debt recycling (working years): a geared share sleeve funded by a deductible
      // investment loan, redrawn against the home loan. Each recycling year we borrow
      // `perYear` (→ loan) and buy that in shares (→ outside pool, grown half a year
      // like savings); interest on the opening loan is DEDUCTIBLE against work income
      // (like a negatively-geared property), and the tax it saves is reinvested — the
      // recycling accelerator. Needs a live home loan to recycle against. The loan is
      // netted out of net worth (below) and repaid from the pool at retirement.
      let drInterest = 0;
      let drTaxSaving = 0;
      if (
        drCfg &&
        anyoneWorking &&
        mortgage &&
        !mortgageCleared &&
        mortgageActiveAtAge(mortgage, oldest, t) &&
        oldest < drCfg.untilAge &&
        drCfg.perYear > 0
      ) {
        // Real interest cost: the loan rate is nominal, but the balance is in today's
        // dollars — so deflate it (as the mortgage does) or we'd charge ~inflation too
        // much and wipe out the leverage spread. `deflator` is wage inflation here.
        const drRateReal = realRate(drCfg.loanRatePct, deflator);
        drInterest = drStart * drRateReal; // real interest on the opening loan balance
        if (drInterest > 0) {
          const per = drInterest / Math.max(1, plan.people.length);
          drTaxSaving = taxables.reduce(
            (s, tx) => s + Math.max(0, residentIncomeTax(tx) - residentIncomeTax(Math.max(0, tx - per))),
            0,
          );
        }
        outside += drCfg.perYear * outsideHalf; // borrowed funds, invested mid-year
        drLoan += drCfg.perYear;
        // Service the loan from the recycling surplus: pay the interest, then reinvest
        // the tax refund the deduction generates. Net cost = interest − refund, so the
        // sleeve's net equity grows at (return − AFTER-TAX loan cost) — leverage helps
        // when returns beat the after-tax rate and hurts when they don't (the stress case).
        outside -= drInterest;
        outside += drTaxSaving;
      }

      rows.push(
        row(oldest, startSuper, startOutside - drStart, 0, 0, 0, 0, "accumulation", true, accumRentCash, accumPropertyEquity, {
          openingSuper: startSuper,
          openingOutside: startOutside - drStart,
          closingSuper: totalSuper(),
          closingOutside: outside - drLoan,
          investmentLoan: drLoan,
          drInterest,
          drTaxSaving,
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
          incomeTax: Math.max(0, accumTaxDetail.reduce((s, d) => s + d.incomeTax, 0) - drTaxSaving),
          medicare,
          capitalGains: 0,
          taxDetail: accumTaxDetail,
          agePension: 0,
          pension: null,
          rentIncome: accumRentCash,
          rentTax: accumRentTax,
          rentSaved,
          careerBreakDraw,
          eventIncome: eventIncomeNow,
          eventExpense: eventExpensePaid,
          onBreak: plan.people.some((_, i) => onBreak(i)), // any member on a gap year → charts shade it

          minDrawdown: 0,
          minDrawdownParts: [],
          livingSpend: 0,
          rentCost: 0,
          mortgageCost: 0,
          mortgageCleared: 0,
          lumpSum: 0,
          recontribution: 0,
          propertyProceeds: accumPropertyProceeds,
          propertyCgt: accumPropertyCgt,
          homeProceeds: 0,
          homeProceedsToSuper: 0,
          homeValue: homeValueThisYear,
          homeEquity: homeEquityThisYear,
        }),
      );
      continue;
    }

    // --- Retirement year (at least one person has retired) ---
    // Debt recycling can KEEP GOING through a staggered-retirement gap: the household
    // "retires" when the FIRST partner does, but while the other still earns a salary
    // (and the home loan is live and we're under `untilAge`) the recycling continues,
    // deducting against that salary. Only once no one's earning do we unwind.
    const drRecycling =
      !!drCfg &&
      drCfg.perYear > 0 &&
      !!mortgage &&
      !mortgageCleared &&
      mortgageActiveAtAge(mortgage, oldest, t) &&
      oldest < drCfg.untilAge &&
      plan.people.some((_, i) => t < retireOffsets[i] && !onBreak(i));
    // Unwind the geared sleeve once recycling has finished — repay the investment loan
    // from the (now un-geared) savings pool. A bad market run can leave residual debt
    // that keeps dragging net worth (the leverage downside the MC / stress views
    // surface). Pre-retirement gains are untaxed (CGT basis resets here) → no CGT.
    if (drLoan > 0 && !drRecycling) {
      const repay = Math.min(Math.max(0, outside), drLoan);
      outside -= repay;
      drLoan -= repay;
    }
    if (t === earliestOffset) {
      superAtRetirement = startSuper;
      totalAtRetirement = startSuper + startOutside - drStart;
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
      const r = contribute(person, accum[i], gapScale, i === 0 && ages[i] >= preservationAge && !brk, ages[i] >= pensionAge);
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
    // OPT-OUT (keepSuperInAccumulation): a member kept in accumulation skips the
    // transfer — earnings stay taxed 15%, but no mandatory minimum drawdown forces
    // money into taxable savings, and (while UNDER Age-Pension age) the balance is
    // exempt from the means test. With mode "untilPensionAge" they still convert once
    // they reach Age-Pension age — when the exemption ends and tax-free pension
    // earnings become the better deal; "forever" keeps them in accumulation for life.
    // keepAccum null → every member transfers as before.
    accessibleIdx.forEach((i) => {
      if (transferred[i]) return;
      const keep = !!keepAccum && keepAccum.who.has(i) && (keepAccum.mode === "forever" || ages[i] < pensionAge);
      if (keep) return; // stays in accumulation this year (may convert at pension age)
      const toPension = Math.min(accum[i], config.transferBalanceCap);
      // A preserved balance unlocking AFTER the household retired (an early retiree
      // turning 60, or a kept-in-accumulation member converting at Age-Pension age)
      // flips the accumulation band to pension mid-retirement — flag the FIRST such
      // age so the chart can explain it.
      if (toPension > 1) {
        // Singular (StressChart): first flip after the HOUSEHOLD retired.
        if (t > earliestOffset && superUnlockAge === null) {
          superUnlockAge = oldest;
          superUnlockIsPartner = i > 0;
        }
        // Per-person: flag only when THIS member's flip is distinct from their own
        // retirement (they retired before preservation age, or a keep-accum member
        // converting later) — else it just coincides with their Retire marker.
        if (t > retireOffsets[i] && superUnlockAges[i] === null) superUnlockAges[i] = oldest;
      }
      pension[i] += toPension;
      accum[i] -= toPension;
      transferred[i] = true;
    });

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
      t >= retireOffsets[0] && // person 0 has actually retired — recontribution is a
      // retiree tax-shelter move; firing it while they're still working (a staggered
      // gap) would double their NCC (cap breach) and shift assessed savings into
      // still-accumulating, means-test-exempt super.
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
    if (mortgage && !mortgageCleared && isHomeowner && mortgageActiveAtAge(mortgage, oldest, t)) {
      // Cap a P&I loan's final-year repayment at what actually clears it (balance +
      // one year's interest), so the household never pays more than it owes — the
      // stored payoff age would otherwise charge a full repayment in the last year.
      const nominalRepay = mortgageAnnualCost(mortgage);
      const owedNominal =
        mortgage.type === "principal_interest"
          ? Math.min(nominalRepay, outstandingBalance(mortgage, t) * (1 + mortgage.interestRate / 100))
          : nominalRepay;
      mortgageCost = owedNominal / Math.pow(1 + plan.inflation / 100, t);
    }
    // Rent once sold up (today's-dollars flat, like living costs), itemised
    // separately so the ledger can show it as its own line.
    const rentExpense = sellRent != null && oldest >= sellRent.atAge ? Math.max(0, sellRent.rentPerYear) : 0;
    const smileBase = spendingForAge(plan, oldest); // this age's go-go/slow-go/no-go level
    let livingSpend = smileBase;
    // Guardrails: flex the CURRENT smile level by the carried market factor. The
    // first retired year anchors the rail base; later years keep declining with the
    // smile while guardFactor rides the market. Floored per-age at essentials (capped
    // at the smile) or floorPct% of THIS age's smile spend, so the floor tracks the
    // smile down rather than being pinned to the go-go peak.
    if (guardrails) {
      if (guardAnchorBase == null) guardAnchorBase = smileBase;
      const floor = Math.max(Math.min(guardEssentials, smileBase), guardFloorPct * smileBase);
      livingSpend = Math.max(smileBase * guardFactor, floor);
    }
    // A one-off life-event expense this year is added to what must be funded (an
    // extra draw). It's deliberately kept OUT of the guardrails rail measure below
    // (which uses guardAnchorBase, not `spending`), so a single big expense doesn't
    // read as a permanently higher withdrawal rate and trigger spurious cuts.
    const spending = livingSpend + rentExpense + mortgageCost + eventExpenseNow;

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
      // The secured loan is a nominal balance; the value is in today's dollars, so
      // deflate the loan to the same basis (mirrors the home loanBalReal) or its real
      // burden would never erode — over-stating the debt against net equity + net rent.
      const propReal = { ...prop, loanBalance: prop.loanBalance / Math.pow(1 + plan.inflation / 100, t) };
      if (prop.strategy === "sell" && oldest >= prop.sellAtAge) {
        // The Age Pension exemption from the 30% minimum uses the PRIOR year's
        // receipt (this year's pension is worked out after the sale, below).
        const cgtRules = {
          regime: cgtRegime,
          discountPct: config.outsideTax?.cgtDiscountPct ?? 50,
          minRatePct: config.outsideTax?.cgtMinRatePct ?? 30,
          onAgePension: rows.length > 0 && rows[rows.length - 1].agePension > 0,
        };
        // Split the gain across co-owners (household size). Proceeds are NOT floored
        // at $0: an underwater sale (loan > value) leaves a shortfall that must be
        // repaid from savings, so it reduces `outside` rather than silently vanishing.
        const cgtPaid = capitalGainsTax(prop, value, cgtRules, plan.people.length);
        const proceeds = value - propReal.loanBalance - cgtPaid;
        propertyProceeds += proceeds;
        propertyCgt += cgtPaid;
        outside += proceeds;
        sold[pi] = true;
      } else {
        const eq = netEquity(propReal, value);
        rentCash += netRentCash(propReal, value);
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
    // Part-time work income is taxed per person's share; a below-pension-age worker
    // also owes the 2% Medicare levy on it (as a salary would — taxAtAge/senior tax
    // omit the levy). Pension-age (SAPTO) workers are generally levy-exempt on low
    // income, so we leave theirs out.
    const workTax = grossWork > 0
      ? ages.reduce((s, a) => s + taxAtAge(grossWork / workers, a) + (a < pensionAge ? medicareLevy(grossWork / workers) : 0), 0)
      : 0;
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
      // Super assessed by the means test, per Services Australia:
      //   • from Age Pension age → ALL of that member's super (accumulation AND
      //     pension phase), whether they've retired or are still working;
      //   • under Age Pension age → only super that's in PENSION phase (an
      //     account-based income stream has begun). Accumulation-phase super — a
      //     still-working balance, a keepSuperInAccumulation retiree, or the excess
      //     above the Transfer Balance Cap — stays exempt until pension age.
      // (accessibleSuper drives DRAWDOWN eligibility and is left untouched.)
      const assessedSuper = plan.people.reduce(
        (s, _p, i) => s + (ages[i] >= pensionAge ? superOf(i) : pension[i]),
        0,
      );
      // Floor the outside pool at 0 for the means test: an underwater property sale
      // can leave it negative, but unsecured debt isn't deductible from assessable
      // assets (the property's own loan is already netted via propertyEquity), so a
      // shortfall shouldn't understate assets and inflate the pension.
      const financialAssets = Math.max(0, outside) + assessedSuper;
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
      const coupleHalf = plan.household === "couple" && pensionEligible < 2 ? 0.5 : 1;
      agePensionAmt = ap.annual * coupleHalf;
      pensionBreakdown = {
        outsideAssets: outside,
        accessibleSuper: assessedSuper,
        propertyEquity,
        propertyParts,
        assessableAssets: financialAssets + propertyEquity,
        financialAssets,
        deemedIncome: deemedIncome(financialAssets, plan.household, config),
        otherIncome: assessableOther,
        // The modal's per-test annual figures must reflect the SAME member-of-a-couple
        // rate the household is actually paid, or a gap-year pension breakdown would
        // show the full couple amount while only half is received.
        assetsTestAnnual: ap.assetsTestAnnual * coupleHalf,
        incomeTestAnnual: ap.incomeTestAnnual * coupleHalf,
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
    // Staggered gap: a partner still earning has their take-home ALREADY credited
    // against spending (in externalIncome above), and any genuine surplus is banked on
    // the line just above — so we do NOT also add annualOutsideSavings here (that would
    // be unfunded double-counting; accumulation credits neither take-home nor spending,
    // so its savings stream is real there, but the gap credits both). Singles / same-age
    // couples never reach the gap, so they're unaffected.
    // Debt recycling through the staggered gap: borrow `perYear` (→ loan), buy that in
    // shares (→ pool), and deduct the (real) interest against the STILL-WORKING
    // partner's salary — the refund reinvested. Same mechanic as the accumulation
    // sleeve; deflator is CPI here (post-household-retirement). Unwound once recycling
    // ends (above). Only fires for staggered couples; singles/same-age are unaffected.
    let drInterestRet = 0;
    let drTaxSavingRet = 0;
    if (drRecycling) {
      const drRateReal = realRate(drCfg!.loanRatePct, cpi);
      drInterestRet = drStart * drRateReal;
      const earners = plan.people
        .map((p, i) => ({ tx: t < retireOffsets[i] && !onBreak(i) ? p.salary * gapScale : 0, age: ages[i] }))
        .filter((e) => e.tx > 0);
      if (drInterestRet > 0 && earners.length) {
        const per = drInterestRet / earners.length;
        drTaxSavingRet = earners.reduce(
          (s, e) => s + Math.max(0, taxAtAge(e.tx, e.age) - taxAtAge(Math.max(0, e.tx - per), e.age)),
          0,
        );
      }
      const half = Math.pow(1 + realReturn, 0.5);
      outside += drCfg!.perYear * half; // borrowed funds, invested mid-year
      drLoan += drCfg!.perYear;
      outside -= drInterestRet; // service the interest from the recycling surplus
      outside += drTaxSavingRet; // reinvest the deduction's tax refund
    }
    // A life-event windfall lands in savings, available to fund this year's draw
    // (so it offsets what's taken from super) with any excess left in the pool.
    outside += eventIncomeNow;

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
    // Measure the rate on the SMILE-NEUTRAL draw: the anchor-year smile level ×
    // factor (plus fixed housing costs), net of income. Using the anchor base instead
    // of THIS year's declining smile means the smile's own step-downs don't register as
    // a falling withdrawal rate (which would wrongly trigger raises) — only real market
    // over/under-performance moves the rate. It ALSO excludes one-off life-event
    // expenses, so a cash shock in an otherwise income-covered year can't be read as a
    // low rate. GATE on this smile-neutral need (NOT privateNeed, which includes the
    // event) — else an event opens the rails while the rate reads 0 and fires a
    // spurious, self-compounding RAISE. For a flat plan this equals the old privateNeed.
    const normNeed =
      guardAnchorBase != null
        ? Math.max(0, guardAnchorBase * guardFactor + rentExpense + mortgageCost - externalIncome)
        : 0;
    if (guardrails && guardAnchorBase != null && normNeed > EPS) {
      const portfolio = startSuper + startOutside;
      // A depleted portfolio means the draw rate is effectively infinite (drawing
      // from nothing) — that must read as ABOVE the upper rail, never a "0%".
      const rate = portfolio > EPS ? normNeed / portfolio : Infinity;
      const factorFloor = Math.max(Math.min(guardEssentials, smileBase), guardFloorPct * smileBase) / Math.max(1, smileBase);
      if (guardWr0 == null) {
        // Don't anchor the reference rate while a still-working partner's salary is
        // masking the true draw (staggered retirement): the household "retires" when
        // the FIRST partner does, but until the other stops earning, privateNeed is a
        // fraction of the real post-retirement draw — anchoring there pegs the rails
        // far too low and strands spending at the floor for decades. Wait for the
        // first year the household actually funds the full spend itself.
        if (workTakeHome <= EPS) guardWr0 = Number.isFinite(rate) ? rate : 0;
      } else if (rate > guardWr0 * (1 + guardWidth) && guardFactor > factorFloor + 1e-9) {
        guardFactor = Math.max(factorFloor, guardFactor * (1 - guardStep)); // pay cut
      } else if (Number.isFinite(rate) && rate < guardWr0 * (1 - guardWidth)) {
        guardFactor *= 1 + guardStep; // raise
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
    // A life-event windfall arrived mid-year, so its retained portion earns only ~half
    // a year's return — weight it at half in the growth base (it took a full year
    // before, inconsistent with the accumulation phase). The opening pool earns a full
    // year as usual.
    const eventRetained = Math.min(Math.max(0, eventIncomeNow), Math.max(0, outside));
    const growthBase = Math.max(0, outside - 0.5 * eventRetained);
    const outsideGrowth = growthBase * realReturn;
    // Split the year's return into an income yield (dividends — realised, taxed now)
    // and capital growth (unrealised — deferred until units are sold). The whole
    // return still compounds into the balance; only the tax treatment differs.
    const outsideIncome = Math.max(0, growthBase * outsideIncomeYield);
    unrealizedGain += outsideGrowth - outsideIncome; // capital growth accrues untaxed
    outside += outsideGrowth;

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
    let outsideMedicare = 0; // 2% levy on retiree investment income above the (senior) threshold
    let superTaxDraw = 0; // super drawn to settle that tax when the outside pool emptied
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
        // 2% Medicare levy on the investment income (net rent + dividends) above the
        // person's employment — with the higher senior threshold once they reach Age
        // Pension age. Employment's own levy is already deducted (contribute()/workTax),
        // so subtract it out to avoid double-counting.
        const senr = ages[i] >= pensionAge;
        outsideMedicare += medicareLevy(rentPer + incPer + Math.max(0, workPer), senr) - medicareLevy(Math.max(0, workPer), senr);
        // Capital gain: stacked on top of employment + net rent + dividends.
        if (gainPer > 0) {
          const base = ordBase + incPer;
          if (cgtRegime === "discount") {
            outsideCgtTax += Math.max(0, taxAtAge(base + cgtDiscount * gainPer, ages[i]) - taxAtAge(base, ages[i]));
          } else {
            const marginal = Math.max(0, taxAtAge(base + gainPer, ages[i]) - taxAtAge(base, ages[i]));
            // The 30%-minimum waiver is for actual Age Pension RECIPIENTS — a partner
            // under pension age (not a recipient) still faces the floor on their share.
            outsideCgtTax += onAgePension && ages[i] >= pensionAge ? marginal : Math.max(marginal, cgtMinRate * gainPer);
          }
        }
      });
      outsideTax = outsideDivTax + outsideCgtTax + Math.max(0, outsideMedicare);
      // The tax on this year's realised gains + dividends is a real liability. Pay it
      // from the outside pool first; if that pool was drawn to $0 to fund spending, take
      // the shortfall from super — drawing more is what a real household must do to
      // settle the ATO bill — so the deducted tax matches what the tax analysis reports
      // (previously the CGT on a pool-emptying draw was silently waived, understating
      // lifetime tax and over-stating success). The super reduction is captured by the
      // "Tax on savings" waterfall line, so superDrawn stays the spending figure.
      const fromPool = Math.min(outsideTax, Math.max(0, outside));
      outside -= fromPool;
      let unpaid = outsideTax - fromPool;
      if (unpaid > EPS) {
        const drawn = drawSuper(accessibleIdx, unpaid);
        superTaxDraw = drawn.accum + drawn.pension;
        unpaid -= superTaxDraw;
      }
      // If super is inaccessible/empty too (a bridge-year corner where the household is
      // already failing), the residual is genuinely unpayable this year — record only
      // what was actually settled so the ledger and the tax modal still agree.
      if (unpaid > EPS && outsideTax > EPS) {
        const f = (outsideTax - unpaid) / outsideTax;
        outsideDivTax *= f;
        outsideCgtTax *= f;
        outsideTax -= unpaid;
      }
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
        onAgePensionRet && ages[i] >= pensionAge, // waiver only for actual recipients
      ),
    );

    const phase: Phase =
      oldest >= pensionAge
        ? "pension"
        : ages.every((a) => a < preservationAge)
          ? "bridge"
          : "drawdown";

    rows.push(
      row(oldest, startSuper, startOutside - drStart, agePensionAmt, fromSuper, outsideDrawn, spending, phase, funded, rentCash, propertyEquity, {
        openingSuper: startSuper,
        openingOutside: startOutside - drStart,
        closingSuper: totalSuper(),
        closingOutside: outside - drLoan,
        investmentLoan: drLoan,
        drInterest: drInterestRet,
        drTaxSaving: drTaxSavingRet,
        pensionSuper: openPension,
        accumSuper: openAccum,
        accumDrawn,
        pensionExtraDrawn,
        superTaxDraw,
        contribGross: workContribGross,
        contribTax: workContribTax,
        contribNet: workContribNet,
        savings: 0, // no separate savings stream in retirement — a gap-year surplus is the "income kept in savings" funding line
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
        eventIncome: eventIncomeNow,
        eventExpense: eventExpenseNow,
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

  // A plan only "lasts to life expectancy" if it actually modelled retirement years
  // reaching that age — guard degenerate inputs (lifeExpectancy <= retirementAge, or
  // NaN ages producing zero/empty rows) that would otherwise report success while
  // simulating no retirement at all.
  const modelledRetirement = rows.some((r) => r.phase !== "accumulation");

  return {
    rows,
    retirementAge: plan.retirementAge,
    partnerRetirementAge: hasStaggeredRetirement(plan) ? personRetirementAge(plan, 1) : null,
    superUnlockAge,
    superUnlockIsPartner,
    superUnlockAges,
    agePensionAge: pensionAge,
    superAtRetirement,
    totalAtRetirement,
    depletedAge,
    lastsToLifeExpectancy: depletedAge === null && modelledRetirement,
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
