import "server-only";
import { query } from "./db";

export interface OutreachRow {
  id: string;
  reddit_url: string;
  reddit_title: string | null;
  subreddit: string | null;
  article_slug: string;
  reddit_created_at: string | null;
  fit_score: number;
  matched: string | null;
  parsed: Record<string, unknown> | null;
  prefilled_url: string | null;
  suggested_response: string | null;
  status: string; // new | commented | skipped
  commented_at: string | null;
  created_at: string;
}

/** All outreach leads, newest/best first — un-actioned ('new') on top. */
export async function listOutreach(): Promise<OutreachRow[]> {
  const r = await query<OutreachRow>(
    `select * from reddit_outreach
     order by (status = 'new') desc, fit_score desc, created_at desc
     limit 500`,
  );
  return r.rows;
}

/** Count of leads still to action — drives the admin tab badge. */
export async function countNewOutreach(): Promise<number> {
  try {
    const r = await query<{ n: number }>(`select count(*)::int as n from reddit_outreach where status = 'new'`);
    return Number(r.rows[0]?.n ?? 0);
  } catch {
    return 0; // table not migrated yet
  }
}
