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
