import type { ReactNode } from "react";

// Per-category presentation (accent colour + a one-line reason) shared by the plan
// wizard's overview hub and the assets/liabilities page, so the two read as one system.
export const STEP_META: Record<string, { color: string; desc: string }> = {
  household: { color: "#34d399", desc: "Sets your Age Pension rates and means-test thresholds." },
  you: { color: "#38bdf8", desc: "Your age, super and salary — the starting point." },
  partner: { color: "#818cf8", desc: "Your partner's age, super and salary." },
  contributions: { color: "#fbbf24", desc: "Extra super you add beyond the employer 12%." },
  outside: { color: "#a78bfa", desc: "Savings you can use before super unlocks at 60." },
  property: { color: "#fb923c", desc: "An investment property is counted by the Age Pension." },
  goal: { color: "#fb7185", desc: "When you retire and how much you'll spend." },
  assumptions: { color: "#22d3ee", desc: "Long-run return, inflation and fees." },
};

// Persona silhouette for a person, by sex — reusing the Persona-test avatars. We
// don't know the sex on the Household step, so it defaults to the neutral agent-2;
// You and Partner use different faces so a couple reads as two people.
export function personaAvatarSrc(sex: "male" | "female" | undefined, isPartner: boolean): string {
  if (sex === "male") return `/avatars/agent-${isPartner ? 4 : 0}.jpg`;
  if (sex === "female") return `/avatars/agent-${isPartner ? 3 : 1}.jpg`;
  return "/avatars/agent-2.jpg";
}

export function StepIcon({ stepKey, size = 22 }: { stepKey: string; size?: number }) {
  const color = STEP_META[stepKey]?.color ?? "#94a3b8";
  const paths: Record<string, ReactNode> = {
    household: (<><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v10h13V10" /><path d="M10 20v-5h4v5" /></>),
    you: (<><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></>),
    partner: (<><circle cx="9" cy="8" r="2.6" /><circle cx="16" cy="9" r="2.2" /><path d="M4 20a5 5 0 0 1 10 0" /><path d="M14.5 20a4.2 4.2 0 0 1 5.5-4" /></>),
    contributions: (<><path d="M12 21V7" /><path d="M7 12l5-5 5 5" /><path d="M5 4h14" /></>),
    outside: (<><rect x="3.5" y="7" width="17" height="12" rx="2" /><path d="M3.5 11h17" /><circle cx="16" cy="15" r="1.4" /></>),
    property: (<><path d="M4 21V6l7-3v18" /><path d="M11 21V9l8 3v9" /><path d="M7 9v0M7 13v0M7 17v0M15 14v0M15 18v0" /></>),
    goal: (<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>),
    assumptions: (<><path d="M4 7h10" /><path d="M18 7h2" /><circle cx="16" cy="7" r="2" /><path d="M4 17h2" /><path d="M10 17h10" /><circle cx="8" cy="17" r="2" /></>),
  };
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl"
      style={{ backgroundColor: `${color}1f`, width: size + 18, height: size + 18 }}
      aria-hidden
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        {paths[stepKey] ?? <circle cx="12" cy="12" r="8" />}
      </svg>
    </span>
  );
}
