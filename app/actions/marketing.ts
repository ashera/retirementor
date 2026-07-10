"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getAdmin } from "@/lib/auth";

export type AssetKind = "outreach" | "idea" | "snippet" | "link" | "note";

export interface MarketingAsset {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  audience: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssetResult {
  ok?: boolean;
  error?: string;
  id?: string;
}

const clip = (s: string | undefined | null, n: number) => (s || "").trim().slice(0, n) || null;

export interface AssetInput {
  kind?: string;
  title?: string;
  body?: string;
  url?: string;
  audience?: string;
  pinned?: boolean;
}

/** Admin: the whole marketing library — pinned first, then newest. */
export async function listMarketingAssets(): Promise<MarketingAsset[]> {
  const admin = await getAdmin();
  if (!admin) return [];
  const r = await query<MarketingAsset>(
    `select id, kind, title, body, url, audience, pinned, created_at, updated_at
       from marketing_assets order by pinned desc, created_at desc limit 500`,
  );
  return r.rows;
}

/** Admin: add an asset/idea. */
export async function createMarketingAsset(input: AssetInput): Promise<AssetResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  const title = clip(input.title, 200);
  if (!title) return { error: "A title is required." };

  const r = await query<{ id: string }>(
    `insert into marketing_assets (kind, title, body, url, audience, pinned)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [
      clip(input.kind, 20) || "idea",
      title,
      clip(input.body, 20000),
      clip(input.url, 500),
      clip(input.audience, 20),
      !!input.pinned,
    ],
  );
  revalidatePath("/admin/marketing");
  return { ok: true, id: r.rows[0].id };
}

/** Admin: edit an asset in place. */
export async function updateMarketingAsset(id: string, input: AssetInput): Promise<AssetResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  const title = clip(input.title, 200);
  if (!title) return { error: "A title is required." };

  await query(
    `update marketing_assets
        set kind = $2, title = $3, body = $4, url = $5, audience = $6, pinned = $7, updated_at = now()
      where id = $1`,
    [
      id,
      clip(input.kind, 20) || "idea",
      title,
      clip(input.body, 20000),
      clip(input.url, 500),
      clip(input.audience, 20),
      !!input.pinned,
    ],
  );
  revalidatePath("/admin/marketing");
  return { ok: true, id };
}

/** Admin: flip the pinned flag (quick action from the list). */
export async function toggleMarketingPin(id: string, pinned: boolean): Promise<AssetResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  await query("update marketing_assets set pinned = $2, updated_at = now() where id = $1", [id, pinned]);
  revalidatePath("/admin/marketing");
  return { ok: true, id };
}

/** Admin: delete an asset. */
export async function deleteMarketingAsset(id: string): Promise<AssetResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  await query("delete from marketing_assets where id = $1", [id]);
  revalidatePath("/admin/marketing");
  return { ok: true };
}
