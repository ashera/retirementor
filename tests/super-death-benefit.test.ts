import { describe, it, expect } from "vitest";
import { simulate } from "../lib/au/simulate";
import { DEFAULT_CONFIG as cfg, withDefaults } from "../lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan, type YearBreakdown } from "../lib/au/types";

// Super death-benefit tax (moat leg 2). The engine tracks the tax-free / taxable
// COMPONENT split of super through the whole projection and, at each year, reports
// what the beneficiaries would pay if you died that year. This suite checks the
// component tracking against INDEPENDENT closed forms, not against the engine's own
// intermediate state. inflation 0 so today's-dollar figures line up with the rates.
const SDB_RATE = (cfg.superDeathBenefit.taxedElementRatePct + cfg.superDeathBenefit.medicareLevyPct) / 100; // 0.17

// A working single who will retire at 67 and live to 92. SG only (no voluntary
// contributions) unless a test overrides the person.
const base: RetirementPlan = {
  ...DEFAULT_PLAN,
  household: "single",
  people: [{ currentAge: 40, superBalance: 150_000, salary: 100_000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  homeowner: true,
  home: { value: 700_000, growthReal: 0 },
  outsideSuper: 50_000,
  annualOutsideSavings: 0,
  retirementAge: 67,
  spendingMode: "flat",
  targetSpending: 45_000,
  investmentReturn: 6,
  inflation: 0,
  lifeExpectancy: 92,
};

const run = (p: RetirementPlan) => simulate(p, cfg).rows;
const bAt = (p: RetirementPlan, age: number): YearBreakdown => {
  const rows = run(p);
  return (rows.find((r) => r.age === age) ?? rows[rows.length - 1]).breakdown;
};

describe("super death-benefit tax — component tracking", () => {
  it("SG-only super is entirely the TAXABLE component (starting balance + concessional + earnings), tax-free stays 0", () => {
    for (const r of run(base)) {
      const b = r.breakdown;
      expect(b.superTaxFree).toBeCloseTo(0, 6);
      expect(b.superTaxable ?? 0).toBeCloseTo(b.closingSuper, 3);
    }
  });

  it("a NON-dependant beneficiary is taxed 15%+Medicare on the taxable component; the death tax matches an independent recompute", () => {
    const b = bAt(base, 92);
    // Independent: SG-only => taxable == whole balance => tax == balance * 0.17.
    expect(b.deathBenefitTax).toBeCloseTo(b.closingSuper * SDB_RATE, 2);
  });

  it("accumulation-phase non-concessional contributions build the tax-free component EXACTLY (no withdrawals to dilute it)", () => {
    // $10k/yr NCC from 40..66 = 27 contribution years. No withdrawals happen while
    // working, so at the last accumulation year the tax-free component is exactly the
    // sum of the contributions, independent of earnings (earnings are all taxable).
    const p: RetirementPlan = { ...base, people: [{ ...base.people[0], voluntaryNonConcessional: 10_000 }] };
    const b66 = bAt(p, 66);
    expect(b66.superTaxFree).toBeCloseTo(10_000 * 27, 2);
  });

  it("the tax-free and taxable components always sum to the closing super, and 0 <= tax-free <= super", () => {
    const p: RetirementPlan = { ...base, people: [{ ...base.people[0], voluntaryNonConcessional: 12_000 }] };
    for (const r of run(p)) {
      const b = r.breakdown;
      expect((b.superTaxFree ?? 0) + (b.superTaxable ?? 0)).toBeCloseTo(b.closingSuper, 3);
      expect(b.superTaxFree ?? 0).toBeGreaterThanOrEqual(-1e-6);
      expect(b.superTaxFree ?? 0).toBeLessThanOrEqual(b.closingSuper + 1e-6);
    }
  });

  it("the mandatory minimum drawdown erodes the tax-free component through retirement (the problem recontribution fixes)", () => {
    const p: RetirementPlan = { ...base, people: [{ ...base.people[0], voluntaryNonConcessional: 10_000 }] };
    const at67 = bAt(p, 67).superTaxFree ?? 0;
    const at80 = bAt(p, 80).superTaxFree ?? 0;
    expect(at67).toBeGreaterThan(0);
    expect(at80).toBeLessThan(at67); // ground down pro-rata by withdrawals
  });

  it("estateValue reconciles to super (net of the death tax) + outside savings + home equity + any refundable RAD", () => {
    for (const r of run(base)) {
      const b = r.breakdown;
      const expected =
        b.closingSuper -
        (b.deathBenefitTax ?? 0) +
        Math.max(0, b.closingOutside) +
        Math.max(0, b.homeEquity) +
        (b.radHeld ?? 0);
      expect(b.estateValue).toBeCloseTo(expected, 2);
    }
  });
});

describe("super death-benefit tax — beneficiary + strategy", () => {
  it("a DEPENDANT (spouse) beneficiary pays no death-benefit tax in any year", () => {
    const dep: RetirementPlan = { ...base, superBeneficiary: "dependant" };
    for (const r of run(dep)) expect(r.breakdown.deathBenefitTax ?? 0).toBeCloseTo(0, 6);
  });

  it("the recontribution lever adds tax-free component (an after-tax top-up from savings)", () => {
    // NOTE: `plan.recontribute` tops super up from OUTSIDE savings as non-concessional,
    // so it RAISES the tax-free component but does not by itself shrink the existing
    // taxable component (it is not a cash-out-and-recontribute WITHIN super). Modelling
    // the taxable->tax-free CONVERSION that reduces the death tax is Phase 3 work; here
    // we only assert the tracking recognises the top-up as tax-free.
    const plain = bAt(base, 92);
    const recon: RetirementPlan = { ...base, recontribute: { perYear: 100_000, fromAge: 67, untilAge: 71 } };
    const withRecon = bAt(recon, 92);
    expect(withRecon.superTaxFree ?? 0).toBeGreaterThan(plain.superTaxFree ?? 0);
  });

  it("a downsizer contribution lands as tax-free component", () => {
    // Downsize at 67 frees home equity; the downsizer portion is non-concessional.
    const ds: RetirementPlan = {
      ...base,
      home: { value: 700_000, growthReal: 0, downsize: { atAge: 67, newValue: 400_000, toSuper: 200_000 } },
    };
    const withDs = bAt(ds, 68).superTaxFree ?? 0;
    const noDs = bAt(base, 68).superTaxFree ?? 0;
    expect(withDs).toBeGreaterThan(noDs);
  });

  it("is a PASSIVE tracker: the beneficiary setting never changes the living projection (balances byte-identical)", () => {
    const sig = (p: RetirementPlan) =>
      run(p)
        .map((r) => `${Math.round(r.totalSuper)}|${Math.round(r.outside)}|${Math.round(r.spending)}`)
        .join(",");
    const none = sig(base);
    expect(sig({ ...base, superBeneficiary: "non-dependant" })).toBe(none);
    expect(sig({ ...base, superBeneficiary: "dependant" })).toBe(none);
  });
});

describe("super death-benefit tax — config", () => {
  it("withDefaults backfills the superDeathBenefit block for configs seeded before it existed", () => {
    const legacy = { ...cfg } as Record<string, unknown>;
    delete legacy.superDeathBenefit;
    const restored = withDefaults(legacy as typeof cfg);
    expect(restored.superDeathBenefit).toEqual(cfg.superDeathBenefit);
  });
});
