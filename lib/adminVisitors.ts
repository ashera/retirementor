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
  is_bot: boolean | null;
  bot_reason: string | null;
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
         v.is_bot, v.bot_reason,
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
  total: number; // humans (excludes bots)
  last7Days: number; // human, seen in the last 7 days
  engaged: number; // human, hit at least one milestone
  converted: number; // human, later signed up
  bots: number; // flagged as likely bots
}

/** Headline anonymous-visitor counts for the Users page's Visitors view. Humans and
 *  bots are counted separately so the funnel figures reflect real people. */
export async function getVisitorStats(): Promise<VisitorStats> {
  const r = await query<{
    total: number;
    last7days: number;
    engaged: number;
    converted: number;
    bots: number;
  }>(
    `select
        count(*) filter (where not coalesce(is_bot, false))::int as total,
        count(*) filter (where not coalesce(is_bot, false)
                              and last_seen_at >= now() - interval '7 days')::int as last7days,
        count(*) filter (where not coalesce(is_bot, false)
                              and (set_super_balance or set_budget_income
                                   or visited_what_if or visited_stress_test))::int as engaged,
        count(*) filter (where not coalesce(is_bot, false) and signed_up)::int as converted,
        count(*) filter (where coalesce(is_bot, false))::int as bots
       from visitors`,
  );
  const row = r.rows[0];
  return {
    total: row?.total ?? 0,
    last7Days: row?.last7days ?? 0,
    engaged: row?.engaged ?? 0,
    converted: row?.converted ?? 0,
    bots: row?.bots ?? 0,
  };
}
