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
