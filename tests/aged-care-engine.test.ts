import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg } from "../lib/au/config";
import { DEFAULT_PLAN, type AgedCarePlan, type RetirementPlan } from "../lib/au/types";
import { residentialAnnualCost } from "../lib/au/agedCare";
import { yearFlow } from "../lib/au/yearFlow";
import { runMonteCarlo } from "../lib/au/montecarlo";
import { runStressTest } from "../lib/au/stresstest";

const AC = cfg.agedCare;

// A solvent single homeowner already at pension age, self-funded. inflation 0 so
// the model's today's-dollar figures line up cleanly with the config constants.
const base: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ currentAge: 67, superBalance: 700_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  homeowner: true,
  home: { value: 900_000, growthReal: 0 },
  outsideSuper: 300_000,
  annualOutsideSavings: 0,
  retirementAge: 67,
  spendingMode: "flat",
  targetSpending: 50_000,
  investmentReturn: 6,
  inflation: 0,
  lifeExpectancy: 92,
};

const withCare = (over: Partial<AgedCarePlan>): RetirementPlan => ({
  ...base,
  agedCare: {
    enabled: true,
    careType: "residential",
    entryAge: 85,
    durationYears: 3,
    accommodation: "dap",
    homeAction: "keep-vacant",
    ...over,
  },
});

const rowAt = (p: RetirementPlan, age: number) => simulate(p, cfg).rows.find((r) => r.age === age)!;

describe("aged care — engine integration", () => {
  it("is inert when disabled (byte-identical rows)", () => {
    const off = simulate(base, cfg).rows;
    const disabled = simulate({ ...base, agedCare: { ...withCare({}).agedCare!, enabled: false } }, cfg).rows;
    expect(disabled.map((r) => r.total)).toEqual(off.map((r) => r.total));
  });

  it("adds a care-cost overlay from entry until death (residential care is terminal)", () => {
    const sim = simulate(withCare({}), cfg).rows;
    expect(sim.find((r) => r.age === 84)!.breakdown.agedCareTotal ?? 0).toBe(0); // before entry
    expect(sim.find((r) => r.age === 85)!.breakdown.agedCareTotal ?? 0).toBeGreaterThan(0); // entry
    expect(sim.find((r) => r.age === 88)!.breakdown.agedCareTotal ?? 0).toBeGreaterThan(0); // still in care
    expect(sim.find((r) => r.age === 92)!.breakdown.agedCareTotal ?? 0).toBeGreaterThan(0); // last year of life
  });

  it("charges the basic daily fee flat and DAP = RAD × MPIR in a DAP plan", () => {
    const b = rowAt(withCare({ accommodation: "dap" }), 85).breakdown;
    expect(b.agedCareBasic).toBeCloseTo(AC.basicDailyFee * 365, 2);
    expect(b.agedCareDAP).toBeCloseTo(AC.radNationalAvg * AC.mpir, 2);
    expect(b.radHeld ?? 0).toBe(0); // no lump sum in a DAP plan
  });

  it("nets out living costs the residential fees replace (not home care)", () => {
    const preCare = rowAt(base, 84).breakdown.livingSpend; // full lifestyle spend before care
    const resid = rowAt(withCare({ accommodation: "dap", homeAction: "keep-vacant" }), 85).breakdown;
    // In residential care only a personal-expenses share of living spend remains.
    expect(resid.livingSpend).toBeCloseTo(preCare * AC.residentialLivingRetainedPct, 0);
    expect(resid.agedCareLivingSaved ?? 0).toBeCloseTo(preCare * (1 - AC.residentialLivingRetainedPct), 0);
    // Home care (still living at home) keeps the full living spend.
    const home = rowAt(withCare({ careType: "home" }), 85).breakdown;
    expect(home.livingSpend).toBeCloseTo(preCare, 0);
    expect(home.agedCareLivingSaved ?? 0).toBe(0);
  });

  it("lowers the retirement balance vs the no-care baseline", () => {
    const withB = rowAt(withCare({}), 88).total; // year after care
    const noB = rowAt(base, 88).total;
    expect(withB).toBeLessThan(noB);
  });

  it("stops the NCCC after the max number of years but keeps basic + hotelling", () => {
    const sim = simulate(withCare({ durationYears: 6 }), cfg).rows;
    const capYear = sim.find((r) => r.age === 85 + AC.ncccMaxYears)!.breakdown; // (maxYears)th year past entry
    expect(capYear.agedCareNCCC ?? 0).toBe(0);
    expect(capYear.agedCareBasic ?? 0).toBeGreaterThan(0);
    expect(capYear.agedCareHotelling ?? 0).toBeGreaterThan(0);
  });

  it("hand-derives the entry-year fees for a max-means retiree (independent oracle)", () => {
    // This retiree is well above the full-contribution point (~$290k assets) at 85,
    // so the means score is 1 → max hotelling + full NCCC. Derived WITHOUT the module.
    const b = rowAt(withCare({ accommodation: "dap" }), 85).breakdown;
    expect(b.agedCareBasic).toBeCloseTo(AC.basicDailyFee * 365, 2);
    expect(b.agedCareHotelling).toBeCloseTo(AC.hotellingMaxDaily * 365, 2);
    expect(b.agedCareNCCC).toBeCloseTo(AC.ncccMaxDaily * 365, 2);
    expect(b.agedCareDAP).toBeCloseTo(AC.radNationalAvg * AC.mpir, 2);
    expect(b.agedCareTotal).toBeCloseTo(
      (AC.basicDailyFee + AC.hotellingMaxDaily + AC.ncccMaxDaily) * 365 + AC.radNationalAvg * AC.mpir,
      2,
    );
  });

  it("independently reproduces the entry-year residential cost from the module (oracle)", () => {
    const b = rowAt(withCare({ accommodation: "dap" }), 85).breakdown;
    // Reconstruct the engine's v1 means indicator: opening assessable assets +
    // capped former home (kept), income folded in at v2.
    const means = {
      assets: b.openingOutside + b.openingSuper + Math.min(b.homeValue, AC.homeValueCapMeansTest),
      income: 0,
    };
    const oracle = residentialAnnualCost(
      { means, radUnpaid: AC.radNationalAvg, ncccPaidToDate: 0, ncccYearsToDate: 0 },
      AC,
    );
    expect(b.agedCareTotal).toBeCloseTo(oracle.total, 2);
    expect(b.agedCareBasic).toBeCloseTo(oracle.basic, 2);
    expect(b.agedCareHotelling).toBeCloseTo(oracle.hotelling, 2);
    expect(b.agedCareNCCC).toBeCloseTo(oracle.nccc, 2);
    expect(b.agedCareDAP).toBeCloseTo(oracle.dap, 2);
  });
});

