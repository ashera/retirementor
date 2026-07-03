// Reference-data sources as first-class entities. These seeds populate the
// `sources` table; attributes (incl. "last updated from source") are then managed
// in the admin backoffice. Parameters reference a source by its stable `key`
// (see PARAM_DESCRIPTORS.sourceKey), so each source's set of provided parameters
// is always derivable.

export interface SourceSeed {
  key: string;
  name: string;
  organisation: string;
  url: string;
  updateFrequency: string;
  // Days after which the source is considered stale if not refreshed.
  // null = no scheduled review (never flagged stale).
  reviewIntervalDays: number | null;
  description: string;
}

export const SOURCE_SEEDS: SourceSeed[] = [
  {
    key: "ato-rates",
    name: "Key superannuation rates and thresholds",
    organisation: "Australian Taxation Office",
    url: "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds",
    updateFrequency: "Annually (1 July)",
    reviewIntervalDays: 365,
    description:
      "SG rate, contribution caps, transfer balance cap, TSB thresholds and minimum drawdown percentages.",
  },
  {
    key: "ms-tax",
    name: "Tax and super",
    organisation: "MoneySmart (ASIC)",
    url: "https://moneysmart.gov.au/how-super-works/tax-and-super",
    updateFrequency: "As tax law changes",
    reviewIntervalDays: 365,
    description: "Contributions tax and earnings tax rates across accumulation and pension phases.",
  },
  {
    key: "ms-preserve",
    name: "Preservation age",
    organisation: "MoneySmart (ASIC)",
    url: "https://moneysmart.gov.au/glossary/preservation-age",
    updateFrequency: "Rarely (legislated)",
    reviewIntervalDays: null,
    description: "Age at which super can be accessed.",
  },
  {
    key: "sa-rates",
    name: "How much Age Pension you can get",
    organisation: "Services Australia",
    url: "https://www.servicesaustralia.gov.au/how-much-age-pension-you-can-get?context=22526",
    updateFrequency: "Indexed 20 Mar & 20 Sep",
    reviewIntervalDays: 183,
    description: "Age Pension qualifying age and maximum payment rates (incl. supplements).",
  },
  {
    key: "sa-income",
    name: "Income test for Age Pension",
    organisation: "Services Australia",
    url: "https://www.servicesaustralia.gov.au/income-test-for-age-pension?context=22526",
    updateFrequency: "Free areas 1 Jul; rates 20 Mar/Sep",
    reviewIntervalDays: 183,
    description: "Income free areas, income taper and the deeming rates/thresholds.",
  },
  {
    key: "sa-assets",
    name: "Assets test for Age Pension",
    organisation: "Services Australia",
    url: "https://www.servicesaustralia.gov.au/assets-test-for-age-pension?context=22526",
    updateFrequency: "Indexed 1 July",
    reviewIntervalDays: 365,
    description: "Assets free areas (homeowner/renter, single/couple) and the assets taper.",
  },
  {
    key: "asfa-standard",
    name: "ASFA Retirement Standard",
    organisation: "Association of Superannuation Funds of Australia",
    url: "https://www.superannuation.asn.au/resources/retirement-standard/",
    updateFrequency: "Quarterly",
    reviewIntervalDays: 120,
    description: "Comfortable/modest annual budgets and lump sums (reference benchmarks).",
  },
];
