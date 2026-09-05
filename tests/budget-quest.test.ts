import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "../lib/au/config";
import { budgetTotal } from "../lib/au/budget";
import {
  budgetTier,
  sustainabilityVerdict,
  computeBadges,
  bertLine,
  questPlanFromInputs,
} from "../lib/au/budgetQuest";

const cfg = DEFAULT_CONFIG;

describe("budget quest — lifestyle tier", () => {
  it("classifies against the ASFA single standards", () => {
    const modest = cfg.asfa.modest.single;
    const comfortable = cfg.asfa.comfortable.single;
    expect(budgetTier(modest - 5_000, "single", cfg).tier).toBe("below");
    expect(budgetTier(modest + 1_000, "single", cfg).tier).toBe("modest");
    expect(budgetTier(comfortable + 1_000, "single", cfg).tier).toBe("comfortable");
    expect(budgetTier(comfortable * 1.5, "single", cfg).tier).toBe("premium");
  });

  it("indexes 0..3 for the four-segment meter, monotonic in spend", () => {
    expect(budgetTier(10_000, "single", cfg).index).toBe(0);
    expect(budgetTier(cfg.asfa.comfortable.couple * 2, "couple", cfg).index).toBe(3);
    const a = budgetTier(30_000, "single", cfg).index;
    const b = budgetTier(60_000, "single", cfg).index;
    const c = budgetTier(120_000, "single", cfg).index;
    expect(a).toBeLessThanOrEqual(b);
    expect(b).toBeLessThanOrEqual(c);
  });

  it("uses higher couple thresholds than single", () => {
    expect(budgetTier(cfg.asfa.comfortable.single + 1_000, "couple", cfg).tier).not.toBe("comfortable");
  });
});

describe("budget quest — sustainability verdict", () => {
  it("is good only when it lasts AND confidence is high", () => {
    expect(sustainabilityVerdict(true, 0.9).status).toBe("good");
    expect(sustainabilityVerdict(true, 0.7).status).toBe("warn");
    expect(sustainabilityVerdict(false, 0.9).status).toBe("warn"); // confidence high but central path fails → not "good"
    expect(sustainabilityVerdict(false, 0.3).status).toBe("bad");
  });
});

describe("budget quest — badges", () => {
  it("rewards smart states, never spend size; downturn badge stays locked without a stress result", () => {
    const b = computeBadges({ tierIndex: 2, lastsToLE: true, confidence: 0.9 });
    const by = Object.fromEntries(b.map((x) => [x.id, x.earned]));
    expect(by.comfortable).toBe(true);
    expect(by.funded).toBe(true);
    expect(by.confident).toBe(true);
    expect(by.downturn).toBe(false); // Phase 3, no stress result supplied
  });

  it("locks the comfortable badge below the comfortable tier", () => {
    const b = computeBadges({ tierIndex: 1, lastsToLE: true, confidence: 0.9 });
    expect(b.find((x) => x.id === "comfortable")!.earned).toBe(false);
  });
});

describe("budget quest — Bert's guidance", () => {
  it("points at a lever (never shames) when the budget runs short", () => {
    const line = bertLine({ status: "bad", tier: "comfortable", headroom: -20_000 });
    expect(line.toLowerCase()).toMatch(/downsiz|age pension|trim|ease/);
  });
  it("celebrates a sustainable premium lifestyle", () => {
    expect(bertLine({ status: "good", tier: "premium", headroom: 0 })).toMatch(/lasts|holds/i);
  });
});

describe("budget quest — standalone plan builder", () => {
  it("builds an engine-valid plan retiring now on the given super", () => {
    const p = questPlanFromInputs({ household: "single", superBalance: 600_000, retirementAge: 65 });
    expect(p.household).toBe("single");
    expect(p.retirementAge).toBe(65);
    expect(p.people[0].currentAge).toBe(65); // models AT retirement — pure drawdown check
    expect(p.people[0].superBalance).toBe(600_000);
  });

  it("splits super across a couple", () => {
    const p = questPlanFromInputs({ household: "couple", superBalance: 800_000, retirementAge: 67 });
    expect(p.people).toHaveLength(2);
    expect(p.people[0].superBalance).toBe(400_000);
    expect(p.people[1].superBalance).toBe(400_000);
  });
});
