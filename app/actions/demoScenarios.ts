"use server";

import { query } from "@/lib/db";
import { getAdmin } from "@/lib/auth";
import type { RetirementPlan } from "@/lib/au/types";

export interface DemoScenarioRow {
  id: string;
  slug: string;
  title: string;
  blurb: string | null;
  context: string | null;
  thread_url: string | null;
  data: RetirementPlan;
  sort_order: number;
  published: boolean;
  updated_at: string;
}

/** All curated demo scenarios for the backoffice (admin only). Ordered for the
 *  library view; content is authored in code and seeded on deploy. */
export async function listDemoScenarios(): Promise<DemoScenarioRow[]> {
  const admin = await getAdmin();
  if (!admin) return [];
  const r = await query<DemoScenarioRow>(
    `select id, slug, title, blurb, context, thread_url, data, sort_order, published, updated_at
     from demo_scenarios order by sort_order asc, title asc`,
  );
  return r.rows;
}
