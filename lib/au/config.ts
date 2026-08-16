// The full set of reference data / configuration the engine runs on.
//
// This used to live as scattered constants; it is now a single typed object so it
// can be stored per financial year in the database, edited in the admin backoffice,
// versioned, and audited. DEFAULT_CONFIG below is the FY2026-27 seed — the values
// the database is initially populated with. The running engine reads the ACTIVE
// version loaded from the DB (falling back to DEFAULT_CONFIG).
//
// Sources: ATO, Services Australia, MoneySmart (ASIC), ASFA. Indexed each 1 July.

export interface MinDrawdownBand {
  minAge: number;
  rate: number;
}

/** A single/couple pair of annual dollar figures. */
export interface HouseholdPair {
  single: number;
  couple: number;
}

/**
 * Per-category ASFA budget figures (annual $, homeowner, aged 65–84), used to
 * pre-fill the guided budget builder. Only the numbers live here (versioned +
 * verifiable); the presentation metadata (label, essential/discretionary, sub-
 * items, input type) lives in code — see lib/au/budget.ts BUDGET_CATEGORY_META.
 * `key` is the join key between the two.
 */
export interface BudgetCategoryFigures {
  key: string;
  modest: HouseholdPair;
  comfortable: HouseholdPair;
}

export interface AsfaBreakdown {
  categories: BudgetCategoryFigures[];
  // Rent (net of Rent Assistance) replaces the owner-Housing default for renters.
  renterHousing: { modest: HouseholdPair; comfortable: HouseholdPair };
  // "Premium" has no ASFA equivalent — derived by uplifting Comfortable.
  premiumUplift: { essential: number; discretionary: number };
  // Retirement "spending smile": essentials stay flat while discretionary spend
  // declines through the slow-go / no-go phases. Multipliers apply to the
  // discretionary portion of the go-go budget to seed spendingStages.
  smile: {
    slowGoDiscretionary: number;
    noGoDiscretionary: number;
    slowGoAge: number;
    noGoAge: number;
  };
}

export interface AgePensionSide {
  maxAnnual: number;
  incomeFreeAreaAnnual: number;
  assetsFreeArea: { homeowner: number; nonHomeowner: number };
}

/**
 * Super fees & premiums, deducted per member account each year (like Moneysmart).
 * The percentage reduces the investment return; the fixed and insurance amounts
 * are dollar deductions (insurance only while working).
 */
export interface SuperFees {
  adminInvestmentPct: number; // combined admin + investment fee, % of balance p.a.
  fixedAdminAnnual: number; // fixed $ member fee per account per year
  insuranceAnnual: number; // default insurance premium per account per year (accumulation only)
}

export interface EngineConfig {
  financialYear: string;

  // Superannuation
  sgRate: number;
  concessionalCap: number;
  nonConcessionalCap: number;
  contributionsTax: number;
  superEarningsTaxAccumulation: number;
  transferBalanceCap: number;
  totalSuperBalanceNccThreshold: number;
  div293Threshold: number; // income (incl. concessional) above which Division 293 applies
  div293ExtraTaxRate: number; // extra contributions tax for high earners (15%)

  // Ages
  preservationAge: number;
  agePensionAge: number;

  // Economic assumptions (ASIC RG 276 two-stage deflation to today's dollars).
  // Pre-retirement amounts are deflated by WAGE inflation = the plan's CPI
  // inflation + this rise-in-community-living-standards component; retirement
  // amounts are deflated by CPI alone. Default 1.2% (CPI 2.5% ⇒ wage 3.7%).
  livingStandardsGrowthPct: number;

  // Super fees & premiums (Moneysmart-style), deducted per account each year
  fees: SuperFees;

