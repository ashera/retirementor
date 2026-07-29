// Survival / mortality for the "Rich, Broke or Dead" longevity overlay. A shortfall
// deep in the tail matters far less than an early one because you're far less likely
// to be alive to experience it — so we weight outcomes by the probability of survival.
//
// The mortality law is a Gompertz–Makeham hazard μ(x) = A + B·e^(g·(x−65)), with the
// level B CALIBRATED per sex so the complete life expectancy at age 65 reproduces the
// ABS Australian Life Tables 2020–22 (e65: male 20.3 yrs, female 22.9 yrs — see
// aga.gov.au / abs.gov.au). It is a smooth parametric APPROXIMATION to the published
// tables (Gompertz fits adult mortality closely); the raw ABS single-year qx array can
// be dropped into `annualMortality` later to make it exact. Retirement planning only
// touches ages ~50+, where the fit is good.

export type Sex = "male" | "female";

interface Gompertz {
  A: number; // Makeham constant (age-independent background mortality)
  B: number; // hazard level at the anchor age (65)
  g: number; // Gompertz slope (log mortality per year of age)
}

// Calibrated so e65 = ABS ALT 2020–22 (male 20.3, female 22.9). See mortality.calib
// (scripts) — A and g are fixed to standard adult-mortality values; B is solved.
const ANCHOR = 65;
const PARAMS: Record<Sex, Gompertz> = {
  // B solved by bisection so e65 = ABS ALT 2020–22 (cross-check: male e0 ≈ 81.1 vs
  // published 81.2). See the calibration in tests/mortality.test.ts.
  male: { A: 0.0003, g: 0.095, B: 0.0104969 },
  female: { A: 0.0003, g: 0.095, B: 0.0077052 },
};

/** Probability of dying within the year of age `age` (0–1), per the calibrated law. */
export function annualMortality(age: number, sex: Sex): number {
  const p = PARAMS[sex];
  // Integrate the hazard over [age, age+1): ∫ A dt + B·∫ e^(g·(t−65)) dt.
  const cum = p.A + (p.B / p.g) * Math.exp(p.g * (age - ANCHOR)) * (Math.exp(p.g) - 1);
  return Math.min(1, 1 - Math.exp(-cum));
}

// Blended (50/50 male/female) annual mortality — the default when sex is unknown.
function annualMortalityBlended(age: number, sex?: Sex): number {
  if (sex) return annualMortality(age, sex);
  return 0.5 * annualMortality(age, "male") + 0.5 * annualMortality(age, "female");
}

const MAX_AGE = 112; // survival is ~0 beyond here; caps the curves

export interface SurvivalPoint {
  age: number;
  p: number; // probability of being alive at this age, given alive at `fromAge`
}

/** One person's survival curve: P(alive at each age ≥ fromAge | alive at fromAge). */
export function survivalCurve(fromAge: number, sex?: Sex): SurvivalPoint[] {
  const start = Math.max(0, Math.floor(fromAge));
  const out: SurvivalPoint[] = [{ age: start, p: 1 }];
  let p = 1;
  for (let age = start; age < MAX_AGE; age++) {
    p *= 1 - annualMortalityBlended(age, sex);
    out.push({ age: age + 1, p: Math.max(0, p) });
  }
  return out;
}

/** Complete life expectancy at `fromAge` (years), from the survival curve — used to
 *  validate the calibration against the ABS e65 figures. */
export function lifeExpectancy(fromAge: number, sex?: Sex): number {
  const curve = survivalCurve(fromAge, sex);
  // e_x ≈ Σ_{k≥1} p_k + ½ (trapezoidal, mid-year deaths).
  let sum = 0;
  for (let i = 1; i < curve.length; i++) sum += curve[i].p;
  return sum + 0.5;
}

export interface Life {
  currentAge: number;
  sex?: Sex;
}

/**
 * Household survival indexed by the OLDEST person's age (the projection's x-axis).
 * A household lasts until the LAST survivor dies, so P(at least one alive) =
 * 1 − Π(1 − Sᵢ). Each person's own age at a given oldest-age is shifted by their age
 * gap. Returns P(household still going) at each oldest-age from now to MAX_AGE.
 */
export function householdSurvival(people: Life[]): SurvivalPoint[] {
  const valid = people.filter((p) => Number.isFinite(p.currentAge) && p.currentAge > 0);
  if (valid.length === 0) return [{ age: 0, p: 1 }];
  const oldestNow = Math.max(...valid.map((p) => p.currentAge));
  // Per-person survival keyed by their OWN age.
  const curves = valid.map((p) => {
    const c = survivalCurve(p.currentAge, p.sex);
    const byAge = new Map<number, number>();
    for (const pt of c) byAge.set(pt.age, pt.p);
    return { gap: oldestNow - p.currentAge, byAge, currentAge: p.currentAge };
  });
  const out: SurvivalPoint[] = [];
  for (let oldestAge = oldestNow; oldestAge <= MAX_AGE; oldestAge++) {
    // P(all dead) = Π(1 − Sᵢ(their age when the oldest is `oldestAge`)).
    let allDead = 1;
    for (const c of curves) {
      const personAge = c.currentAge + (oldestAge - oldestNow);
      const s = c.byAge.get(personAge) ?? 0;
      allDead *= 1 - s;
    }
    out.push({ age: oldestAge, p: Math.max(0, Math.min(1, 1 - allDead)) });
  }
  return out;
}
