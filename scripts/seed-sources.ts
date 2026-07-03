import { Client } from "pg";
import { SOURCE_SEEDS } from "../lib/au/sources";

const url =
  process.env.DATABASE_URL ||
  "postgresql://postgres:password@localhost:5432/financial";

async function main() {
  const c = new Client({ connectionString: url });
  await c.connect();
  let inserted = 0;
  for (const s of SOURCE_SEEDS) {
    // Insert if new; never clobber admin-managed attributes on re-seed.
    const r = await c.query(
      `insert into sources (key, name, organisation, url, update_frequency, review_interval_days, description)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (key) do update
         set review_interval_days = coalesce(sources.review_interval_days, excluded.review_interval_days)`,
      [s.key, s.name, s.organisation, s.url, s.updateFrequency, s.reviewIntervalDays, s.description],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(
    `Sources upserted: ${SOURCE_SEEDS.length} total (review intervals backfilled where missing; other attributes preserved).`,
  );
  void inserted;
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