describe("aged care — RAD accommodation & means test", () => {
  it("pays a refundable deposit at entry, retains 2%/yr, and holds the net deposit to the estate", () => {
    const sim = simulate(withCare({ accommodation: "rad", radAmount: 400_000, radFundedFrom: "outside" }), cfg).rows;
    const entry = sim.find((r) => r.age === 85)!.breakdown;
    expect(entry.radDrawn ?? 0).toBeGreaterThan(0);
    expect(entry.radHeld ?? 0).toBeCloseTo(392_000, 0); // 400k less the first year's 2% retention
    expect(entry.agedCareDAP ?? 0).toBe(0); // fully lump-summed → no DAP
    // Residential care is terminal (runs 85→92 here); retention caps at 5 years (10%),
    // so 90% of the deposit is held to the estate — never refunded mid-projection.
    expect(sim[sim.length - 1].breakdown.radHeld ?? 0).toBeCloseTo(360_000, 0); // 400k × 0.9
  });

  it("the RAD (exempt from the assets test) lifts the Age Pension vs an equivalent DAP plan", () => {
    const radPension = rowAt(withCare({ accommodation: "rad", radAmount: 400_000, radFundedFrom: "outside" }), 85).agePension;
    const dapPension = rowAt(withCare({ accommodation: "dap" }), 85).agePension;
    expect(radPension).toBeGreaterThan(dapPension);
  });

  it("selling the former home zeroes it and helps fund the RAD", () => {
    const sim = simulate(withCare({ accommodation: "rad", radAmount: 400_000, homeAction: "sell" }), cfg).rows;
    const entry = sim.find((r) => r.age === 85)!.breakdown;
    expect(entry.homeValue).toBe(0); // home sold at entry
    expect(entry.radHeld ?? 0).toBeCloseTo(392_000, 0); // 400k less the first year's 2% retention
    // With the home funding the RAD, less is drawn from the liquid pools than when
    // there's no home sale, so the spendable balance is higher.
    const keptBalance = rowAt(withCare({ accommodation: "rad", radAmount: 400_000, homeAction: "keep-vacant" }), 86).total;
    expect(sim.find((r) => r.age === 86)!.total).toBeGreaterThan(keptBalance);
  });
});

