// Fill visitors.country/region/city for rows captured before IP→geo resolution
// existed (they have an ip but no country). Idempotent — only touches null-country
// rows with a resolvable IP. Shared by scripts/migrate.ts (runs every deploy) and
// scripts/backfill-geo.ts (manual). Uses ./geoLookup directly (no "server-only") so
// it's safe in a plain Node script.
import type { Client } from "pg";
import { lookupGeo } from "./geoLookup";

export async function backfillVisitorGeo(c: Client): Promise<{ updated: number; scanned: number }> {
  const rows = await c.query<{ id: string; ip: string }>(
    "select id, ip from visitors where country is null and ip is not null",
  );
  let updated = 0;
  for (const r of rows.rows) {
    const geo = lookupGeo(r.ip);
    if (!geo?.country) continue;
    await c.query(
      `update visitors
          set country = $2,
              region = coalesce(region, $3),
              city = coalesce(city, $4),
              geo_source = coalesce(geo_source, 'geoip')
        where id = $1`,
      [r.id, geo.country, geo.region, geo.city],
    );
    updated++;
  }
  return { updated, scanned: rows.rows.length };
}
