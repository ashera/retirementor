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
};

/** Minimum drawdown rate for a given age, from the config's age bands. */
export function minDrawdownRate(age: number, config: EngineConfig): number {
  let rate = config.minDrawdownBands[0]?.rate ?? 0.04;
  for (const band of config.minDrawdownBands) if (age >= band.minAge) rate = band.rate;
  return rate;
}
