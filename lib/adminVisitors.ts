import "server-only";
import { query } from "./db";

export interface AdminVisitorRow {
  id: string;
  first_seen_at: string;
  last_seen_at: string;
  visits: number;
  set_super_balance: boolean;
  super_balance: number | null;
  set_budget_income: boolean;
  budget_income: number | null;
  visited_what_if: boolean;
  visited_stress_test: boolean;
  signed_up: boolean;
  converted_user_id: string | null;
  converted_email: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  ip: string | null;
  locale: string | null;
  user_agent: string | null;
}

const VISITOR_SELECT = `
  select v.id, v.first_seen_at, v.last_seen_at, v.visits,
         v.set_super_balance, v.super_balance, v.set_budget_income, v.budget_income,
         v.visited_what_if, v.visited_stress_test, v.signed_up,
         v.converted_user_id, u.email as converted_email,
         v.country, v.region, v.city, v.ip, v.locale, v.user_agent
    from visitors v
    left join users u on u.id = v.converted_user_id`;

export async function listVisitors(limit = 500): Promise<AdminVisitorRow[]> {
  const r = await query<AdminVisitorRow>(
    `${VISITOR_SELECT} order by v.last_seen_at desc limit $1`,
    [limit],
  );
  return r.rows;
}

export interface VisitorStats {
  total: number;
  last7Days: number; // seen in the last 7 days
  engaged: number; // hit at least one milestone
  converted: number; // later signed up
}

/** Headline anonymous-visitor counts for the Users page's Visitors view. */
export async function getVisitorStats(): Promise<VisitorStats> {
  const r = await query<{
    total: number;
    last7days: number;
    engaged: number;
    converted: number;
  }>(
    `select
        count(*)::int as total,
        count(*) filter (where last_seen_at >= now() - interval '7 days')::int as last7days,
        count(*) filter (where set_super_balance or set_budget_income
                              or visited_what_if or visited_stress_test)::int as engaged,
        count(*) filter (where signed_up)::int as converted
       from visitors`,
  );
  const row = r.rows[0];
  return {
    total: row?.total ?? 0,
    last7Days: row?.last7days ?? 0,
    engaged: row?.engaged ?? 0,
    converted: row?.converted ?? 0,
  };
}
