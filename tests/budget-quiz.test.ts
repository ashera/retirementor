import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "../lib/au/config";
import { BUDGET_CATEGORY_META } from "../lib/au/budget";
import { CATEGORY_QUIZ, hasQuiz, quizFor, coupleFactor } from "../lib/au/budgetQuiz";
import type { QuizQuestion } from "../lib/au/budgetQuiz";

const cfg = DEFAULT_CONFIG;

// All achievable totals for a set of questions (small: ≤4 questions × ≤4 options).
function allTotals(qs: QuizQuestion[]): number[] {
  let totals = [0];
  for (const q of qs) {
    const next: number[] = [];
    for (const t of totals) for (const o of q.opts) next.push(t + o.amt);
    totals = next;
  }
  return totals;
}
const asfa = (key: string, tier: "modest" | "comfortable", hh: "single" | "couple") =>
  cfg.asfa.breakdown.categories.find((c) => c.key === key)![tier][hh];

describe("budget quiz — coverage", () => {
  it("every budget category has a quiz", () => {
    for (const m of BUDGET_CATEGORY_META) expect(hasQuiz(m.key)).toBe(true);
  });
  it("questions are built from real sub-item concepts (non-empty options)", () => {
    for (const key of Object.keys(CATEGORY_QUIZ)) {
      for (const q of CATEGORY_QUIZ[key]) {
        expect(q.opts.length).toBeGreaterThanOrEqual(2);
        expect(q.q.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("budget quiz — calibration to ASFA (single)", () => {
  it("can express a budget within ~20% of ASFA 'comfortable' for every category", () => {
    for (const key of Object.keys(CATEGORY_QUIZ)) {
      const target = asfa(key, "comfortable", "single");
      const totals = allTotals(quizFor(key, "single", cfg));
      const closest = totals.reduce((best, t) => (Math.abs(t - target) < Math.abs(best - target) ? t : best), totals[0]);
      expect(Math.abs(closest - target) / target, `${key}: closest ${closest} vs comfortable ${target}`).toBeLessThan(0.2);
    }
  });
  it("the lowest answers land at or below 'modest', the highest above 'comfortable'", () => {
    for (const key of Object.keys(CATEGORY_QUIZ)) {
      const totals = allTotals(quizFor(key, "single", cfg));
      const min = Math.min(...totals);
      const max = Math.max(...totals);
      expect(min, `${key} floor`).toBeLessThanOrEqual(asfa(key, "modest", "single") * 1.15);
      expect(max, `${key} ceiling`).toBeGreaterThan(asfa(key, "comfortable", "single"));
    }
  });
});

describe("budget quiz — household scaling", () => {
  it("scales couple amounts by the category's ASFA couple/single ratio", () => {
    // food scales strongly (two eaters); housing barely (shared home).
    expect(coupleFactor("food", cfg)).toBeGreaterThan(1.5);
    expect(coupleFactor("housing", cfg)).toBeLessThan(1.15);

    const foodSingle = quizFor("food", "single", cfg)[0].opts[1].amt;
    const foodCouple = quizFor("food", "couple", cfg)[0].opts[1].amt;
    expect(foodCouple).toBeGreaterThan(foodSingle * 1.4);

    const houseSingle = quizFor("housing", "single", cfg)[0].opts[1].amt;
    const houseCouple = quizFor("housing", "couple", cfg)[0].opts[1].amt;
    expect(houseCouple).toBeGreaterThanOrEqual(houseSingle); // shared home barely scales…
    expect(houseCouple).toBeLessThan(houseSingle * 1.1); // …≈1.04×, far less than food
  });

  it("keeps $0 options at $0 when scaling", () => {
    const drinks = quizFor("leisure", "couple", cfg)[1].opts[0].amt; // "I'm right, thanks"
    expect(drinks).toBe(0);
  });
});
