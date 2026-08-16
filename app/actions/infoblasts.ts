"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { listActiveInfoBlasts } from "@/lib/infoBlasts";

export type { InfoBlast } from "@/lib/infoBlasts";

export interface InfoBlastInput {
  id?: string; // set → update; absent → insert
  icon: string;
  title: string;
  subtext: string;
  enabled: boolean;
  sort_order: number;
}

interface Result {
  ok?: boolean;
  error?: string;
  id?: string;
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in required." as const };
  if (!user.is_admin) return { error: "Admin only." as const };
  return { user };
}

/** Enabled blasts for the public hero banner (no auth — read-only announcements). */
export async function getActiveInfoBlasts() {
  try {
    return await listActiveInfoBlasts();
  } catch {
    return []; // never let a banner fetch break the dashboard
  }
}

/** Create or update an InfoBlast (admin only). */
export async function saveInfoBlast(input: InfoBlastInput): Promise<Result> {
  const gate = await requireAdmin();
  if ("error" in gate) return { error: gate.error };

  const title = input.title.trim();
  if (!title) return { error: "Title is required." };
  const icon = (input.icon ?? "").trim();
  const subtext = (input.subtext ?? "").trim();
  const sort = Number.isFinite(input.sort_order) ? Math.round(input.sort_order) : 0;

  if (input.id) {
    const r = await query(
      `update info_blasts set icon=$1, title=$2, subtext=$3, enabled=$4, sort_order=$5, updated_at=now()
       where id=$6`,
      [icon, title, subtext, input.enabled, sort, input.id],
    );
    if (!r.rowCount) return { error: "InfoBlast not found." };
    revalidatePath("/admin/infoblasts");
    revalidatePath("/");
    return { ok: true, id: input.id };
  }

  const r = await query<{ id: string }>(
    `insert into info_blasts (icon, title, subtext, enabled, sort_order)
     values ($1, $2, $3, $4, $5) returning id`,
    [icon, title, subtext, input.enabled, sort],
  );
  revalidatePath("/admin/infoblasts");
  revalidatePath("/");
  return { ok: true, id: r.rows[0]?.id };
}

/** Flip enabled on/off without opening the editor (admin only). */
export async function setInfoBlastEnabled(id: string, enabled: boolean): Promise<Result> {
  const gate = await requireAdmin();
  if ("error" in gate) return { error: gate.error };
  const r = await query(`update info_blasts set enabled=$1, updated_at=now() where id=$2`, [enabled, id]);
  if (!r.rowCount) return { error: "InfoBlast not found." };
  revalidatePath("/admin/infoblasts");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteInfoBlast(id: string): Promise<Result> {
  const gate = await requireAdmin();
  if ("error" in gate) return { error: gate.error };
  await query("delete from info_blasts where id=$1", [id]);
  revalidatePath("/admin/infoblasts");
  revalidatePath("/");
  return { ok: true };
}
