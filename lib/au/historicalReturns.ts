// Historical annual equity returns for a BLOCK-BOOTSTRAP Monte Carlo — a more
// realistic alternative to independent Gaussian draws over long horizons. Gaussian
// draws have no mean-reversion or volatility clustering, so across a 40-45 year
// retirement they manufacture ruinous return sequences that history never actually
// produced, which understates long-horizon safe spending. Resampling real history
// in contiguous blocks preserves those dynamics.
//
// IMPORTANT — we resample the SHAPE of history, not its level. Raw historical
// returns carry their own mean (~11% nominal) and volatility (~20%); using them
// directly would silently override the plan's own return/volatility assumptions
// (and impose a US market's level on an AU tool). Instead we STANDARDISE the series
// to zero-mean, unit-variance "shocks" (HISTORICAL_SHOCKS), block-resample those,
// and let the Monte Carlo apply them as `planMean + planVol · shock` — identical to
// the Gaussian path except the shocks come from real history (with its
// mean-reversion / clustering) rather than from independent normal draws. So the
// bootstrap changes only the SEQUENCING, never the assumed mean or volatility.
//
// Sources (accessed Jul 2026):
//  - S&P 500 annual TOTAL returns (price + dividends), 1928-2025: Aswath Damodaran,
//    NYU Stern — pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html
//  - US CPI annual-average inflation, 1928-2025: usinflationcalculator.com
//  Real return each year = (1 + nominal) / (1 + CPI) - 1.
//
// US data is used as a PROXY: it's the longest clean, freely-citable record, and
// AU/global equities are highly correlated with it. An AU-specific series can be
// swapped in here later without touching the sampler or the engine.

export const HIST_START_YEAR = 1928;

// S&P 500 total return each year, 1928..2025 (fractions).
const SP500_NOMINAL_TR: readonly number[] = [
  0.4381, -0.083, -0.2512, -0.4384, -0.0864, 0.4998, -0.0119, 0.4674, 0.3194, -0.3534,
  0.2928, -0.011, -0.1067, -0.1277, 0.1917, 0.2506, 0.1903, 0.3582, -0.0843, 0.052,
  0.057, 0.183, 0.3081, 0.2368, 0.1815, -0.0121, 0.5256, 0.326, 0.0744, -0.1046,
  0.4372, 0.1206, 0.0034, 0.2664, -0.0881, 0.2261, 0.1642, 0.124, -0.0997, 0.238,
  0.1081, -0.0824, 0.0356, 0.1422, 0.1876, -0.1431, -0.259, 0.37, 0.2383, -0.0698,
  0.0651, 0.1852, 0.3174, -0.047, 0.2042, 0.2234, 0.0615, 0.3124, 0.1849, 0.0581,
  0.1654, 0.3148, -0.0306, 0.3023, 0.0749, 0.0997, 0.0133, 0.372, 0.2268, 0.331,
  0.2834, 0.2089, -0.0903, -0.1185, -0.2197, 0.2836, 0.1074, 0.0483, 0.1561, 0.0548,
  -0.3655, 0.2594, 0.1482, 0.021, 0.1589, 0.3215, 0.1352, 0.0138, 0.1177, 0.2161,
  -0.0423, 0.3121, 0.1802, 0.2847, -0.1804, 0.2606, 0.2488, 0.1778,
];

// US CPI annual-average inflation each year, 1928..2025 (percent).
const US_CPI_PCT: readonly number[] = [
  -1.7, 0.0, -2.3, -9.0, -9.9, -5.1, 3.1, 2.2, 1.5, 3.6,
  -2.1, -1.4, 0.7, 5.0, 10.9, 6.1, 1.7, 2.3, 8.3, 14.4,
  8.1, -1.2, 1.3, 7.9, 1.9, 0.8, 0.7, -0.4, 1.5, 3.3,
  2.8, 0.7, 1.7, 1.0, 1.0, 1.3, 1.3, 1.6, 2.9, 3.1,
  4.2, 5.5, 5.7, 4.4, 3.2, 6.2, 11.0, 9.1, 5.8, 6.5,
  7.6, 11.3, 13.5, 10.3, 6.2, 3.2, 4.3, 3.6, 1.9, 3.6,
  4.1, 4.8, 5.4, 4.2, 3.0, 3.0, 2.6, 2.8, 3.0, 2.3,
  1.6, 2.2, 3.4, 2.8, 1.6, 2.3, 2.7, 3.4, 3.2, 2.8,
  3.8, -0.4, 1.6, 3.2, 2.1, 1.5, 1.6, 0.1, 1.3, 2.1,
  2.4, 1.8, 1.2, 4.7, 8.0, 4.1, 2.9, 2.6,
];

