import { Client } from "pg";
import { DEFAULT_CONFIG } from "../lib/au/config";
import { PARAM_DESCRIPTORS } from "../lib/au/params";

const url =
  process.env.DATABASE_URL ||
  "postgresql://postgres:password@localhost:5432/financial";

// Per-parameter governance metadata, seeded from the descriptors.
// Deeming parameters are flagged as needing verification (unconfirmed for FY2026-27).
const meta: Record<string, unknown> = {};
for (const d of PARAM_DESCRIPTORS) {
  meta[d.key] = {
    lastVerifiedAt: null,
    verifiedBy: null,
    note: "",
    needsVerification: d.key.startsWith("deeming"),
  };
}

async function main() {
  const c = new Client({ connectionString: url });
  await c.connect();

  const fy = DEFAULT_CONFIG.financialYear;
  const existing = await c.query(
    "select id from ref_data_versions where financial_year = $1",
    [fy],
  );

  if (existing.rows.length) {
    console.log(`Version FY${fy} already exists — leaving it untouched.`);
  } else {
    const r = await c.query(
      `insert into ref_data_versions (financial_year, data, meta, is_active, status, notes)
       values ($1, $2, $3, true, 'active', $4) returning id`,
      [fy, JSON.stringify(DEFAULT_CONFIG), JSON.stringify(meta), "Seeded from code defaults."],
    );
    await c.query(
      `insert into ref_data_audit (version_id, financial_year, action, note)
       values ($1, $2, 'create', 'Seeded active version from code defaults')`,
      [r.rows[0].id, fy],
    );
    console.log(`Seeded active reference-data version FY${fy} (${PARAM_DESCRIPTORS.length} params).`);
  }

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