  // Outside-super (personal/brokerage) taxation. An equity return is split into an
  // income yield (dividends/distributions — taxed each year at marginal rates) and
  // capital growth (UNREALISED — taxed only when units are sold to fund spending,
  // with the 50% CGT discount for assets held >12 months). Deferring the growth and
  // discounting the realised gain is far more accurate than taxing the whole return
  // as ordinary income every year (which badly over-taxes an equity portfolio).
  outsideTax: {
    incomeYieldPct: number; // dividend/distribution yield as % of value (real terms)
    cgtDiscountPct: number; // OLD-law capital-gains discount on realised gains (50); used when cgtRegime = "discount"
    // How realised capital gains are taxed. "indexed" = the post-1 July 2027 reform:
    // the 50% discount is gone; because the model is in today's dollars the tracked
    // gain is already the CPI-indexed REAL gain, so the whole real gain is taxable at
    // the marginal rate, with a `cgtMinRatePct` minimum (Age Pension recipients are
    // exempt from that minimum). "discount" = the pre-2027 law (50% discount, marginal).
    cgtRegime: "indexed" | "discount";
    cgtMinRatePct: number; // minimum tax rate on real gains under the indexed regime (30)
  };

  // Monte Carlo return model (lib/au/historicalReturns.ts). "gaussian" draws each
  // year independently from mean/vol; "bootstrap" resamples contiguous blocks of
  // real historical returns (preserving mean-reversion / volatility clustering).
  // Admin-configurable; runMonteCarlo reads these unless a call overrides them.
  returnModel: "gaussian" | "bootstrap";
  bootstrapBlockYears: number;

  // Minimum account-based pension drawdown, by age band
  minDrawdownBands: MinDrawdownBand[];

  // Age Pension
  agePension: {
    single: AgePensionSide;
    couple: AgePensionSide; // combined
    incomeTaperPerDollar: number;
    assetsTaperPerDollar: number;
  };

  // Deeming (income test)
  deeming: {
    lowerRate: number;
    upperRate: number;
    threshold: { single: number; couple: number };
    needsVerification: boolean;
  };

  // ASFA Retirement Standard (reference benchmarks)
  asfa: {
    comfortable: { single: number; couple: number };
    modest: { single: number; couple: number };
    lumpSum: {
      comfortable: { single: number; couple: number };
      modest: { single: number; couple: number };
    };
    // Per-category breakdown that pre-fills the guided budget builder.
    breakdown: AsfaBreakdown;
  };

  // Super death-benefit tax: paid on the TAXABLE component of super left at death
  // when it goes to a NON-dependant (adult children). Tax-free to a tax dependant
  // (spouse). Verify at build (indexed).
  superDeathBenefit: {
    taxedElementRatePct: number; // 15% on the taxed element (the usual taxable component)
    untaxedElementRatePct: number; // 30% on any untaxed element (insurance/some public-sector) — v2
    medicareLevyPct: number; // + 2% Medicare
  };

  // Aged care (post-1 Nov 2025 Aged Care Act; figures are a 2026 vintage and are
  // indexed — re-verify at build). Residential fees = a non-means-tested basic
  // daily fee + a means-tested hotelling contribution (no cap) + a means-tested
  // non-clinical care contribution (NCCC, capped) + accommodation (RAD lump sum
  // or DAP daily). v1 approximates the statutory means test with a transparent
  // 0–1 means score (see lib/au/agedCare.ts). See docs/aged-care-module-v1-spec.md.
  agedCare: AgedCareConfig;
}

