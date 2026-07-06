"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getAdmin } from "@/lib/auth";

export interface UserAdminResult {
  ok?: boolean;
  error?: string;
}

function revalidate(userId?: string) {
  revalidatePath("/admin/users");
  if (userId) revalidatePath(`/admin/users/${userId}`);
}

/** Grant or revoke admin. Can't remove your own admin (avoids lock-out). */
export async function setUserAdmin(userId: string, isAdmin: boolean): Promise<UserAdminResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  if (userId === admin.id && !isAdmin) return { error: "You can't remove your own admin access." };
  await query("update users set is_admin = $1 where id = $2", [isAdmin, userId]);
  revalidate(userId);
  return { ok: true };
}

/** Suspend or reinstate an account. Suspending also revokes their sessions
 *  (immediate sign-out) and blocks future logins. Can't suspend yourself. */
export async function setUserSuspended(userId: string, suspended: boolean): Promise<UserAdminResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  if (userId === admin.id && suspended) return { error: "You can't suspend your own account." };
  await query("update users set suspended = $1 where id = $2", [suspended, userId]);
  if (suspended) await query("delete from sessions where user_id = $1", [userId]);
  revalidate(userId);
  return { ok: true };
}

/** Permanently delete a user and everything they own (plans, drafts, sessions
 *  cascade). Can't delete yourself. */
export async function deleteUser(userId: string): Promise<UserAdminResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  if (userId === admin.id) return { error: "You can't delete your own account." };
  await query("delete from users where id = $1", [userId]);
  revalidatePath("/admin/users");
  return { ok: true };
}
