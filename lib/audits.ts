import { query } from "@/lib/db";

export interface AuditRun {
  id: string;
  title: string;
  standard: string | null;
  build: string | null;
  ran_at: string;
  report_md: string | null;
  high: number;
  med: number;
  low: number;
  status: string; // open | in_progress | actioned
  notes: string | null;
  share_token: string | null;
}

export interface AuditFinding {
  id: string;
  ref: string | null;
  quote: string | null;
  category: string | null;
  severity: string; // high | med | low
  suggestion: string | null;
  status: string; // open | fixed | accepted
  sort: number;
}

const RUN_COLS =
  "id, title, standard, build, ran_at, report_md, high, med, low, status, notes, share_token";

/** All audit runs, newest first (with a resolved-findings count for the list). */
export async function listAudits(): Promise<(AuditRun & { total: number; resolved: number })[]> {
  const r = await query<AuditRun & { total: number; resolved: number }>(
    `select a.id, a.title, a.standard, a.build, a.ran_at, a.report_md,
            a.high, a.med, a.low, a.status, a.notes,
            count(f.id)::int as total,
            count(f.id) filter (where f.status <> 'open')::int as resolved
       from compliance_audits a
       left join compliance_findings f on f.audit_id = a.id
      group by a.id
      order by a.ran_at desc`,
  );
  return r.rows;
}

/** One audit run with its findings, or null. */
export async function getAudit(
  id: string,
): Promise<{ audit: AuditRun; findings: AuditFinding[] } | null> {
  const a = await query<AuditRun>(`select ${RUN_COLS} from compliance_audits where id = $1`, [id]);
  if (!a.rows[0]) return null;
  return { audit: a.rows[0], findings: await findingsFor(id) };
}

/** One audit run by its public share token (unauthenticated), or null. */
export async function getAuditByToken(
  token: string,
): Promise<{ audit: AuditRun; findings: AuditFinding[] } | null> {
  const a = await query<AuditRun>(`select ${RUN_COLS} from compliance_audits where share_token = $1`, [token]);
  if (!a.rows[0]) return null;
  return { audit: a.rows[0], findings: await findingsFor(a.rows[0].id) };
}

async function findingsFor(auditId: string): Promise<AuditFinding[]> {
  const f = await query<AuditFinding>(
    `select id, ref, quote, category, severity, suggestion, status, sort
       from compliance_findings where audit_id = $1
      order by (case severity when 'high' then 0 when 'med' then 1 else 2 end), sort`,
    [auditId],
  );
  return f.rows;
}
