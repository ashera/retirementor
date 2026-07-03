import { Client } from "pg";

const url =
  process.env.DATABASE_URL ||
  "postgresql://postgres:password@localhost:5432/financial";

const SQL = `
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table users add column if not exists is_admin boolean not null default false;

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token text unique not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

const c = new Client({ connectionString: url });
await c.connect();
await c.query(SQL);
const t = await c.query(
  "select tablename from pg_tables where schemaname='public' order by tablename",
);
console.log("Schema applied. Tables:", t.rows.map((r) => r.tablename).join(", "));
await c.end();
