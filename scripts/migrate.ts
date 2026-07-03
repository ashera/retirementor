// Deploy-time database migration. Runs on every Railway deploy via the
// pre-deploy command in railway.json, and locally via `npm run db:migrate`.
// Idempotent: applies the schema and seeds reference data / sources.
import { Client } from "pg";
import { migrate } from "../lib/migrations";
import { sslFor } from "../lib/db";

const url =
  process.env.DATABASE_URL ||
  "postgresql://postgres:password@localhost:5432/financial";

async function main() {
  console.log("Running database migration…");
  const c = new Client({ connectionString: url, ssl: sslFor(url) });
  await c.connect();
  try {
    await migrate(c);
    const t = await c.query(
      "select tablename from pg_tables where schemaname='public' order by tablename",
    );
    console.log("Migration complete. Tables:", t.rows.map((r) => r.tablename).join(", "));
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1); // non-zero aborts the Railway deploy — a bad migration never ships.
});
