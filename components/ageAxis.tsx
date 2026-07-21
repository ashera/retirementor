// Shared dual-age x-axis for couples with an age gap. Charts are indexed by the
// OLDEST person's age (YearRow.age), so for a couple the younger partner's age is a
// fixed offset behind. This renders both on the axis — "You" (person 1) over
// "Partner" (person 2) — with the first tick carrying the row identifiers so it's
// unmistakable which number is whose. Singles and same-age couples are unaffected.

import type { RetirementPlan } from "@/lib/au/types";
import { oldestCurrentAge } from "@/lib/au/types";

export interface AgeGapInfo {
  you0: number; // person 1 (primary) current age
  partner0: number; // person 2 current age
  anchor: number; // oldest current age — the x data is indexed by this
}

/** Non-null only for a couple whose partners are genuinely different ages. */
export function ageGapInfo(plan: RetirementPlan | null | undefined): AgeGapInfo | null {
  if (!plan || plan.household !== "couple" || plan.people.length < 2) return null;
  const you0 = Math.round(plan.people[0].currentAge);
  const partner0 = Math.round(plan.people[1].currentAge);
  if (you0 === partner0) return null;
  return { you0, partner0, anchor: oldestCurrentAge(plan) };
}

/** The two partners' ages at a given oldest-age x value. */
export function agesAt(gap: AgeGapInfo, anchorAge: number): { you: number; partner: number } {
  const t = anchorAge - gap.anchor;
  return { you: Math.round(gap.you0 + t), partner: Math.round(gap.partner0 + t) };
}

/** Tooltip line, e.g. "You 55 · Partner 62". */
export function dualAgeLabel(gap: AgeGapInfo, anchorAge: number): string {
  const { you, partner } = agesAt(gap, anchorAge);
  return `You ${you} · Partner ${partner}`;
}

/**
 * A Recharts XAxis `tick` element. Use as: `tick={<DualAgeTick gap={gap} />}` —
 * Recharts injects x / y / payload / index. Give the XAxis `height={34}` so both
 * rows fit.
 */
export function DualAgeTick(props: {
  x?: number;
  y?: number;
  payload?: { value: number };
  index?: number;
  gap?: AgeGapInfo;
  fill?: string;
}) {
  const { x = 0, y = 0, payload, index, gap, fill = "#8b97ad" } = props;
  if (!gap || !payload) return null;
  const { you, partner } = agesAt(gap, payload.value);
  return (
    <g transform={`translate(${x},${y})`} fill={fill}>
      {/* Row identifiers, once, in the left gutter — numbers stay uniformly centred. */}
      {index === 0 && (
        <>
          <text x={-12} dy={12} textAnchor="end" fontSize={9} opacity={0.85}>You</text>
          <text x={-12} dy={25} textAnchor="end" fontSize={9} opacity={0.55}>Ptnr</text>
        </>
      )}
      <text x={0} dy={12} textAnchor="middle" fontSize={11}>{you}</text>
      <text x={0} dy={25} textAnchor="middle" fontSize={11} opacity={0.72}>{partner}</text>
    </g>
  );
}