export interface AgedCareConfig {
  vintage: string;
  basicDailyFee: number; // not means-tested (≈85% of the single pension)
  hotellingMaxDaily: number; // means-tested, no annual/lifetime cap
  ncccMaxDaily: number; // means-tested non-clinical care contribution
  ncccLifetimeCap: number; // NCCC lifetime $ cap
  ncccMaxYears: number; // NCCC also stops after this many years (whichever first)
  mpir: number; // Maximum Permissible Interest Rate for DAP (annual fraction)
  radNationalAvg: number; // default RAD price (today's $)
  radRetentionPctPerYear: number; // provider may retain this % of the RAD per year
  radRetentionMaxYears: number; // for at most this many years
  homeValueCapMeansTest: number; // former home assessed up to this cap for aged-care means testing
  formerHomeRentYieldNet: number; // net rental yield (fraction of value) if a kept former home is rented out
  residentialLivingRetainedPct: number; // fraction of normal living spend still paid personally in residential care (the rest — housing, meals, utilities — is covered by the fees)
  // v1 means-score inputs: score = max(assetScore, incomeScore), each a clamped
  // linear ramp between its free area and full-contribution point. Self-funded
  // retirees land near 1 (max contributions); low-asset/low-income pensioners near 0.
  careAssetFreeArea: number; // assets at/below → 0 asset score
  careAssetFullArea: number; // assets at/above → asset score 1 (max hotelling/NCCC)
  careIncomeFreeArea: number; // annual income at/below → 0 income score
  careIncomeFullArea: number; // annual income at/above → income score 1
  // Planning base rates for the probabilistic framing (verify vs AIHW GEN data).
  entryProbability: number; // lifetime chance of entering permanent residential care
  medianEntryAge: number;
  medianDurationYears: number;
  homeCareAnnualEstimate: number; // simplified Support-at-Home out-of-pocket estimate (v1 home-care option)
}

const FN = 26; // fortnights per year

