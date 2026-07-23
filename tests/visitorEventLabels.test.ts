import { describe, it, expect } from "vitest";
import { describeVisitorEvent } from "../lib/visitorEventLabels";

describe("describeVisitorEvent", () => {
  it("gives a friendly, prop-aware label for known events", () => {
    expect(describeVisitorEvent("Get started: guide", null).label).toBe("Chose the guided walkthrough");
    expect(describeVisitorEvent("Guide step", { step: 2, phase: 1 }).label).toBe("Guided walkthrough — About you");
    expect(describeVisitorEvent("Wizard step", { step: "property", index: 4 }).label).toBe(
      "Setup wizard — Investment property",
    );
    expect(describeVisitorEvent("Year breakdown opened", { chart: "income" }).label).toBe(
      "Opened a year's income breakdown",
    );
  });

  it("folds props into the label and hides the raw props line for known events", () => {
    expect(describeVisitorEvent("Guide step", { step: 1 }).keepProps).toBe(false);
  });

  it("humanises an unmapped event and keeps its raw props", () => {
    const d = describeVisitorEvent("some_new_event", { a: 1 });
    expect(d.label).toBe("Some new event");
    expect(d.keepProps).toBe(true);
  });
});
