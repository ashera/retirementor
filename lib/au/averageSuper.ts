// Average (mean) superannuation balance by age — used only to seed a believable
// starting figure for the guided first-run experience, which the user then
// refines with their real balance. NOT used by the projection engine.
//
// Source: ASFA / ATO Taxation Statistics (average member balances, indicative).
// Means run higher than medians and vary by year; these are rounded, illustrative
// figures for a sensible default only. Kept here (with the source noted) so they
// can later move into the versioned reference-data config if desired.

interface Band {
  maxAge: number; // inclusive upper bound of the band
  avg: number; // average super balance
}

const BANDS: Band[] = [
  { maxAge: 24, avg: 6_000 },
  { maxAge: 29, avg: 24_000 },
  { maxAge: 34, avg: 44_000 },
  { maxAge: 39, avg: 68_000 },
  { maxAge: 44, avg: 100_000 },
  { maxAge: 49, avg: 145_000 },
  { maxAge: 54, avg: 195_000 },
  { maxAge: 59, avg: 255_000 },
  { maxAge: 64, avg: 320_000 },
  { maxAge: 200, avg: 380_000 },
];

/** A believable average super balance for someone of this age (today's dollars). */
export function averageSuperForAge(age: number): number {
  const band = BANDS.find((b) => age <= b.maxAge) ?? BANDS[BANDS.length - 1];
  return band.avg;
}
