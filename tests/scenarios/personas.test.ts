import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG as cfg } from "../../lib/au/config";
import { evaluatePersonas } from "../../lib/au/scenarios/personas";

// Data-driven: each persona's checkpoints are re-derived from the independent
// reference (closed-form maths + published Age Pension formula) and compared to
// the engine. The SAME reports drive the auditor-facing /admin/scenarios view,
// so what's asserted here is exactly what's shown there.
for (const report of evaluatePersonas(cfg)) {
  describe(`Scenario — ${report.name}`, () => {
    for (const cp of report.checkpoints) {
      it(`${cp.label} @ ${cp.point} matches the independent reference`, () => {
        expect(
          cp.pass,
          `${cp.label}: expected ${cp.expected} (${cp.source}), engine gave ${cp.actual}`,
        ).toBe(true);
      });
    }
  });
}