export const DEFAULT_CONFIG: EngineConfig = {
  financialYear: "2026-27",

  sgRate: 0.12,
  concessionalCap: 32_500,
  nonConcessionalCap: 130_000,
  contributionsTax: 0.15,
  superEarningsTaxAccumulation: 0.15,
  transferBalanceCap: 2_100_000,
  totalSuperBalanceNccThreshold: 2_100_000,
  div293Threshold: 250_000,
  div293ExtraTaxRate: 0.15,

  preservationAge: 60,
  agePensionAge: 67,

  // ASIC RG 276 default: 1.2% rise in living standards above CPI (CPI 2.5% ⇒
  // pre-retirement wage inflation of 3.7%).
  livingStandardsGrowthPct: 1.2,

  // Super fees — indicative Moneysmart-style defaults; tune to the current
  // Moneysmart figures (APRA-based, updated quarterly). Insurance defaults off
  // as it's highly individual.
  fees: {
    adminInvestmentPct: 0.85,
    fixedAdminAnnual: 74,
    insuranceAnnual: 0,
  },

  outsideTax: {
    incomeYieldPct: 2.5, // ~broad-market dividend yield (global/AU blend, real)
    cgtDiscountPct: 50, // pre-2027 ATO 50% discount (assets held > 12 months); used only when cgtRegime = "discount"
    cgtRegime: "indexed", // default to the post-1 July 2027 reform (indexation + 30% minimum)
    cgtMinRatePct: 30, // minimum tax on real gains under the reform (Age Pension recipients exempt)
  },

  returnModel: "bootstrap",
  bootstrapBlockYears: 10,

  minDrawdownBands: [
    { minAge: 0, rate: 0.04 },
    { minAge: 65, rate: 0.05 },
    { minAge: 75, rate: 0.06 },
    { minAge: 80, rate: 0.07 },
    { minAge: 85, rate: 0.09 },
    { minAge: 90, rate: 0.11 },
    { minAge: 95, rate: 0.14 },
  ],

  agePension: {
    single: {
      maxAnnual: 1200.9 * FN,
      incomeFreeAreaAnnual: 226 * FN,
      assetsFreeArea: { homeowner: 333_000, nonHomeowner: 600_000 },
    },
    couple: {
      maxAnnual: 1810.4 * FN,
      incomeFreeAreaAnnual: 396 * FN,
      assetsFreeArea: { homeowner: 499_000, nonHomeowner: 766_000 },
    },
    incomeTaperPerDollar: 0.5,
    assetsTaperPerDollar: (3 * FN) / 1000, // $3/fn per $1,000 = 0.078/$
  },

  deeming: {
    // Verified against Services Australia (1 Jul 2026). The five-year 0.25%/2.25%
    // freeze ended 19 Sep 2025; rates are now 1.25% / 3.25%.
    lowerRate: 0.0125,
    upperRate: 0.0325,
    threshold: { single: 66_800, couple: 110_600 },
    needsVerification: false,
  },

  asfa: {
    comfortable: { single: 54_840, couple: 77_375 },
    modest: { single: 35_503, couple: 51_299 },
    lumpSum: {
      comfortable: { single: 630_000, couple: 730_000 },
      modest: { single: 110_000, couple: 120_000 },
    },
    // Per-category annual $ (homeowner, aged 65–84), derived from the ASFA
    // Retirement Standard detailed budget (Dec 2025 quarter, weekly × 52).
    // Each tier's categories sum to within ~0.4% of the headline totals above.
    breakdown: {
      categories: [
        // Essentials
        { key: "housing", modest: { single: 6_830, couple: 7_720 }, comfortable: { single: 8_030, couple: 8_385 } },
        { key: "energy", modest: { single: 2_080, couple: 2_795 }, comfortable: { single: 2_640, couple: 3_270 } },
        { key: "food", modest: { single: 6_100, couple: 11_300 }, comfortable: { single: 7_880, couple: 13_700 } },
        { key: "health", modest: { single: 3_080, couple: 5_970 }, comfortable: { single: 6_260, couple: 11_720 } },
        { key: "transport", modest: { single: 5_730, couple: 6_100 }, comfortable: { single: 9_380, couple: 10_150 } },
        { key: "household", modest: { single: 4_950, couple: 7_000 }, comfortable: { single: 8_030, couple: 11_120 } },
        // Discretionary
        { key: "leisure", modest: { single: 4_270, couple: 6_560 }, comfortable: { single: 7_550, couple: 11_230 } },
        { key: "travel", modest: { single: 2_320, couple: 3_660 }, comfortable: { single: 4_870, couple: 7_500 } },
      ],
      // ASFA renter tables (rent net of Rent Assistance + moving allowance).
      renterHousing: {
        modest: { single: 20_280, couple: 22_932 },
        comfortable: { single: 22_360, couple: 24_960 },
      },
      premiumUplift: { essential: 1.05, discretionary: 1.4 },
      smile: { slowGoDiscretionary: 0.8, noGoDiscretionary: 0.55, slowGoAge: 75, noGoAge: 85 },
    },
  },

  // Aged care — 2026 vintage (post-1 Nov 2025 Aged Care Act). Indexed figures;
  // re-verify at build (Dept. of Health/Ageing schedules + adviser tech refs).
  agedCare: {
    vintage: "2026",
    basicDailyFee: 65.55,
    hotellingMaxDaily: 22.15,
    ncccMaxDaily: 107.32,
    ncccLifetimeCap: 137_917,
    ncccMaxYears: 4,
    mpir: 0.0796, // Apr–Jun 2026 Maximum Permissible Interest Rate
    radNationalAvg: 570_000,
    radRetentionPctPerYear: 0.02,
    radRetentionMaxYears: 5,
    homeValueCapMeansTest: 214_884, // 20 Mar 2026
    formerHomeRentYieldNet: 0.03, // ~3% net rent on a kept, rented former home
    residentialLivingRetainedPct: 0.3, // keep ~30% of normal living spend for personal items/health; the fees cover the rest
    // v1 means-score ramps (transparent approximation of the statutory test).
    careAssetFreeArea: 61_500, // ~ the aged-care asset free area
    careAssetFullArea: 290_453, // assets at/above → max hotelling
    careIncomeFreeArea: 33_508, // single income free area (legacy MTF)
    careIncomeFullArea: 100_000,
    entryProbability: 0.33, // ~1 in 3 enter permanent residential care
    medianEntryAge: 85,
    medianDurationYears: 2.6,
    homeCareAnnualEstimate: 8_000, // simplified Support-at-Home out-of-pocket (v1)
  },

  // Super death-benefit tax (taxable component → non-dependant). 2026 vintage.
  superDeathBenefit: {
    taxedElementRatePct: 15,
    untaxedElementRatePct: 30,
    medicareLevyPct: 2,
  },
};

/** Minimum drawdown rate for a given age, from the config's age bands. */
export function minDrawdownRate(age: number, config: EngineConfig): number {
  let rate = config.minDrawdownBands[0]?.rate ?? 0.04;
  for (const band of config.minDrawdownBands) if (age >= band.minAge) rate = band.rate;
  return rate;
}

