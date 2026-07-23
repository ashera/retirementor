import { fmtCurrency } from "./format";
import type { StressEraResult } from "./stresstest";

/**
 * A plain-English paragraph that ties the three stress-test figures — worst drawdown,
 * lowest balance (and when), and the ending balance — together with what happened in
 * the chart. The key numbers are wrapped in **bold** markers (rendered by the view).
 * When savings run out the Age Pension is a floor, so we never say a retiree is left
 * with literally nothing once they're pension age.
 */
export function stressNarrative(era: StressEraResult, life: number, agePensionAge: number): string {
  const dd = Math.round(era.maxDrawdownPct);
  const low = Math.max(0, Math.round(era.minBalance));
  const end = Math.max(0, Math.round(era.finalBalance));
  const lowStr = fmtCurrency(low);
  const endStr = fmtCurrency(end);

  // Survived to life expectancy.
  if (era.lasts) {
    const trough =
      low > 0
        ? `Your savings dropped **${dd}%** at their lowest, down to **${lowStr}** around age **${era.minAge}**, before recovering`
        : `Your savings dropped **${dd}%** at the low point near age **${era.minAge}** but never ran out`;
    return `The plan rides this one out. ${trough}, and still finished with **${endStr}** at ${life} — the money outlasts the crash.`;
  }

  const yrsShort = life - (era.depletionAge ?? life);
  const shortStr = `**${yrsShort} year${yrsShort === 1 ? "" : "s"} short of ${life}**`;

  // A temporary funding gap (usually the bridge to super) the plan recovered from.
  if (era.recovered) {
    const gap = `**${era.unfundedYears} year${era.unfundedYears === 1 ? "" : "s"}**`;
    return (
      `A close call. Your savings fell **${dd}%** at the worst, bottoming at **${lowStr}** around age **${era.minAge}** — ` +
      `low enough that for ${gap} near age ${era.depletionAge} your accessible savings ran dry before super unlocked, ` +
      `so spending fell short. But the plan clawed back, ending with **${endStr}** at ${life}.`
    );
  }

  // Permanent run-out — the Age Pension is the floor once savings are gone.
  const dep = era.depletionAge ?? life;
  const ageClause =
    dep >= agePensionAge
      ? `From there the Age Pension becomes your main income — a safety net, but well below your target.`
      : `And with the Age Pension not starting until **${agePensionAge}**, there's little to live on until then, then the pension alone after.`;
  return `The plan can't absorb this shock — your own savings fall **${dd}%** to **$0** by age **${dep}**, ${shortStr}. ${ageClause}`;
}
