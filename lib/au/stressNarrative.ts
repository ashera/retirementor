import { fmtCurrency } from "./format";
import type { StressEraResult } from "./stresstest";

/**
 * A plain-English paragraph that ties the three stress-test figures — worst drawdown,
 * lowest balance (and when), and the ending balance — together with what actually
 * happened in the chart (the plan lasted, had a temporary gap then recovered, or ran
 * dry). Written so a user understands how the numbers relate, not just what they are.
 */
export function stressNarrative(era: StressEraResult, life: number): string {
  const dd = Math.round(era.maxDrawdownPct);
  const low = Math.max(0, Math.round(era.minBalance));
  const end = Math.max(0, Math.round(era.finalBalance));
  const lowStr = fmtCurrency(low);
  const endStr = fmtCurrency(end);

  // Survived to life expectancy.
  if (era.lasts) {
    const trough =
      low > 0
        ? `At its lowest your savings fell ${dd}% from their peak, dipping to ${lowStr} around age ${era.minAge}, before recovering.`
        : `Your savings dropped ${dd}% at the low point near age ${era.minAge}, but never ran out.`;
    const cut =
      era.cutYears > 0
        ? ` Getting there meant spending below plan for a few years, but the money held.`
        : "";
    return `The plan rides this one out. ${trough} It still finishes with ${endStr} at ${life} — the money outlasts the crash.${cut}`;
  }

  const yrsShort = life - (era.depletionAge ?? life);
  const shortStr = `${yrsShort} year${yrsShort === 1 ? "" : "s"} short of ${life}`;

  // A temporary funding gap (usually the bridge to super) that the plan recovered from.
  if (era.recovered) {
    const gap = `${era.unfundedYears} year${era.unfundedYears === 1 ? "" : "s"}`;
    return (
      `A close call. At its worst your savings fell ${dd}%, bottoming at ${lowStr} around age ${era.minAge} — ` +
      `low enough that for ${gap} near age ${era.depletionAge} your accessible savings ran dry before super unlocked, ` +
      `so spending couldn't be fully covered. But the plan clawed back, ending with ${endStr} at ${life}.`
    );
  }

  // Permanent run-out.
  if (end <= 0 && low <= 0) {
    return (
      `The plan can't absorb this shock. Your savings fall the whole way — a ${dd}% peak-to-trough drop — ` +
      `and are gone by age ${era.depletionAge}, ${shortStr}. With nothing left to draw on, your final years go unfunded.`
    );
  }
  return (
    `The plan runs dry here. Your savings fell ${dd}% at their worst, down to ${lowStr} around age ${era.minAge}, ` +
    `and were exhausted by age ${era.depletionAge} — ${shortStr}, ending with ${endStr}.`
  );
}
