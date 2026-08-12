import { describe, it, expect } from "vitest";
import { confidenceState, safeHeadroom, CONFIDENCE_EPS } from "../lib/au/confidence";

const tiers = { failsafe: 178_000, safe: 214_000, central: 258_000 };

describe("confidenceState", () => {
  it("classifies a goal below the failsafe tier as bulletproof", () => {
    expect(confidenceState(160_000, tiers)).toBe("bulletproof");
    expect(confidenceState(178_000, tiers)).toBe("bulletproof"); // at the boundary
  });

  it("classifies a goal between failsafe and safe as safe", () => {
    expect(confidenceState(196_800, tiers)).toBe("safe");
    expect(confidenceState(214_000, tiers)).toBe("safe"); // at the safe boundary
  });

  it("classifies a goal between safe and central as ambitious", () => {
    expect(confidenceState(240_000, tiers)).toBe("ambitious");
    expect(confidenceState(258_000, tiers)).toBe("ambitious");
  });

  it("classifies a goal above central as short", () => {
    expect(confidenceState(300_000, tiers)).toBe("short");
  });

  it("gives boundaries an epsilon of slack so a rounded goal isn't nudged a band up", () => {
    expect(confidenceState(178_000 + CONFIDENCE_EPS, tiers)).toBe("bulletproof");
    expect(confidenceState(178_000 + CONFIDENCE_EPS + 1, tiers)).toBe("safe");
  });

  it("reports safe headroom (positive when under, negative when over)", () => {
    expect(safeHeadroom(196_800, tiers)).toBe(17_200);
    expect(safeHeadroom(230_000, tiers)).toBe(-16_000);
  });
});