/**
 * Backfill a stored config with defaults for fields added AFTER it was first
 * seeded, so an older DB version still runs the current engine. CRITICAL for
 * `outsideTax` — without it the engine would tax outside-super gains with NO
 * discount. Pure (no DB), so it lives here with DEFAULT_CONFIG and is unit-tested.
 */
export function withDefaults(data: EngineConfig): EngineConfig {
  let out = data;
  if (data.asfa && !data.asfa.breakdown) {
    out = { ...out, asfa: { ...out.asfa, breakdown: DEFAULT_CONFIG.asfa.breakdown } };
  }
  // RG 276 two-stage deflation param, added after the initial seed.
  if (out.livingStandardsGrowthPct == null) {
    out = { ...out, livingStandardsGrowthPct: DEFAULT_CONFIG.livingStandardsGrowthPct };
  }
  // Super fees, added after the initial seed.
  if (out.fees == null) {
    out = { ...out, fees: DEFAULT_CONFIG.fees };
  }
  // Division 293, added after the initial seed.
  if (out.div293Threshold == null) {
    out = {
      ...out,
      div293Threshold: DEFAULT_CONFIG.div293Threshold,
      div293ExtraTaxRate: DEFAULT_CONFIG.div293ExtraTaxRate,
    };
  }
  // Outside-super deferred-CGT taxation, added after the initial seed. Critical to
  // backfill: without it the engine would tax outside gains with NO discount.
  if (out.outsideTax == null) {
    out = { ...out, outsideTax: DEFAULT_CONFIG.outsideTax };
  } else if (out.outsideTax.cgtRegime == null) {
    // Backfill the 1 July 2027 CGT-reform fields for configs seeded before they
    // existed — defaulting to the reform ("indexed" + 30% minimum), the new baseline.
    out = {
      ...out,
      outsideTax: {
        ...out.outsideTax,
        cgtRegime: DEFAULT_CONFIG.outsideTax.cgtRegime,
        cgtMinRatePct: DEFAULT_CONFIG.outsideTax.cgtMinRatePct,
      },
    };
  }
  // Aged-care block, added after the initial seed. Backfill so stored configs
  // still run the aged-care engine; a partial block gets its missing keys filled.
  if (out.agedCare == null) {
    out = { ...out, agedCare: DEFAULT_CONFIG.agedCare };
  } else {
    out = { ...out, agedCare: { ...DEFAULT_CONFIG.agedCare, ...out.agedCare } };
  }
  // Super death-benefit tax block, added after the initial seed.
  if (out.superDeathBenefit == null) {
    out = { ...out, superDeathBenefit: DEFAULT_CONFIG.superDeathBenefit };
  } else {
    out = { ...out, superDeathBenefit: { ...DEFAULT_CONFIG.superDeathBenefit, ...out.superDeathBenefit } };
  }
  // Monte Carlo return model, added after the initial seed.
  if (out.returnModel == null) {
    out = {
      ...out,
      returnModel: DEFAULT_CONFIG.returnModel,
      bootstrapBlockYears: DEFAULT_CONFIG.bootstrapBlockYears,
    };
  }
  // Guard the CGT discount against the classic "0.5 vs 50" entry mistake. It is a
  // PERCENT (50 = a 50% discount, used as 1 − pct/100), so a value entered as a
  // fraction (0 < x ≤ 1) almost certainly meant 0.5 → 50%. Normalise that, then
  // clamp to 0–100 so a stray value can never distort the discount branch.
  if (out.outsideTax && Number.isFinite(out.outsideTax.cgtDiscountPct)) {
    const raw = out.outsideTax.cgtDiscountPct;
    const normalised = Math.min(100, Math.max(0, raw > 0 && raw <= 1 ? raw * 100 : raw));
    if (normalised !== raw) {
      out = { ...out, outsideTax: { ...out.outsideTax, cgtDiscountPct: normalised } };
    }
  }
  return out;
}
