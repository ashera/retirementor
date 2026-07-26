"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { RetirementPlan } from "@/lib/au/types";

export interface SavedPlan {
  id: string;
  name: string;
  data: RetirementPlan;
  updated_at: string;
  share_token: string | null; // set → a public read-only link exists; null → not shared
}

export interface ActionResult {
  ok?: boolean;
  error?: string;
  id?: string; // set by savePlan → the new row's id
}

export async function listPlans(): Promise<SavedPlan[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const r = await query<SavedPlan>(
    "select id, name, data, updated_at, share_token from plans where user_id = $1 order by updated_at desc",
    [user.id],
  );
  return r.rows;
}

/** Create (or return the existing) public read-only share link for a scenario.
 *  The token is a capability: anyone with the link can view the scenario in a
 *  logged-out, preloaded dashboard. Owner-scoped; idempotent (reuses the token). */
export async function createShareLink(id: string): Promise<{ token?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  const existing = await query<{ share_token: string | null }>(
    "select share_token from plans where id = $1 and user_id = $2",
    [id, user.id],
  );
  if (existing.rows.length === 0) return { error: "Scenario not found." };
  const current = existing.rows[0].share_token;
  if (current) return { token: current }; // already shared — keep the same link
  const token = randomBytes(24).toString("base64url"); // ~32 URL-safe chars, unguessable
  await query("update plans set share_token = $1 where id = $2 and user_id = $3", [token, id, user.id]);
  revalidatePath("/");
  return { token };
}

/** Revoke the share link — the public URL stops working immediately. */
export async function revokeShareLink(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  await query("update plans set share_token = null where id = $1 and user_id = $2", [id, user.id]);
  revalidatePath("/");
  return { ok: true };
}

export interface PlanDraft {
  data: RetirementPlan;
  updated_at: string;
}

/** The user's auto-saved working draft (their latest unsaved work), or null. */
export async function getDraft(): Promise<PlanDraft | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const r = await query<PlanDraft>(
    "select data, updated_at from plan_drafts where user_id = $1",
    [user.id],
  );
  return r.rows[0] ?? null;
}

/** Upsert the working draft. Silently no-ops for signed-out users (their work
 *  still lives in localStorage). Called debounced from the client. */
export async function saveDraft(data: RetirementPlan): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: true };
  await query(
    `insert into plan_drafts (user_id, data, updated_at) values ($1, $2, now())
     on conflict (user_id) do update set data = excluded.data, updated_at = now()`,
    [user.id, JSON.stringify(data)],
  );
  return { ok: true };
}

// ── Active scenario (the named plan continuous auto-save targets) ─────────────
// Phase 1 of moving off the throwaway draft: these back the "one active named
// scenario per user" model. Inert until the auto-save rewire (Phase 2) uses them.

/** The user's ACTIVE scenario (the named plan auto-save writes to), or null when
 *  none is set yet (a brand-new or not-yet-migrated user). */
export async function getActivePlan(): Promise<SavedPlan | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const r = await query<SavedPlan>(
    `select p.id, p.name, p.data, p.updated_at, p.share_token
       from users u join plans p on p.id = u.active_plan_id
      where u.id = $1`,
    [user.id],
  );
  return r.rows[0] ?? null;
}

/** Point the user's active scenario at one of their own plans (owner-scoped). */
export async function setActivePlan(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  const r = await query(
    `update users set active_plan_id = p.id
       from plans p
      where users.id = $1 and p.id = $2 and p.user_id = $1`,
    [user.id, id],
  );
  if (!r.rowCount) return { error: "Scenario not found." };
  return { ok: true, id };
}

/** Create a new named scenario and make it the active one (auto-save target).
 *  Used for signup ("My First Scenario") and "New scenario" (a copy of the current). */
export async function createScenario(name: string, data: RetirementPlan): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  const trimmed = name.trim() || "Untitled scenario";
  const r = await query<{ id: string }>(
    "insert into plans (user_id, name, data) values ($1, $2, $3) returning id",
    [user.id, trimmed, JSON.stringify(data)],
  );
  const id = r.rows[0]?.id;
  if (id) await query("update users set active_plan_id = $1 where id = $2", [id, user.id]);
  revalidatePath("/");
  return { ok: true, id };
}

/** Resolve the user's active scenario, migrating on first call (lazy, per-user):
 *   1. already have one → return it;
 *   2. else promote their auto-saved draft to a named scenario (→ "My First
 *      Scenario" if they have no plans yet, else "Working scenario") + set active,
 *      then drop the draft;
 *   3. else adopt their most-recent saved plan as active;
 *   4. else (brand-new, no work) → null; the active scenario is created when they
 *      first configure a plan or on signup.
 *  Returns the active plan, or null. Signed-out → null (guests use localStorage). */
export async function ensureActiveScenario(): Promise<SavedPlan | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const active = await getActivePlan();
  if (active) return active;

  const [draft, plans] = await Promise.all([getDraft(), listPlans()]);
  if (draft) {
    // Inline insert (not createScenario) so this stays revalidatePath-free — it may
    // run during a page render, where revalidate isn't allowed.
    const name = plans.length === 0 ? "My First Scenario" : "Working scenario";
    const ins = await query<{ id: string }>(
      "insert into plans (user_id, name, data) values ($1, $2, $3) returning id",
      [user.id, name, JSON.stringify(draft.data)],
    );
    const id = ins.rows[0]?.id;
    if (id) {
      await query("update users set active_plan_id = $1 where id = $2", [id, user.id]);
      await query("delete from plan_drafts where user_id = $1", [user.id]); // migrated → drop it
      return getActivePlan();
    }
  }
  if (plans.length > 0) {
    await query("update users set active_plan_id = $1 where id = $2", [plans[0].id, user.id]);
    return getActivePlan();
  }
  return null;
}

/** Auto-save target for a signed-in user: their active scenario if they have one,
 *  otherwise create "My First Scenario" from the given data and make it active.
 *  Called on the first auto-save after a fresh signup (promotes the guest's work). */
export async function getOrCreateActiveScenario(data: RetirementPlan): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  const active = await getActivePlan();
  if (active) return { ok: true, id: active.id };
  return createScenario("My First Scenario", data);
}

export async function savePlan(
  name: string,
  data: RetirementPlan,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in to save plans." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give your plan a name." };

  const r = await query<{ id: string }>(
    "insert into plans (user_id, name, data) values ($1, $2, $3) returning id",
    [user.id, trimmed, JSON.stringify(data)],
  );
  revalidatePath("/");
  return { ok: true, id: r.rows[0]?.id };
}

/** Update an existing saved scenario in place (owner-scoped) — for "Save changes"
 *  when the active scenario is already a saved plan. */
export async function updatePlan(
  id: string,
  name: string,
  data: RetirementPlan,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in to save plans." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give your plan a name." };
  const r = await query(
    "update plans set name = $1, data = $2, updated_at = now() where id = $3 and user_id = $4",
    [trimmed, JSON.stringify(data), id, user.id],
  );
  if (!r.rowCount) return { error: "Scenario not found." };
  revalidatePath("/");
  return { ok: true, id };
}

export async function deletePlan(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  await query("delete from plans where id = $1 and user_id = $2", [id, user.id]);
  revalidatePath("/");
  return { ok: true };
}