describe("aged care — RAD retention (2026 Aged Care Act: 2%/yr, capped at 5 years / 10%; held to the estate)", () => {
  const AC = cfg.agedCare;
  // Residential care is terminal, so the length in care is (life expectancy − entry age).
  const stay = (entryAge: number, lifeExpectancy: number): RetirementPlan => ({
    ...base,
    people: [{ currentAge: 67, superBalance: 300_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
    outsideSuper: 900_000,
    lifeExpectancy,
    agedCare: { enabled: true, careType: "residential", entryAge, durationYears: 3, accommodation: "rad", radAmount: 500_000, homeAction: "keep-vacant" },
  });
  const retained = (sim: ReturnType<typeof simulate>["rows"]) =>
    sim.reduce((s, r) => s + (r.breakdown.agedCareRadRetention ?? 0), 0);

  it("caps the retention at 5 years / 10% for a long stay, holding 90% to the estate", () => {
    const sim = simulate(stay(85, 96), cfg).rows; // ~11 years in care
    expect(retained(sim)).toBeCloseTo(500_000 * 0.1, 0); // capped at 10%, not 22%
    expect(sim[sim.length - 1].breakdown.radHeld ?? 0).toBeCloseTo(500_000 * 0.9, 0);
  });

  it("retains 2%/yr for a shorter stay (fewer than 5 years) and holds the rest to the estate", () => {
    const sim = simulate(stay(89, 91), cfg).rows; // a short terminal stay
    const retYears = sim.filter((r) => (r.breakdown.agedCareRadRetention ?? 0) > 0).length;
    expect(retYears).toBeLessThan(AC.radRetentionMaxYears); // not capped
    expect(retained(sim)).toBeCloseTo(500_000 * AC.radRetentionPctPerYear * retYears, 0);
    const held = sim[sim.length - 1].breakdown.radHeld ?? 0;
    expect(held).toBeCloseTo(500_000 - retained(sim), 0); // net deposit held to the estate
    expect(held).toBeGreaterThan(0);
  });

  it("holds the net deposit continuously to the estate — never refunded mid-projection (care is terminal)", () => {
    const sim = simulate(stay(85, 90), cfg).rows;
    const heldInCare = sim.filter((r) => r.age >= 85).map((r) => r.breakdown.radHeld ?? 0);
    expect(Math.min(...heldInCare)).toBeGreaterThan(0); // radHeld never drops to 0 while alive
    expect(sim[sim.length - 1].breakdown.radHeld ?? 0).toBeGreaterThan(0);
  });
});

describe("aged care — former-home Age Pension interaction (Phase 2)", () => {
  it("keeps the former home exempt for 2 years, then assesses it (single, keep)", () => {
    const sim = simulate(withCare({ durationYears: 5, homeAction: "keep-vacant", accommodation: "dap" }), cfg).rows;
    const yr2 = sim.find((r) => r.age === 86)!.breakdown.pension!; // within the 2-year grace
    const yr3 = sim.find((r) => r.age === 87)!.breakdown.pension!; // grace over → home assessed
    const homeVal = sim.find((r) => r.age === 87)!.breakdown.homeValue || 900_000;
    // Assessable assets jump by roughly the home value once the grace ends.
    expect(yr3.assessableAssets - yr2.assessableAssets).toBeGreaterThan(0.5 * homeVal);
  });

  it("drops the Age Pension when the former home becomes assessable (modest single)", () => {
    const modest: RetirementPlan = {
      ...base,
      people: [{ currentAge: 67, superBalance: 150_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
      outsideSuper: 40_000,
      home: { value: 700_000, growthReal: 0 },
      targetSpending: 38_000,
      investmentReturn: 5,
      agedCare: { enabled: true, careType: "residential", entryAge: 85, durationYears: 5, accommodation: "dap", homeAction: "keep-vacant" },
    };
    const sim = simulate(modest, cfg).rows;
    const p86 = sim.find((r) => r.age === 86)!.agePension; // home still exempt
    const p87 = sim.find((r) => r.age === 87)!.agePension; // home now assessed
    expect(p86).toBeGreaterThan(0);
    expect(p87).toBeLessThan(p86);
  });

  it("earns assessable net rent on a kept, rented former home that offsets the cost", () => {
    const rentRow = rowAt(withCare({ homeAction: "keep-rent", accommodation: "dap" }), 85);
    const homeVal = rentRow.breakdown.homeValue || 900_000;
    expect(rentRow.breakdown.agedCareHomeRent).toBeCloseTo(homeVal * AC.formerHomeRentYieldNet, 0);
    // Rent offsets the care cost → higher spendable balance than not renting.
    const rented = rowAt(withCare({ homeAction: "keep-rent", accommodation: "dap" }), 87).total;
    const vacant = rowAt(withCare({ homeAction: "keep-vacant", accommodation: "dap" }), 87).total;
    expect(rented).toBeGreaterThan(vacant);
  });

  it("a couple keeps the former home exempt (protected partner)", () => {
    const couple: RetirementPlan = {
      ...base,
      household: "couple",
      people: [
        { currentAge: 67, superBalance: 400_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
        { currentAge: 67, superBalance: 300_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
      ],
      agedCare: { enabled: true, careType: "residential", entryAge: 85, durationYears: 5, accommodation: "dap", homeAction: "keep-vacant" },
    };
    const sim = simulate(couple, cfg).rows;
    const yr2 = sim.find((r) => r.age === 86)!.breakdown.pension!;
    const yr3 = sim.find((r) => r.age === 87)!.breakdown.pension!;
    // No former-home jump: the protected partner keeps it exempt (difference is only
    // the year's drawdown, far less than the home value).
    expect(Math.abs(yr3.assessableAssets - yr2.assessableAssets)).toBeLessThan(200_000);
  });
});

describe("aged care — fee components reconcile with the full cost", () => {
  const firstCare = (p: RetirementPlan) => simulate(p, cfg).rows.find((r) => (r.breakdown.agedCareTotal ?? 0) > 0)!.breakdown;
  const sumParts = (b: ReturnType<typeof firstCare>) =>
    (b.agedCareBasic ?? 0) + (b.agedCareHotelling ?? 0) + (b.agedCareNCCC ?? 0) + (b.agedCareDAP ?? 0);

  for (const accommodation of ["dap", "rad", "combo"] as const) {
    it(`components sum to agedCareFull (${accommodation})`, () => {
      const b = firstCare(withCare({ accommodation, radAmount: 570_000, radSharePct: 50 }));
      expect(sumParts(b)).toBeCloseTo(b.agedCareFull ?? 0, 1);
    });
  }

  it("charges DAP on any lump sum the savings can't cover (room fully paid, not short)", () => {
    // Low-asset single: a $400k RAD in "keep" mode can't be fully funded from savings.
    const modest: RetirementPlan = {
      ...base,
      people: [{ currentAge: 67, superBalance: 250_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
      outsideSuper: 80_000,
      home: { value: 700_000, growthReal: 2 },
      targetSpending: 45_000,
      investmentReturn: 5,
      agedCare: { enabled: true, careType: "residential", entryAge: 85, durationYears: 4, accommodation: "rad", radAmount: 400_000, homeAction: "keep-vacant" },
    };
    const b = simulate(modest, cfg).rows.find((r) => (r.breakdown.agedCareTotal ?? 0) > 0)!.breakdown;
    const funded = b.radDrawn ?? 0;
    const unpaid = (b.agedCareDAP ?? 0) / cfg.agedCare.mpir;
    expect(funded).toBeGreaterThan(0);
    expect(b.agedCareDAP ?? 0).toBeGreaterThan(0); // the shortfall is charged daily
    expect(funded + unpaid).toBeCloseTo(400_000, 0); // the whole room is paid for
  });

  it("a Mix pays part as a RAD lump sum and part as DAP (reconciling to the room)", () => {
    const mpir = cfg.agedCare.mpir;
    // Explicit 50/50, and an untouched Mix (no radSharePct) which must default to 50/50
    // — NOT behave as a full lump sum.
    for (const over of [{ accommodation: "combo" as const, radSharePct: 50 }, { accommodation: "combo" as const }]) {
      const b = firstCare(withCare({ ...over, radAmount: 500_000 }));
      expect(b.radDrawn ?? 0).toBeGreaterThan(0); // a lump-sum portion is paid
      expect(b.agedCareDAP ?? 0).toBeGreaterThan(0); // AND a daily portion
      expect((b.radDrawn ?? 0) + (b.agedCareDAP ?? 0) / mpir).toBeCloseTo(500_000, 0); // together = the room
    }
  });

  it("a fully-funded lump-sum room has no DAP (and a lower annual cost than paying daily)", () => {
    // Wealthy plan so the RAD is fully funded from savings → no shortfall DAP.
    const rad = firstCare(withCare({ accommodation: "rad", radAmount: 570_000 }));
    const dap = firstCare(withCare({ accommodation: "dap", radAmount: 570_000 }));
    expect(rad.agedCareDAP ?? 0).toBe(0);
    expect(dap.agedCareDAP ?? 0).toBeGreaterThan(0);
    expect(rad.agedCareFull ?? 0).toBeLessThan(dap.agedCareFull ?? 0);
  });
});

describe("aged care — balance waterfall names the flows (no 'Other adjustments')", () => {
  const entryFlow = (p: RetirementPlan) => {
    const row = simulate(p, cfg).rows.find((r) => (r.breakdown.agedCareTotal ?? 0) > 0)!;
    return yearFlow(row);
  };
  it("shows the RAD deposit + home sale, and ties out, for sell + RAD", () => {
    const wf = entryFlow(withCare({ accommodation: "rad", radAmount: 550_000, homeAction: "sell" }));
    expect(wf.lines.find((l) => l.key === "agedCareRad")?.amount).toBeLessThan(0);
    expect(wf.lines.find((l) => l.key === "agedCareHomeSale")?.amount ?? 0).toBeGreaterThan(0);
    expect(wf.lines.find((l) => l.key === "other")).toBeUndefined();
    // The waterfall ties exactly (sum of lines === net).
    expect(wf.lines.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(wf.net, 0);
  });
  it("names the RAD deposit (no home sale) for keep + RAD, and ties out", () => {
    const wf = entryFlow(withCare({ accommodation: "rad", radAmount: 400_000, homeAction: "keep-vacant" }));
    expect(wf.lines.find((l) => l.key === "agedCareRad")?.amount).toBeLessThan(0);
    expect(wf.lines.find((l) => l.key === "other")).toBeUndefined();
  });
  it("has no leftover residual for keep + DAP (cost funded via the drawdown)", () => {
    const wf = entryFlow(withCare({ accommodation: "dap", homeAction: "keep-vacant" }));
    expect(wf.lines.find((l) => l.key === "other")).toBeUndefined();
  });
});

describe("aged care — couples", () => {
  const couple: RetirementPlan = {
    ...base,
    household: "couple",
    people: [
      { currentAge: 67, superBalance: 300_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
      { currentAge: 67, superBalance: 300_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
    ],
    outsideSuper: 150_000,
    targetSpending: 60_000,
    agedCare: { enabled: true, careType: "residential", entryAge: 85, durationYears: 3, accommodation: "dap", homeAction: "keep-vacant" },
  };
  const at = (rows: ReturnType<typeof simulate>["rows"], age: number) => rows.find((r) => r.age === age)!;

  it("only nets out the care-entrant's share of living (the at-home partner keeps theirs)", () => {
    const sim = simulate(couple, cfg).rows;
    const pre = at(sim, 84).breakdown.livingSpend;
    const inCare = at(sim, 85).breakdown;
    // A couple replaces only ~half the household living (one entrant), so the saving
    // is half what a single loses — not the full (1 − retained) share.
    expect(inCare.agedCareLivingSaved ?? 0).toBeCloseTo(pre * (1 - AC.residentialLivingRetainedPct) * 0.5, 0);
    expect(inCare.livingSpend).toBeGreaterThan(pre * 0.5); // clearly more than a single would keep
  });

  it("pays the illness-separated (higher) pension when one partner is in residential care", () => {
    const normal = at(simulate({ ...couple, agedCare: undefined }, cfg).rows, 85).agePension;
    const inCare = at(simulate(couple, cfg).rows, 85).agePension;
    expect(inCare).toBeGreaterThan(normal);
  });
});

describe("aged care — full cost equals the charged cost (no weighting)", () => {
  it("agedCareFull === agedCareTotal every care year", () => {
    for (const r of simulate(withCare({ durationYears: 4 }), cfg).rows) {
      if ((r.breakdown.agedCareTotal ?? 0) > 0) {
        expect(r.breakdown.agedCareTotal).toBeCloseTo(r.breakdown.agedCareFull ?? 0, 2);
      }
    }
  });
});

describe("aged care — cross-cutting (MC / stress / guardrails / persona)", () => {
  const mc = { iterations: 300, seed: 12345 } as const;
  const depAge = (p: RetirementPlan) => simulate(p, cfg).depletedAge ?? p.lifeExpectancy + 100;

  it("lowers the Monte Carlo success rate — the care cost flows through MC", () => {
    const noCare = runMonteCarlo(base, cfg, mc).successRate;
    const withC = runMonteCarlo(withCare({ durationYears: 4, accommodation: "dap" }), cfg, mc).successRate;
    expect(withC).toBeLessThan(noCare);
  });

  it("never improves historical stress survival — the cost flows through the stress test", () => {
    const noCare = runStressTest(base, cfg).survived;
    const withC = runStressTest(withCare({ durationYears: 4, accommodation: "dap" }), cfg).survived;
    expect(withC).toBeLessThanOrEqual(noCare);
  });

  it("never makes the plan last longer than without care (opt-in, monotonic)", () => {
    expect(depAge(withCare({ durationYears: 4, accommodation: "dap" }))).toBeLessThanOrEqual(depAge(base));
  });

  it("runs with guardrails on, and the care cost still bites", () => {
    const guardedCare = { ...withCare({ durationYears: 3, accommodation: "dap" }), guardrails: {} };
    const row = simulate(guardedCare, cfg).rows.find((r) => r.age === 85)!;
    expect(row.breakdown.agedCareTotal ?? 0).toBeGreaterThan(0); // care still charged under guardrails
    expect(depAge(guardedCare)).toBeLessThanOrEqual(depAge({ ...base, guardrails: {} })); // no better than guardrails alone
  });

  it("persona — age-gapped couple: illness-separated pension in care, home stays protected", () => {
    const coupleGap: RetirementPlan = {
      ...base,
      household: "couple",
      people: [
        { currentAge: 67, superBalance: 300_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
        { currentAge: 62, superBalance: 250_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }, // 5-yr gap
      ],
      outsideSuper: 150_000,
      targetSpending: 60_000,
      agedCare: { enabled: true, careType: "residential", entryAge: 85, durationYears: 3, accommodation: "dap", homeAction: "keep-vacant" },
    };
    const noCare = { ...coupleGap, agedCare: undefined };
    const care85 = simulate(coupleGap, cfg).rows.find((r) => r.age === 85)!;
    const base85 = simulate(noCare, cfg).rows.find((r) => r.age === 85)!;
    expect(care85.agePension).toBeGreaterThan(base85.agePension); // illness-separated uplift, even age-gapped
    expect(care85.breakdown.homeValue).toBeGreaterThan(0); // couple keeps the home (protected person)
    // Protected home means no former-home assessment jump (couple, unlike a single).
    const care87 = simulate(coupleGap, cfg).rows.find((r) => r.age === 87)!.breakdown.pension!;
    const care86 = simulate(coupleGap, cfg).rows.find((r) => r.age === 86)!.breakdown.pension!;
    expect(Math.abs(care87.assessableAssets - care86.assessableAssets)).toBeLessThan(200_000);
  });
});
