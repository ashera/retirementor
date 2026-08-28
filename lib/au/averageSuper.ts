// Average (mean) superannuation balance by age — used only to seed a believable
// starting figure for the guided first-run experience, which the user then
// refines with their real balance. NOT used by the projection engine.
//
// Source: ASFA "Superannuation balances by age and gender", June 2023 (drawn from ATO
// data). `avg` is the all-persons MEAN for the band — the midpoint of ASFA's published
// male and female mean balances (populations are ~even, so this tracks the persons mean
// closely). Means run well above medians and drift up each release; these are rounded,
// illustrative figures for a sensible first-run default only — the user overwrites them
// with their real balance. Refresh when ASFA publishes a newer year.
//
//   band       male      female    combined(≈mean) → rounded
//   25-29    $27,021    $24,821    $25,921         $26,000
//   30-34    $55,690    $46,586    $51,138         $51,000
//   35-39    $96,122    $76,020    $86,071         $86,000
//   40-44   $140,680   $109,209   $124,945        $125,000
//   45-49   $193,501   $147,146   $170,324        $170,000
//   50-54   $254,071   $190,175   $222,123        $222,000
//   55-59   $319,743   $242,945   $281,344        $281,000
//   60-64   $395,852   $313,360   $354,606        $355,000
//   65-69   $448,518   $392,274   $420,396        $420,000

interface Band {
  maxAge: number; // inclusive upper bound of the band
  avg: number; // average super balance
}

const BANDS: Band[] = [
  { maxAge: 24, avg: 9_000 },
  { maxAge: 29, avg: 26_000 },
  { maxAge: 34, avg: 51_000 },
  { maxAge: 39, avg: 86_000 },
  { maxAge: 44, avg: 125_000 },
  { maxAge: 49, avg: 170_000 },
  { maxAge: 54, avg: 222_000 },
  { maxAge: 59, avg: 281_000 },
  { maxAge: 64, avg: 355_000 },
  { maxAge: 200, avg: 420_000 },
];

/** A believable average super balance for someone of this age (today's dollars). */
export function averageSuperForAge(age: number): number {
  const band = BANDS.find((b) => age <= b.maxAge) ?? BANDS[BANDS.length - 1];
  return band.avg;
}
