// Single source of truth for the database schema and idempotent seed data.
// Imported by scripts/migrate.ts (run on every deploy) and the granular
// seed scripts. Every statement here MUST be safe to run repeatedly.
import type { Client } from "pg";
import { DEFAULT_CONFIG } from "./au/config";
import { PARAM_DESCRIPTORS } from "./au/params";
import { SOURCE_SEEDS } from "./au/sources";

export const SCHEMA_SQL = `
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table users add column if not exists is_admin boolean not null default false;
alter table users add column if not exists suspended boolean not null default false;
alter table users add column if not exists last_login_at timestamptz;
-- Google sign-in (OAuth). google_sub = Google's stable per-user id; name/avatar
-- from the profile. password_hash becomes nullable so a Google-only account
-- (never set a password) is valid. NULL google_subs are allowed to repeat
-- (unique index treats NULLs as distinct), so password-only users are unaffected.
alter table users add column if not exists google_sub text;
alter table users add column if not exists name text;
alter table users add column if not exists avatar_url text;
alter table users alter column password_hash drop not null;
create unique index if not exists users_google_sub_idx on users (google_sub);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token text unique not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- One-time password-reset tokens (only the sha256 hash is stored, never the raw
-- token), with a short expiry. Cleared per-user when a new one is requested.
create table if not exists password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_resets_token_hash_idx on password_resets (token_hash);

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One auto-saved working draft per user, so unsaved work survives across
-- devices and cleared browser storage (upserted on the user_id primary key).
create table if not exists plan_drafts (
  user_id uuid primary key references users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Free-form user feedback from the floating widget. user_id is kept if they were
-- signed in (set null if the account is later deleted); email is an optional
-- reply-to they can leave. handled = an admin has actioned/triaged it.
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  email text,
  sentiment text,            -- love | ok | frustrated (optional)
  message text not null,
  path text,                 -- page they were on when they submitted
  user_agent text,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);
-- notified_at: when this row was included in a digest email to the team (null =
-- still pending notification). Drives the debounced batch notifier.
alter table feedback add column if not exists notified_at timestamptz;
create index if not exists feedback_created_idx on feedback (created_at desc);
create index if not exists feedback_unnotified_idx on feedback (created_at) where notified_at is null;

-- Adviser / accountant early-access waitlist — demand validation for a B2B
-- (client-facing modelling) offering. Captured from the /for-advisers page.
create table if not exists adviser_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  firm text,
  role text,              -- financial adviser | accountant | mortgage broker | other
  practice_size text,     -- solo | 2-5 | 6-20 | 20+
  would_pay text,         -- rough willingness-to-pay signal
  message text,
  user_id uuid references users(id) on delete set null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists adviser_leads_created_idx on adviser_leads (created_at desc);

-- Effective-dated reference-data versions (one per financial year).
create table if not exists ref_data_versions (
  id uuid primary key default gen_random_uuid(),
  financial_year text unique not null,
  data jsonb not null,          -- the full EngineConfig
  meta jsonb not null default '{}'::jsonb,  -- per-param governance (source, lastVerifiedAt, ...)
  is_active boolean not null default false,
  status text not null default 'draft',
  notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one active version at a time.
create unique index if not exists ref_data_one_active on ref_data_versions (is_active) where is_active;

-- First-class reference-data sources.
create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  organisation text,
  url text,
  description text,
  update_frequency text,
  review_interval_days int,      -- days before the source is considered stale (null = no schedule)
  last_updated_from date,        -- when we last refreshed our data from this source
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table sources add column if not exists review_interval_days int;

-- Append-only change history for reference data (and sources).
create table if not exists ref_data_audit (
  id uuid primary key default gen_random_uuid(),
  version_id uuid references ref_data_versions(id) on delete cascade,
  financial_year text,
  param_key text,
  source_key text,
  action text not null,          -- edit | verify | create | activate | note | source_edit | source_update
  old_value text,
  new_value text,
  note text,
  changed_by uuid references users(id),
  changed_by_email text,
  changed_at timestamptz not null default now()
);
alter table ref_data_audit add column if not exists source_key text;

-- Test suite tracking: one row per run, one row per test.
create table if not exists test_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz,
  finished_at timestamptz,
  total int not null default 0,
  passed int not null default 0,
  failed int not null default 0,
  skipped int not null default 0,
  duration_ms int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists test_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references test_runs(id) on delete cascade,
  area text not null,
  name text not null,
  status text not null,        -- passed | failed | skipped
  duration_ms int not null default 0,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists sessions_token_idx on sessions(token);
create index if not exists plans_user_idx on plans(user_id);
create index if not exists ref_audit_version_idx on ref_data_audit(version_id, changed_at desc);
create index if not exists test_results_run_idx on test_results(run_id, area);
`;

/** Apply the schema. Safe to run repeatedly. */
export async function applySchema(c: Client): Promise<void> {
  await c.query(SCHEMA_SQL);
}

/**
 * Seed the active reference-data version from code defaults, but only if a
 * version for this financial year doesn't already exist — never clobbers
 * admin edits made through the backoffice.
 */
export async function seedRefData(c: Client): Promise<void> {
  const meta: Record<string, unknown> = {};
  for (const d of PARAM_DESCRIPTORS) {
    meta[d.key] = {
      lastVerifiedAt: null,
      verifiedBy: null,
      note: "",
      needsVerification: d.key.startsWith("deeming"),
    };
  }

  const fy = DEFAULT_CONFIG.financialYear;
  const existing = await c.query(
    "select id from ref_data_versions where financial_year = $1",
    [fy],
  );

  if (existing.rows.length) {
    console.log(`  ref-data: FY${fy} already present — left untouched.`);
    return;
  }

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
  console.log(`  ref-data: seeded active version FY${fy} (${PARAM_DESCRIPTORS.length} params).`);
}

/**
 * Upsert the reference-data sources. Inserts new sources and backfills the
 * review interval where missing; never clobbers other admin-managed attributes.
 */
export async function seedSources(c: Client): Promise<void> {
  for (const s of SOURCE_SEEDS) {
    await c.query(
      `insert into sources (key, name, organisation, url, update_frequency, review_interval_days, description)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (key) do update
         set review_interval_days = coalesce(sources.review_interval_days, excluded.review_interval_days)`,
      [s.key, s.name, s.organisation, s.url, s.updateFrequency, s.reviewIntervalDays, s.description],
    );
  }
  console.log(`  sources: upserted ${SOURCE_SEEDS.length} (review intervals backfilled, other attributes preserved).`);
}

/** Run the full idempotent migration: schema + all seeds. */
export async function migrate(c: Client): Promise<void> {
  await applySchema(c);
  console.log("  schema: applied.");
  await seedRefData(c);
  await seedSources(c);
}
