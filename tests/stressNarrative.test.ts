import { describe, it, expect } from "vitest";
import { stressNarrative } from "../lib/au/stressNarrative";
import type { StressEraResult } from "../lib/au/stresstest";

// The narrative only reads a handful of fields; build partial results and cast.
const era = (o: Partial<StressEraResult>): StressEraResult => o as StressEraResult;

describe("stressNarrative", () => {
  it("explains a total run-out with all three figures", () => {
    const s = stressNarrative(
      era({ lasts: false, recovered: false, maxDrawdownPct: 100, minBalance: 0, minAge: 81, finalBalance: 0, depletionAge: 81 }),
      90,
    );
    expect(s).toContain("100%");
    expect(s).toContain("age 81");
    expect(s).toContain("9 years short of 90");
    expect(s).toMatch(/can't absorb|runs dry/);
  });

  it("frames a recovered plan as a close call that clawed back", () => {
    const s = stressNarrative(
      era({ lasts: false, recovered: true, maxDrawdownPct: 45, minBalance: 20000, minAge: 64, finalBalance: 300000, depletionAge: 64, unfundedYears: 2 }),
      90,
    );
    expect(s).toContain("45%");
    expect(s).toContain("$300,000");
    expect(s).toMatch(/clawed back|recovered/);
  });

  it("frames a survivor as outlasting the crash", () => {
    const s = stressNarrative(
      era({ lasts: true, maxDrawdownPct: 35, minBalance: 250000, minAge: 72, finalBalance: 800000, cutYears: 0 }),
      90,
    );
    expect(s).toContain("35%");
    expect(s).toContain("$800,000");
    expect(s).toContain("outlasts");
  });
});
