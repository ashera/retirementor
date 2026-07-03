import type { ReactNode } from "react";

export type TagTone = "accent" | "amber" | "red";

const TONE_CLASS: Record<TagTone, string> = {
  accent: "bg-emerald-500/15 text-emerald-400",
  amber: "bg-amber-500/15 text-amber-400",
  red: "bg-red-500/15 text-red-400",
};

interface StatCardProps {
  label: string;
  value: string;
  unit?: string; // small muted suffix after the value (e.g. "/yr")
  sub?: string;
  subTone?: "muted" | "amber"; // colour of the sub-text (default muted)
  highlight?: boolean;
  tag?: string; // small pill next to the value (e.g. the spending stage)
  tagTone?: TagTone; // colour of the pill (default accent/green)
  tagHref?: string; // if set, the pill becomes a link (e.g. "#likelihood") with a scroll cue
  tagTitle?: string; // hover tooltip for the linked pill
  explainer?: ReactNode; // optional help affordance shown top-right
  action?: ReactNode; // optional action shown under the value (e.g. a builder entry)
}

export default function StatCard({
  label,
  value,
  unit,
  sub,
  subTone = "muted",
  highlight,
  tag,
  tagTone = "accent",
  tagHref,
  tagTitle,
  explainer,
  action,
}: StatCardProps) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight ? "border-accent/40 bg-accent/10" : "border-line bg-panel-2"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">
          {label}
        </div>
        {explainer}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div
          className={`text-2xl font-bold tabular-nums ${
            highlight ? "text-accent" : "text-white"
          }`}
        >
          {value}
          {unit && (
            <span className="ml-0.5 text-sm font-medium text-muted">{unit}</span>
          )}
        </div>
        {tag &&
          (tagHref ? (
            <a
              href={tagHref}
              title={tagTitle ?? "See the breakdown"}
              className={`group inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition hover:brightness-125 ${TONE_CLASS[tagTone]}`}
            >
              {tag}
              <span
                aria-hidden
                className="transition-transform group-hover:translate-y-0.5"
              >
                ↓
              </span>
            </a>
          ) : (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TONE_CLASS[tagTone]}`}
            >
              {tag}
            </span>
          ))}
      </div>
      {sub && (
        <div
          className={`mt-0.5 text-xs ${subTone === "amber" ? "text-amber-400" : "text-muted"}`}
        >
          {sub}
        </div>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
