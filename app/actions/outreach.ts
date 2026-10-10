"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getAdmin } from "@/lib/auth";

export interface OutreachResult {
  ok?: boolean;
  error?: string;
}

const STATUSES = ["new", "commented", "skipped"];

/** Admin: set a lead's status. 'commented' stamps commented_at; others clear it. */
export async function setOutreachStatus(id: string, status: string): Promise<OutreachResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  if (!STATUSES.includes(status)) return { error: "Unknown status." };
  await query(
    `update reddit_outreach
       set status = $1,
           commented_at = case when $1 = 'commented' then now() else null end
     where id = $2`,
    [status, id],
  );
  revalidatePath("/admin/outreach");
  return { ok: true };
}

/** Admin: delete a lead. */
export async function deleteOutreach(id: string): Promise<OutreachResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  await query("delete from reddit_outreach where id = $1", [id]);
  revalidatePath("/admin/outreach");
  return { ok: true };
}
