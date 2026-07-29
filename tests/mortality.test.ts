import { describe, it, expect } from "vitest";
import { survivalCurve, householdSurvival, lifeExpectancy } from "../lib/au/mortality";
import { survivalLens } from "../lib/au/survivalLens";
import type { MonteCarloResult } from "../lib/au/montecarlo";

const at = (c: { age: number; p: number }[], age: number) => c.find((p) => p.age === age)!.p;

describe("mortality — calibrated to ABS Australian Life Tables 2020-22", () => {
  it("reproduces e65 (male 20.3, female 22.9)", () => {
    expect(lifeExpectancy(65, "male")).toBeCloseTo(20.3, 1);
    expect(lifeExpectancy(65, "female")).toBeCloseTo(22.9, 1);
  });
  it("survival is monotone decreasing from 1 and ~0 in the deep tail", () => {
    const c = survivalCurve(65, "male");
    expect(c[0].p).toBe(1);
    for (let i = 1; i < c.length; i++) expect(c[i].p).toBeLessThanOrEqual(c[i - 1].p + 1e-12);
    expect(c[c.length - 1].p).toBeLessThan(0.02);
  });
  it("females outlive males; unset sex sits between (blended)", () => {
    const m = at(survivalCurve(65, "male"), 90);
    const f = at(survivalCurve(65, "female"), 90);
    const blended = at(survivalCurve(65), 90);
    expect(f).toBeGreaterThan(m);
    expect(blended).toBeGreaterThan(m);
    expect(blended).toBeLessThan(f);
  });
  it("household (last-survivor) outlives either partner alone", () => {
    const male = at(survivalCurve(65, "male"), 92);
    const female = at(survivalCurve(65, "female"), 92);
    const couple = at(householdSurvival([{ currentAge: 65, sex: "male" }, { currentAge: 65, sex: "female" }]), 92);
    expect(couple).toBeGreaterThan(Math.max(male, female));
  });
});

describe("survival lens — Rich, Broke or Dead", () => {
  const survival = survivalCurve(65, "male");
  const mkMC = (depletionAges: number[], iterations = 1000): MonteCarloResult => ({
    iterations,
    successRate: 1 - depletionAges.length / iterations,
    fan: [],
    medianDepletionAge: null,
    worstCaseDepletionAge: null,
    depletionAges,
    centralTerminalBalance: 0,
    medianTerminalBalance: 0,
    aheadRate: 0,
  });

  it("the three bands sum to 1 at every age", () => {
    const lens = survivalLens(mkMC([80, 85, 90, 95]), survival);
    for (const p of lens.points) expect(p.dead + p.broke + p.solvent).toBeCloseTo(1, 6);
  });
  it("mortality-weighted risk ≤ the raw shortfall rate, and lower the later you'd run out", () => {
    const early = survivalLens(mkMC(Array(100).fill(72)), survival); // 10% fail at 72
    const late = survivalLens(mkMC(Array(100).fill(96)), survival); //  10% fail at 96
    expect(early.fixedFailRate).toBeCloseTo(0.1, 6);
    expect(early.outliveMoneyRisk).toBeLessThanOrEqual(early.fixedFailRate + 1e-9);
    expect(late.outliveMoneyRisk).toBeLessThan(early.outliveMoneyRisk); // more likely dead first → discounted more
  });
  it("no failures → zero chance of outliving your money", () => {
    expect(survivalLens(mkMC([]), survival).outliveMoneyRisk).toBe(0);
  });
});
