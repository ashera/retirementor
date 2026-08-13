"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

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

const SEVERITIES = new Set(["high", "med", "low"]);
const FINDING_STATUS = new Set(["open", "fixed", "accepted"]);
const RUN_STATUS = new Set(["open", "in_progress", "actioned"]);

export interface NewAuditInput {
  title: string;
  standard?: string;
  build?: string;
  status?: string;
  report_md?: string;
  /** One finding per line: `severity | ref | category | quote | suggestion`. */
  findingsText?: string;
}

interface ParsedFinding {
  severity: string;
  ref: string | null;
  category: string | null;
  quote: string | null;
  suggestion: string | null;
}

/** Parse the pasted findings block into rows; unknown severities default to 'med'. */
function parseFindings(text: string): ParsedFinding[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [sevRaw = "", ref = "", category = "", quote = "", ...rest] = line.split("|").map((c) => c.trim());
      const sev = sevRaw.toLowerCase();
      return {
        severity: SEVERITIES.has(sev) ? sev : "med",
        ref: ref || null,
        category: category || null,
        quote: quote || null,
        suggestion: rest.join(" | ").trim() || null,
      };
    });
}

/** Create a new audit run and its findings (admin only). */
export async function createAudit(input: NewAuditInput): Promise<Result> {
  const gate = await requireAdmin();
  if ("error" in gate) return { error: gate.error };

  const title = input.title.trim();
  if (!title) return { error: "Title is required." };
  const status = input.status && RUN_STATUS.has(input.status) ? input.status : "open";
  const findings = parseFindings(input.findingsText ?? "");
  const high = findings.filter((f) => f.severity === "high").length;
  const med = findings.filter((f) => f.severity === "med").length;
  const low = findings.filter((f) => f.severity === "low").length;

  const ins = await query<{ id: string }>(
    `insert into compliance_audits (title, standard, build, report_md, high, med, low, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [
      title,
      input.standard?.trim() || null,
      input.build?.trim() || null,
      input.report_md?.trim() || null,
      high,
      med,
      low,
      status,
    ],
  );
  const id = ins.rows[0]?.id;
  if (!id) return { error: "Couldn't create the audit." };

  const order: Record<string, number> = { high: 0, med: 1, low: 2 };
  let sort = 0;
  for (const f of findings.sort((a, b) => order[a.severity] - order[b.severity])) {
    await query(
      `insert into compliance_findings (audit_id, ref, quote, category, severity, suggestion, sort)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [id, f.ref, f.quote, f.category, f.severity, f.suggestion, sort++],
    );
  }

  revalidatePath("/admin/audits");
  return { ok: true, id };
}

/** Set a finding's remediation status (open | fixed | accepted). */
export async function setFindingStatus(id: string, status: string): Promise<Result> {
  const gate = await requireAdmin();
  if ("error" in gate) return { error: gate.error };
  if (!FINDING_STATUS.has(status)) return { error: "Invalid status." };
  const r = await query<{ audit_id: string }>(
    `update compliance_findings set status = $1, updated_at = now() where id = $2 returning audit_id`,
    [status, id],
  );
  if (!r.rowCount) return { error: "Finding not found." };
  revalidatePath(`/admin/audits/${r.rows[0].audit_id}`);
  revalidatePath("/admin/audits");
  return { ok: true };
}

/** Set the run's overall status (open | in_progress | actioned). */
export async function setAuditStatus(id: string, status: string): Promise<Result> {
  const gate = await requireAdmin();
  if ("error" in gate) return { error: gate.error };
  if (!RUN_STATUS.has(status)) return { error: "Invalid status." };
  await query(`update compliance_audits set status = $1, updated_at = now() where id = $2`, [status, id]);
  revalidatePath(`/admin/audits/${id}`);
  revalidatePath("/admin/audits");
  return { ok: true };
}

export async function deleteAudit(id: string): Promise<Result> {
  const gate = await requireAdmin();
  if ("error" in gate) return { error: gate.error };
  await query("delete from compliance_audits where id = $1", [id]);
  revalidatePath("/admin/audits");
  return { ok: true };
}

/** Mint (or reuse) a public read-only share token for the report at /audit/<token>. */
export async function createAuditShareLink(id: string): Promise<{ token?: string; error?: string }> {
  const gate = await requireAdmin();
  if ("error" in gate) return { error: gate.error };
  const existing = await query<{ share_token: string | null }>(
    "select share_token from compliance_audits where id = $1",
    [id],
  );
  if (!existing.rows[0]) return { error: "Audit not found." };
  const current = existing.rows[0].share_token;
  if (current) return { token: current };
  const token = randomBytes(24).toString("base64url"); // ~32 URL-safe chars, unguessable
  await query("update compliance_audits set share_token = $1 where id = $2", [token, id]);
  revalidatePath(`/admin/audits/${id}`);
  return { token };
}

/** Revoke the public share link (the /audit/<token> URL stops working). */
export async function revokeAuditShareLink(id: string): Promise<Result> {
  const gate = await requireAdmin();
  if ("error" in gate) return { error: gate.error };
  await query("update compliance_audits set share_token = null where id = $1", [id]);
  revalidatePath(`/admin/audits/${id}`);
  return { ok: true };
}
