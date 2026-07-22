// One-off: fill `visitors.country/region/city` for rows captured before IP→geo
// resolution existed (they have an ip but no country). Idempotent — safe to re-run.
// Usage: npx tsx scripts/backfill-geo.ts   (uses DATABASE_URL, else local dev DB)
import { Client } from "pg";
import { sslFor } from "../lib/db";
import { lookupGeo } from "../lib/geo";

const url =
  process.env.DATABASE_URL ||
  "postgresql://postgres:password@localhost:5432/financial";

async function main() {
  const c = new Client({ connectionString: url, ssl: sslFor(url) });
  await c.connect();
  try {
    const rows = await c.query<{ id: string; ip: string }>(
      "select id, ip from visitors where country is null and ip is not null",
    );
    let updated = 0;
    for (const r of rows.rows) {
      const geo = lookupGeo(r.ip);
      if (!geo?.country) continue;
      await c.query(
        "update visitors set country = $2, region = coalesce(region, $3), city = coalesce(city, $4) where id = $1",
        [r.id, geo.country, geo.region, geo.city],
      );
      updated++;
    }
    console.log(`Backfilled ${updated} of ${rows.rows.length} visitor row(s) with a resolvable IP.`);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
