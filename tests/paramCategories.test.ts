import { describe, it, expect } from "vitest";
import { PARAM_DESCRIPTORS, PARAM_CATEGORIES } from "../lib/au/params";

// The Parameters admin page renders one section per PARAM_CATEGORIES entry and
// filters descriptors into it. A descriptor whose category isn't listed is silently
// dropped (it once happened to the "Outside super" params — invisible on Parameters
// yet still counted on Sources). Guard both directions.
describe("PARAM_CATEGORIES", () => {
  it("includes every category used by a descriptor (none silently hidden)", () => {
    const used = [...new Set(PARAM_DESCRIPTORS.map((d) => d.category))];
    const missing = used.filter((c) => !PARAM_CATEGORIES.includes(c));
    expect(missing).toEqual([]);
  });

  it("has no empty category (every listed category has descriptors)", () => {
    const used = new Set(PARAM_DESCRIPTORS.map((d) => d.category));
    const empty = PARAM_CATEGORIES.filter((c) => !used.has(c));
    expect(empty).toEqual([]);
  });
});
