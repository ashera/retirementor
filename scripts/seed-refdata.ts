// Seed only the active reference-data version (idempotent). For a full
// schema + seed run use `npm run db:migrate`.
import { Client } from "pg";
import { seedRefData } from "../lib/migrations";
import { sslFor } from "../lib/db";

const url =
  process.env.DATABASE_URL ||
  "postgresql://postgres:password@localhost:5432/financial";

async function main() {
  const c = new Client({ connectionString: url, ssl: sslFor(url) });
  await c.connect();
  try {
    await seedRefData(c);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
