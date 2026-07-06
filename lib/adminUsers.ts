import "server-only";
import { query } from "./db";

export interface AdminUserRow {
  id: string;
  email: string;
  is_admin: boolean;
  suspended: boolean;
  created_at: string;
  last_login_at: string | null;
  plan_count: number;
}

export interface AdminUserDetail extends AdminUserRow {
  plans: { id: string; name: string; updated_at: string }[];
  has_draft: boolean;
}

const ROW_SELECT = `
  select u.id, u.email, u.is_admin, u.suspended, u.created_at, u.last_login_at,
         (select count(*)::int from plans p where p.user_id = u.id) as plan_count
    from users u`;

export async function listUsers(): Promise<AdminUserRow[]> {
  const r = await query<AdminUserRow>(`${ROW_SELECT} order by u.created_at desc`);
  return r.rows;
}

export async function getUserDetail(id: string): Promise<AdminUserDetail | null> {
  try {
    const u = await query<AdminUserRow>(`${ROW_SELECT} where u.id = $1`, [id]);
    const user = u.rows[0];
    if (!user) return null;
    const plans = await query<{ id: string; name: string; updated_at: string }>(
      "select id, name, updated_at from plans where user_id = $1 order by updated_at desc",
      [id],
    );
    const draft = await query<{ exists: boolean }>(
      "select exists(select 1 from plan_drafts where user_id = $1) as exists",
      [id],
    );
    return { ...user, plans: plans.rows, has_draft: draft.rows[0]?.exists ?? false };
  } catch {
    // Invalid uuid or missing → treat as not found.
    return null;
  }
}
