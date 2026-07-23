// Turn raw analytics event names (+ their props) into plain-language descriptions
// for the visitor activity timeline. Pure so it's easily unit-tested. Page views are
// handled separately in the modal ("Viewed <page>").

type Props = Record<string, unknown> | null | undefined;

function str(p: Props, k: string): string | null {
  const v = p?.[k];
  return v == null || v === "" ? null : String(v);
}

function humanize(event: string): string {
  const t = event.replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : event;
}

// Guided-walkthrough steps, named by what each one covers (see GuidedIntro).
const GUIDE_STEPS: Record<string, string> = {
  "1": "Welcome",
  "2": "About you",
  "3": "On-track check",
  "4": "Super at retirement",
  "5": "Retirement income",
  "6": "Reliability check",
};

// Setup-wizard steps, keyed by the step key fired in the event (see PlanWizard).
const WIZARD_STEPS: Record<string, string> = {
  household: "Your household",
  you: "About you",
  partner: "About your partner",
  contributions: "Extra super contributions",
  outside: "Savings outside super",
  property: "Investment property",
  goal: "Your retirement goal",
  assumptions: "Assumptions",
};

// Friendly description per known event. A function may fold props into the text.
const DESCRIBERS: Record<string, string | ((p: Props) => string)> = {
  "Get started shown": "Saw the get-started screen",
  "Results viewed": "Viewed their projection",
  "Get started: guide": "Chose the guided walkthrough",
  "Get started: wizard": "Chose the quick setup wizard",
  "Guide step": (p) => {
    const s = str(p, "step");
    return `Guided walkthrough — ${(s && GUIDE_STEPS[s]) ?? `step ${s ?? "?"}`}`;
  },
  "Guide completed": "Finished the guided walkthrough",
  "Guide exited to wizard": "Switched from the guide to the wizard",
  "Wizard step": (p) => {
    const k = str(p, "step");
    return `Setup wizard — ${(k && WIZARD_STEPS[k]) ?? k ?? "step"}`;
  },
  "Wizard completed": "Finished the setup wizard",
  "Budget opened": "Opened the budget builder",
  "Plan saved": "Saved their plan",
  "Plan updated": "Updated a saved plan",
  "Spending boosted": "Tried spending more",
  "Year breakdown opened": (p) => {
    const chart = str(p, "chart");
    return chart ? `Opened a year's ${chart} breakdown` : "Opened a year's breakdown";
  },
  "What-if promo clicked": "Clicked the What-If promo",
  "Stress test promo clicked": "Clicked the stress-test promo",
  "Stress test viewed": "Opened the stress test",
  "What-if saved": "Saved a What-If scenario",
  "Compare: saved added": "Added a saved scenario to Compare",
  "Compare: variant added": "Added a what-if variant to Compare",
  "Report printed": "Printed the PDF report",
  "Shared scenario viewed": "Opened a shared scenario link",
  "Adviser waitlist joined": (p) => {
    const role = str(p, "role");
    return role && role !== "unknown" ? `Joined the adviser waitlist (${role})` : "Joined the adviser waitlist";
  },
  stress_cut_detail_open: "Inspected a stress-test shortfall year",
};

export interface EventDescription {
  label: string;
  /** Whether to still surface the raw props line (true only for unmapped events, so
   *  nothing is lost for events we haven't given a friendly description yet). */
  keepProps: boolean;
}

export function describeVisitorEvent(event: string, props: Props): EventDescription {
  const d = DESCRIBERS[event];
  if (typeof d === "function") return { label: d(props), keepProps: false };
  if (typeof d === "string") return { label: d, keepProps: false };
  return { label: humanize(event), keepProps: true };
}
