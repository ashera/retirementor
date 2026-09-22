import "server-only";
import { query } from "./db";
import type { RetirementPlan } from "./au/types";

/** The scenario captured with a feedback note (the composed plan), or null. Used by
 *  the admin-only read-only viewer routes under /admin/feedback/[id]/scenario. */
export async function getFeedbackScenario(id: string): Promise<{ plan: RetirementPlan; name: string } | null> {
  let row: { scenario: RetirementPlan | null; created_at: string } | undefined;
  try {
    const r = await query<{ scenario: RetirementPlan | null; created_at: string }>(
      "select scenario, created_at from feedback where id = $1",
      [id],
    );
    row = r.rows[0];
  } catch {
    return null;
  }
  if (!row || !row.scenario || !Array.isArray(row.scenario.people)) return null;
  const when = new Date(row.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  return { plan: row.scenario, name: `Feedback scenario · ${when}` };
}
