"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getAdmin } from "@/lib/auth";
import { OUTREACH_ARTICLES, buildPrefilledUrl } from "@/lib/outreachArticles";

export interface OutreachResult {
  ok?: boolean;
  error?: string;
}

/** Admin: edit the values extracted from a post. Cleans them against the article's
 *  field schema, rebuilds the prefilled page link, and keeps the link inside the
 *  draft response in sync. A blank/null field is dropped (the calculator defaults). */
export async function updateOutreachParsed(id: string, values: Record<string, number | null>): Promise<OutreachResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  const r = await query<{ article_slug: string; prefilled_url: string | null; suggested_response: string | null }>(
    "select article_slug, prefilled_url, suggested_response from reddit_outreach where id = $1",
    [id],
  );
  const row = r.rows[0];
  if (!row) return { error: "Not found." };

  const art = OUTREACH_ARTICLES[row.article_slug];
  const clean: Record<string, number> = {};
  if (art) {
    for (const f of art.fields) {
      const v = values[f.key];
      if (typeof v === "number" && Number.isFinite(v) && v >= f.min && v <= f.max) clean[f.key] = Math.round(v);
    }
  }
  const newUrl = buildPrefilledUrl(row.article_slug, clean);
  // Keep the link embedded in the draft response in step with the rebuilt URL.
  let resp = row.suggested_response;
  if (resp && row.prefilled_url && newUrl !== row.prefilled_url) resp = resp.split(row.prefilled_url).join(newUrl);

  await query("update reddit_outreach set parsed = $1, prefilled_url = $2, suggested_response = $3 where id = $4", [
    JSON.stringify(clean),
    newUrl,
    resp,
    id,
  ]);
  revalidatePath("/admin/outreach");
  return { ok: true };
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
