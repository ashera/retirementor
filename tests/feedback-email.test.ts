import { describe, it, expect } from "vitest";
import { feedbackNotificationEmail, feedbackDigestEmail, type FeedbackItem } from "@/lib/feedbackEmail";

const base = { message: "The pension looks too high", from: "guest@example.com (guest)", sentiment: "frustrated", path: "/" };

describe("feedback notification email — scenario link", () => {
  it("includes an 'open scenario' link when a scenario URL is present", () => {
    const url = "https://example.com/admin/feedback/abc123/scenario";
    const mail = feedbackNotificationEmail({ ...base, scenarioUrl: url });
    expect(mail.html).toContain(url);
    expect(mail.html).toContain("Open their scenario");
    expect(mail.text).toContain(`Their scenario: ${url}`);
  });

  it("omits the scenario link when there is none", () => {
    const mail = feedbackNotificationEmail({ ...base, scenarioUrl: null });
    expect(mail.html).not.toContain("Open their scenario");
    expect(mail.text).not.toContain("Their scenario:");
  });

  it("digest cards carry each note's scenario link", () => {
    const items: FeedbackItem[] = [
      { ...base, scenarioUrl: "https://example.com/admin/feedback/one/scenario" },
      { ...base, message: "no scenario here", scenarioUrl: null },
    ];
    const mail = feedbackDigestEmail(items);
    expect(mail.html).toContain("https://example.com/admin/feedback/one/scenario");
    // exactly one card should carry a link
    expect(mail.html.match(/Open their scenario/g)?.length).toBe(1);
  });
});
