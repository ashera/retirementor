import { describe, it, expect } from "vitest";
import { CASE_STUDIES, publishedCaseStudies, caseStudyBySlug } from "../lib/caseStudies";
import { DEMO_SCENARIOS } from "../lib/au/scenarios/demoScenarios";

// The Age Pension case-study page links to demo scenarios by slug and computes their
// figures live. These guard the registry and the cross-references so a rename can't
// silently 404 a case-study link.

describe("Case studies registry", () => {
  it("has unique, URL-safe slugs and required fields", () => {
    const slugs = CASE_STUDIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of CASE_STUDIES) {
      expect(c.slug).toMatch(/^[a-z0-9-]+$/);
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.dek.length).toBeGreaterThan(0);
      expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.readMinutes).toBeGreaterThan(0);
    }
  });

  it("caseStudyBySlug returns only published studies", () => {
    expect(caseStudyBySlug("does-the-age-pension-matter")).toBeTruthy();
    expect(caseStudyBySlug("no-such-study")).toBeUndefined();
    expect(publishedCaseStudies().every((c) => c.published)).toBe(true);
  });

  it("the Age Pension study's scenario references all exist in DEMO_SCENARIOS", () => {
    // These are the slugs the app/case-studies/does-the-age-pension-matter page uses.
    const referenced = ["retire-55-single", "retire-55-couple", "fire-at-45", "fire-at-45-high-spend"];
    const demoSlugs = new Set(DEMO_SCENARIOS.map((s) => s.slug));
    for (const slug of referenced) expect(demoSlugs.has(slug)).toBe(true);
  });
});