if (SP500_NOMINAL_TR.length !== US_CPI_PCT.length) {
  throw new Error(`historicalReturns: series length mismatch (${SP500_NOMINAL_TR.length} vs ${US_CPI_PCT.length})`);
}

/** Annual REAL equity total returns (fraction), 1928..2025. */
export const HISTORICAL_REAL_EQUITY: readonly number[] = SP500_NOMINAL_TR.map(
  (nom, i) => (1 + nom) / (1 + US_CPI_PCT[i] / 100) - 1,
);

// Standardised historical shocks: zero mean, unit variance. These carry the SHAPE
// of history (order, mean-reversion, fat tails) with its level stripped out, so the
// Monte Carlo can re-express them at the plan's own mean & volatility. We standardise
// the REAL series deliberately: the shocks are applied to a nominal mean and then
// deflated by a CONSTANT plan-inflation, so the resulting real path inherits the
// real-return shape. (This is NOT the same as standardising the nominal series — the
// year-varying CPI means the two shock sequences differ.)
const _mean = HISTORICAL_REAL_EQUITY.reduce((a, b) => a + b, 0) / HISTORICAL_REAL_EQUITY.length;
const _sd = Math.sqrt(
  HISTORICAL_REAL_EQUITY.reduce((a, b) => a + (b - _mean) ** 2, 0) / HISTORICAL_REAL_EQUITY.length,
);
// The Monte-Carlo bootstrap standardises the series to zero-mean/unit-variance
// shocks (below). The stress test, by contrast, replays each era's ACTUAL real
// returns (see stresstest.ts) — it does NOT subtract the mean — so `_mean` is used
// only for standardising the shocks here, not exported.
export const HISTORICAL_SHOCKS: readonly number[] = HISTORICAL_REAL_EQUITY.map((r) => (r - _mean) / _sd);

/** The real-return series as {year, real} points (real is a fraction). */
export function historicalSeries(): { year: number; real: number }[] {
  return HISTORICAL_REAL_EQUITY.map((real, i) => ({ year: HIST_START_YEAR + i, real }));
}

export interface HistoricalStats {
  n: number;
  startYear: number;
  endYear: number;
  arithMean: number; // arithmetic mean real return (fraction)
  geoMean: number; // geometric (compound) mean real return (fraction)
  vol: number; // standard deviation of real returns (fraction)
  best: { year: number; real: number };
  worst: { year: number; real: number };
  negativeYears: number; // count of down years
}

/** Summary statistics of the real historical equity series (for the admin view). */
export function historicalStats(): HistoricalStats {
  const s = HISTORICAL_REAL_EQUITY;
  const n = s.length;
  const arithMean = s.reduce((a, b) => a + b, 0) / n;
  const vol = Math.sqrt(s.reduce((a, b) => a + (b - arithMean) ** 2, 0) / n);
  const geoMean = Math.pow(s.reduce((a, b) => a * (1 + b), 1), 1 / n) - 1;
  let best = { year: HIST_START_YEAR, real: s[0] };
  let worst = { year: HIST_START_YEAR, real: s[0] };
  s.forEach((real, i) => {
    if (real > best.real) best = { year: HIST_START_YEAR + i, real };
    if (real < worst.real) worst = { year: HIST_START_YEAR + i, real };
  });
  return {
    n, startYear: HIST_START_YEAR, endYear: HIST_START_YEAR + n - 1,
    arithMean, geoMean, vol, best, worst,
    negativeYears: s.filter((r) => r < 0).length,
  };
}

/**
 * Circular block bootstrap over the standardised historical SHOCKS: stitch
 * contiguous blocks into a synthetic (horizon+1)-year path of zero-mean, unit-
 * variance shocks. Contiguous blocks preserve the short-run structure (mean-
 * reversion, volatility clustering) that IID / Gaussian draws destroy; wrapping
 * around the end ("circular") avoids under-weighting the latest years. `rand` is
 * the caller's PRNG so results stay deterministic per seed. The caller turns each
 * shock into a return via `planMean + planVol · shock`, so the plan's own mean and
 * volatility are preserved — only the sequencing comes from history.
 */
export function bootstrapShockPath(rand: () => number, horizon: number, blockYears = 10): number[] {
  const s = HISTORICAL_SHOCKS;
  const n = s.length;
  // Guard against a non-finite blockYears: Math.max(1, Math.round(NaN)) is NaN, and
  // `k < NaN` is always false → the block never fills → the while-loop spins forever.
  const len = Number.isFinite(blockYears) ? Math.max(1, Math.round(blockYears)) : 10;
  const out: number[] = [];
  while (out.length <= horizon) {
    const start = Math.floor(rand() * n);
    for (let k = 0; k < len && out.length <= horizon; k++) out.push(s[(start + k) % n]);
  }
  return out.slice(0, horizon + 1);
}
