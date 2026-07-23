import { describe, it, expect } from "vitest";
import { stressNarrative } from "../lib/au/stressNarrative";
import type { StressEraResult } from "../lib/au/stresstest";

// The narrative only reads a handful of fields; build partial results and cast.
const era = (o: Partial<StressEraResult>): StressEraResult => o as StressEraResult;
// Strip the **bold** markers for plain-content assertions.
const plain = (s: string) => s.replace(/\*\*/g, "");

describe("stressNarrative", () => {
  it("explains a run-out and falls back on the Age Pension (pension-age)", () => {
    const s = plain(
      stressNarrative(
        era({ lasts: false, recovered: false, maxDrawdownPct: 100, minBalance: 0, minAge: 81, finalBalance: 0, depletionAge: 81 }),
        90,
        67,
      ),
    );
    expect(s).toContain("100%");
    expect(s).toContain("$0");
    expect(s).toContain("age 81");
    expect(s).toContain("9 years short of 90");
    expect(s).toContain("Age Pension");
    expect(s).not.toContain("unfunded");
  });

  it("notes the gap before the Age Pension when it runs out early", () => {
    const s = plain(
      stressNarrative(
        era({ lasts: false, recovered: false, maxDrawdownPct: 90, minBalance: 0, minAge: 62, finalBalance: 0, depletionAge: 62 }),
        90,
        67,
      ),
    );
    expect(s).toContain("not starting until 67");
  });

  it("frames a recovered plan as a close call that clawed back", () => {
    const s = plain(
      stressNarrative(
        era({ lasts: false, recovered: true, maxDrawdownPct: 45, minBalance: 20000, minAge: 64, finalBalance: 300000, depletionAge: 64, unfundedYears: 2 }),
        90,
        67,
      ),
    );
    expect(s).toContain("45%");
    expect(s).toContain("$300,000");
    expect(s).toMatch(/clawed back|recovered/);
  });

  it("frames a survivor as outlasting the crash", () => {
    const s = plain(
      stressNarrative(
        era({ lasts: true, maxDrawdownPct: 35, minBalance: 250000, minAge: 72, finalBalance: 800000, cutYears: 0 }),
        90,
        67,
      ),
    );
    expect(s).toContain("35%");
    expect(s).toContain("$800,000");
    expect(s).toContain("outlasts");
  });

  it("wraps the key figures in bold markers", () => {
    const s = stressNarrative(era({ lasts: true, maxDrawdownPct: 35, minBalance: 250000, minAge: 72, finalBalance: 800000, cutYears: 0 }), 90, 67);
    expect(s).toContain("**35%**");
    expect(s).toContain("**$800,000**");
  });
});
