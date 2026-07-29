import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "../lib/au/types";
import { retirementYearIncome } from "../lib/au/yearIncome";

const cfg = DEFAULT_CONFIG;
const base = (o: Partial<RetirementPlan>): RetirementPlan => ({
  ...DEFAULT_PLAN, household: "single", superMode: "individual",
  homeowner: true, outsideSuper: 0, annualOutsideSavings: 0,
  spendingMode: "flat", investmentReturn: 7, returnVolatility: 11, inflation: 2.5, lifeExpectancy: 90, ...o,
});

// The income modal reads its "Total income" (and each source) from retirementYearIncome.
// The invariant that guards against a forgotten source: in a FUNDED year the sources
// sum to what was actually spent.
describe("retirementYearIncome — the modal's income reconciliation", () => {
  const scenarios: Record<string, RetirementPlan> = {
    "global nomad (part-time work bridge)": base({
      people: [{ ...DEFAULT_PLAN.people[0], currentAge: 30, superBalance: 45_000, salary: 120_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
      homeowner: false, outsideSuper: 25_000, annualOutsideSavings: 15_000, retirementAge: 35, targetSpending: 24_000,
      workIncome: { perYear: 20_000, untilAge: 60 },
    }),
    "ordinary retiree (super + pension)": base({
      people: [{ ...DEFAULT_PLAN.people[0], currentAge: 60, superBalance: 600_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
      outsideSuper: 150_000, retirementAge: 60, targetSpending: 45_000,
    }),
    "staggered couple (a partner still working)": base({
      household: "couple", retirementAge: 60, outsideSuper: 200_000, targetSpending: 55_000,
      people: [
        { ...DEFAULT_PLAN.people[0], currentAge: 60, superBalance: 400_000, salary: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 },
        { ...DEFAULT_PLAN.people[0], currentAge: 58, superBalance: 350_000, salary: 90_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0, retirementAge: 67 },
      ],
    }),
  };

  for (const [name, plan] of Object.entries(scenarios)) {
    it(`income covers spending and the sources sum to the total — ${name}`, () => {
      const rows = simulate(plan, cfg).rows.filter((r) => r.phase !== "accumulation" && r.funded);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        const inc = retirementYearIncome(row);
        // Each named source adds up to the reported total (guards a refactor drop).
        const sum = inc.pension + inc.netRent + inc.partnerSalary + inc.partTimeWork + inc.fromSuper + inc.fromOutside;
        expect(sum).toBeCloseTo(inc.total, 6);
        // In a funded year, income at least COVERS spending — the drawdowns make up any
        // shortfall (equality), and when income exceeds spending the surplus is saved
        // (total > spend). A dropped source would push the total below spending here.
        expect(inc.total).toBeGreaterThanOrEqual(row.spending - 1);
      }
    });
  }

  it("counts part-time work in the total (the reported bug)", () => {
    const nomad = scenarios["global nomad (part-time work bridge)"];
    const bridge = simulate(nomad, cfg).rows.find((r) => r.age === 45)!; // living on the online business
    const inc = retirementYearIncome(bridge);
    expect(inc.partTimeWork).toBeGreaterThan(15_000); // the ~$20k online income is present
    expect(inc.total).toBeGreaterThan(inc.partTimeWork); // …and it's inside the total, not dropped
    expect(inc.total).toBeCloseTo(bridge.spending, 0); // total reconciles with spend
  });

  it("accumulation years have no retirement income", () => {
    const nomad = scenarios["global nomad (part-time work bridge)"];
    const working = simulate(nomad, cfg).rows.find((r) => r.age === 32)!;
    expect(retirementYearIncome(working).total).toBe(0);
  });
});
