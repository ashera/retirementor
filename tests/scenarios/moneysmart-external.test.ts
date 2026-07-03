import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { DEFAULT_CONFIG as cfg } from "../../lib/au/config";
import { MS_POINTS, computeAppPoints, type MsCheck } from "../../lib/au/scenarios/moneysmart";

// External oracle: assert the engine stays within tolerance of values transcribed
// from Moneysmart (ASIC's independent government calculator). These fixtures are
// authored in /admin/moneysmart and committed here, so each is a genuine
// third-party regression anchor that catches model drift the analytical
// reference can't (it shares the engine's assumptions).
const checks: MsCheck[] = JSON.parse(
  readFileSync(path.join(process.cwd(), "lib/au/scenarios/moneysmart-fixtures.json"), "utf8"),
);

describe("Moneysmart external oracle", () => {
  if (checks.length === 0) {
    it("no external checks recorded yet — add them in /admin/moneysmart", () => {
      expect(checks).toEqual([]);
    });
  }

  for (const check of checks) {
    describe(check.name, () => {
      const app = computeAppPoints(check.input, cfg);
      for (const cp of check.points) {
        const def = MS_POINTS.find((p) => p.key === cp.key);
        if (!def) continue;
        it(`${def.label} within ${cp.tolerancePct}${def.unit === "money" ? "%" : "yr"} of Moneysmart`, () => {
          const appVal = app[cp.key];
          const diff = Math.abs(cp.moneysmart - appVal);
          const ok =
            def.unit === "age"
              ? diff <= cp.tolerancePct
              : (appVal !== 0 ? (diff / Math.abs(appVal)) * 100 : diff === 0 ? 0 : 999) <= cp.tolerancePct;
          expect(ok, `${def.label}: engine ${appVal} vs Moneysmart ${cp.moneysmart} (Δ ${diff.toFixed(0)})`).toBe(true);
        });
      }
    });
  }
});
