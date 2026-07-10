"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getCurrentUser, getAdmin } from "@/lib/auth";

export interface WaitlistResult {
  ok?: boolean;
  error?: string;
}

const clip = (s: string | undefined, n: number) => (s || "").trim().slice(0, n) || null;

/** Public: join the adviser early-access waitlist. Attaches the signed-in user
 *  if there is one. */
export async function joinAdviserWaitlist(input: {
  email: string;
  name?: string;
  firm?: string;
  role?: string;
  practiceSize?: string;
  wouldPay?: string;
  message?: string;
}): Promise<WaitlistResult> {
  const email = (input.email || "").trim().toLowerCase();
  if (!email || !email.includes("@") || email.length > 200) {
    return { error: "Please enter a valid email address." };
  }
  const user = await getCurrentUser();
  const ua = ((await headers()).get("user-agent") || "").slice(0, 400) || null;

  await query(
    `insert into adviser_leads (email, name, firm, role, practice_size, would_pay, message, user_id, user_agent)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      email,
      clip(input.name, 120),
      clip(input.firm, 160),
      clip(input.role, 60),
      clip(input.practiceSize, 20),
      clip(input.wouldPay, 40),
      clip(input.message, 2000),
      user?.id ?? null,
      ua,
    ],
  );

  revalidatePath("/admin/advisers");
  return { ok: true };
}

export interface AdviserLead {
  id: string;
  email: string;
  name: string | null;
  firm: string | null;
  role: string | null;
  practice_size: string | null;
  would_pay: string | null;
  message: string | null;
  created_at: string;
}

/** Admin: list waitlist signups (most recent first). */
export async function listAdviserLeads(): Promise<AdviserLead[]> {
  const admin = await getAdmin();
  if (!admin) return [];
  const r = await query<AdviserLead>(
    `select id, email, name, firm, role, practice_size, would_pay, message, created_at
       from adviser_leads order by created_at desc limit 1000`,
  );
  return r.rows;
}

/** Admin: delete a waitlist signup. */
export async function deleteAdviserLead(id: string): Promise<WaitlistResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  await query("delete from adviser_leads where id = $1", [id]);
  revalidatePath("/admin/advisers");
  return { ok: true };
}
