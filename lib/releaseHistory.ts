// Curated release history for the /releases changelog, backfilled on deploy (see
// seedReleases in migrations.ts). Dates + commit hashes are real (from git); version
// / build numbers are reconstructed and anchored to the known builds (052c5e3 = 404,
// 6dd9894 = 430, c4e985f = 453). Notes are in plain, non-technical business language.
// New releases are authored in the backoffice, not here.

export interface SeedRelease {
  version: string;
  build: number | null;
  commit: string;
  date: string; // YYYY-MM-DD
  title: string;
  notes: string[];
}

export const RELEASE_HISTORY: SeedRelease[] = [
  {
    version: "1.0.453", build: 453, commit: "c4e985f", date: "2026-07-28",
    title: "Faster, clearer scenario switching",
    notes: [
      "Switching between your saved plans now shows a loading spinner so you know it’s working.",
      "Tidied up the What-If page — new scenarios are created from the dashboard.",
    ],
  },
  {
    version: "1.0.450", build: 450, commit: "31e1e74", date: "2026-07-28",
    title: "Plain-language accuracy pass",
    notes: [
      "Reviewed and corrected the explanations across the app so the wording always matches your numbers.",
      "Fixed a withdrawal-rate figure that looked too high when part-time work was covering some of the spending.",
      "Clearer wording for couples who retire at different ages and for how your super is taxed.",
    ],
  },
  {
    version: "1.0.448", build: 448, commit: "1b28f70", date: "2026-07-28",
    title: "New strategy: debt recycling",
    notes: [
      "Compare a “debt recycling” strategy against putting extra into super — building wealth outside super using tax-deductible borrowing.",
      "Honest about the risk: it helps when investment returns beat the after-tax loan cost and hurts when they don’t.",
      "The trade-off flows through the likelihood and historical stress-test views, and it works for couples who retire at different ages.",
    ],
  },
  {
    version: "1.0.444", build: 444, commit: "1fa3e07", date: "2026-07-27",
    title: "A fresh RetireWiz look",
    notes: [
      "Refreshed the RetireWiz logo across the browser tab icon, PDF reports and link previews.",
    ],
  },
  {
    version: "1.0.438", build: 438, commit: "f0691b7", date: "2026-07-27",
    title: "Create scenarios your way",
    notes: [
      "Start a new plan from scratch or as a copy of your current one, and give it a name.",
      "Starting from scratch drops you straight into the setup wizard.",
    ],
  },
  {
    version: "1.0.434", build: 434, commit: "f7acf3c", date: "2026-07-27",
    title: "Tax view inside What-If",
    notes: [
      "See a year-by-year tax breakdown right inside What-If, alongside balance, net worth and income.",
    ],
  },
  {
    version: "1.0.432", build: 432, commit: "067d755", date: "2026-07-27",
    title: "Your plans, always saved",
    notes: [
      "Your work now saves automatically to a single named scenario — no more lost changes.",
      "Name your plans and switch between them anytime.",
    ],
  },
  {
    version: "1.0.424", build: 424, commit: "f03a4c8", date: "2026-07-26",
    title: "Richer PDF report",
    notes: [
      "The printable report now includes your What-if strategies, life events and stress-test results, with charts.",
    ],
  },
  {
    version: "1.0.416", build: 416, commit: "9a4d58b", date: "2026-07-25",
    title: "Life events",
    notes: [
      "Add one-off costs or windfalls at any age — a big trip, an inheritance, a new car — and see the impact on your plan.",
      "They’re marked on your balance chart.",
    ],
  },
  {
    version: "1.0.412", build: 412, commit: "1098e9f", date: "2026-07-25",
    title: "Redesigned What-If",
    notes: [
      "A cleaner, chart-forward What-If layout — strategies grouped by what you want to achieve, with the details in pop-ups.",
    ],
  },
  {
    version: "1.0.408", build: 408, commit: "4c650f6", date: "2026-07-25",
    title: "Keep super in accumulation",
    notes: [
      "New option to keep super in accumulation — useful for couples with an age gap — converting to a pension at Age-Pension age.",
      "Clearer balance-chart tooltips.",
    ],
  },
  {
    version: "1.0.404", build: 404, commit: "052c5e3", date: "2026-07-24",
    title: "Smarter stress testing",
    notes: [
      "The stress test now walks you through each historical market crash in plain language.",
      "Added a “fail-safe spend” — the most you could have spent and still survived the worst run on record.",
    ],
  },
  {
    version: "1.0.401", build: 401, commit: "0d6b78c", date: "2026-07-24",
    title: "Flexible spending (guardrails)",
    notes: [
      "New flexible-spending option that eases back a little after market falls and lets you spend a little more when markets are kind — so you can safely start higher.",
    ],
  },
];
