"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { RetirementPlan } from "@/lib/au/types";

export interface SavedPlan {
  id: string;
  name: string;
  data: RetirementPlan;
  updated_at: string;
}

export interface ActionResult {
  ok?: boolean;
  error?: string;
}

export async function listPlans(): Promise<SavedPlan[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const r = await query<SavedPlan>(
    "select id, name, data, updated_at from plans where user_id = $1 order by updated_at desc",
    [user.id],
  );
  return r.rows;
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

  await query(
    "insert into plans (user_id, name, data) values ($1, $2, $3)",
    [user.id, trimmed, JSON.stringify(data)],
  );
  revalidatePath("/");
  return { ok: true };
}

export async function deletePlan(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  await query("delete from plans where id = $1 and user_id = $2", [id, user.id]);
  revalidatePath("/");
  return { ok: true };
}
