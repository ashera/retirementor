// Single source of truth for the database schema and idempotent seed data.
// Imported by scripts/migrate.ts (run on every deploy) and the granular
// seed scripts. Every statement here MUST be safe to run repeatedly.
import type { Client } from "pg";
import { DEFAULT_CONFIG } from "./au/config";
import { PARAM_DESCRIPTORS } from "./au/params";
import { SOURCE_SEEDS } from "./au/sources";
import { DEMO_SCENARIOS } from "./au/scenarios/demoScenarios";

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
-- Capability token for a public, read-only share link to this scenario (null =
-- not shared). Anyone with the link can view; the owner revokes by nulling it.
-- ALTER (not part of the create above) so existing databases pick it up too.
alter table plans add column if not exists share_token text;

-- One auto-saved working draft per user, so unsaved work survives across
-- devices and cleared browser storage (upserted on the user_id primary key).
create table if not exists plan_drafts (
  user_id uuid primary key references users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Curated, code-seeded demo scenarios (e.g. reproductions of Reddit FIRE debates)
-- shared publicly at /scenario/<slug>. Not owned by a user; authored in code and
-- upserted by slug on deploy (see seedDemoScenarios). context/thread_url are
-- admin-only notes (which discussion, the claim, our finding).
create table if not exists demo_scenarios (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  blurb text,
  context text,
  thread_url text,
  data jsonb not null,
  sort_order int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
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

-- Marketing assets & ideas library — one findable home for outreach copy, ideas,
-- snippets and links so they're easy to reuse. Seeded once with the adviser
-- outreach kit (see seedMarketingAssets); fully user-editable thereafter.
create table if not exists marketing_assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'idea',   -- outreach | idea | snippet | link | note
  title text not null,
  body text,
  url text,
  audience text,                        -- advisers | consumers | all (optional)
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_assets_pinned_idx on marketing_assets (pinned desc, created_at desc);

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
create index if not exists demo_scenarios_pub_idx on demo_scenarios(published, sort_order);
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

/**
 * Seed the marketing library with the curated starter kit (adviser outreach +
 * consumer/Reddit copy). Idempotent by TITLE: only inserts a curated asset the
 * table doesn't already have, so new seeds ship on deploy without duplicating,
 * and edits to existing seeds are preserved. (An asset the admin deletes will
 * reappear on the next migration — acceptable for a curated starter set.)
 */
export async function seedMarketingAssets(c: Client): Promise<void> {
  const site = "https://www.retirewiz.com.au/for-advisers";
  const home = "https://www.retirewiz.com.au";
  const seeds: { kind: string; title: string; audience: string; pinned: boolean; body: string }[] = [
    {
      kind: "outreach",
      title: "LinkedIn post — advisers (cast a net)",
      audience: "advisers",
      pinned: true,
      body: `I've been building a retirement modelling tool for Australian advisers & accountants, and I want feedback from the people who'd actually use it.

The itch: client-facing retirement modelling is either locked inside heavy, expensive platforms — or done in spreadsheets no client will ever understand. I wanted something you can open in a review meeting and a client immediately gets.

What it does today — all on current AU rules, in today's dollars:
• Super, the means-tested Age Pension (income & assets tests, deeming), early-retirement bridging, fees & tax
• Live "what-if" strategies — downsizing, TTR, salary-sacrifice, part-time work, retiring later — with the impact on balance, income and how long the money lasts, instantly, in the room
• Every assumption on show (returns, tax, thresholds, fees, the Monte Carlo confidence bar), cross-checked against ASIC's Moneysmart so the numbers hold up
• General information only — you give the advice, it does the maths

Coming next, and where I'd love your input: white-label client reports, a "share this scenario with my client" flow, and multi-client management.

I'm opening early access to a first group of practices — founding pricing, and you'll shape what gets built. If you advise on retirement, take a look (and tell me where it's wrong):
👉 ${site}

TIP: post as text (no link preview); drop the URL in the first comment if reach dips. Reply to every comment — the algorithm rewards it.`,
    },
    {
      kind: "outreach",
      title: "LinkedIn DM — advisers (1:1, highest conversion)",
      audience: "advisers",
      pinned: true,
      body: `Hi [First name] — I'm building a retirement & Age Pension modelling tool for AU advisers: current rules, live "what-if" strategies you can run in a client meeting, every assumption transparent, and cross-checked against Moneysmart. General info only — you give the advice.

I'm opening early access to a first group of practices and would genuinely value your take (I want to hear where it's wrong). 20-second waitlist: ${site} — or happy to give you a quick walkthrough. No pitch either way.`,
    },
    {
      kind: "outreach",
      title: "Cold email — advisers",
      audience: "advisers",
      pinned: true,
      body: `SUBJECT LINES (A/B test):
- Retirement modelling your clients would actually understand
- Early access: an AU retirement modeller for advisers
- Would this be useful in your review meetings?

BODY:
Hi [First name],

Quick one — I'm building a retirement & Age Pension modelling tool for Australian advisers, and I'm looking for a first group of practices to shape it.

The gap I kept hitting: client-facing modelling is either buried in heavy platforms or done in spreadsheets clients don't follow. I wanted something you can open in a review and a client immediately gets.

What it does today — on current AU rules, in today's dollars:
- Super, the means-tested Age Pension (income & assets tests, deeming), early-retirement bridging, fees & tax
- Live strategies — downsize, TTR, salary-sacrifice, part-time, retire later — showing the impact on balance, income and how long the money lasts, instantly
- Every assumption on show, cross-checked against ASIC's Moneysmart. General information only — you give the advice.

Coming next (your input welcome): white-label client reports, share-with-client, and multi-client.

If it sounds useful — early access + founding pricing here: ${site} — or just reply and I'll give you a 10-minute walkthrough. And if it's not for you, no worries at all.

[Your name]
RetireWiz`,
    },
    {
      kind: "outreach",
      title: "Ensombl partnership enquiry — advisers",
      audience: "advisers",
      pinned: false,
      body: `SUBJECT: Partnership enquiry — a retirement-modelling tool for your adviser audience

BODY:
Hi Ensombl team,

I'm building RetireWiz — a retirement & Age Pension modelling tool for Australian advisers and accountants. On current AU rules and in today's dollars it models super, the means-tested Age Pension (income & assets tests, deeming), early-retirement bridging, fees and tax, with live "what-if" strategies you can run in a client meeting — all cross-checked against ASIC's Moneysmart. General information only; the adviser gives the advice.

I'm opening early access to a first group of practices and would love to reach the Ensombl community — the advisers who'd actually use it. Rather than post cold into the community, I'd like to do it properly: could you share your partnership options — podcast sponsorship, newsletter, community/app placements, or a sponsored piece?

Happy to give you a 10-minute walkthrough. The early-access page is ${site}.

What's the best way to explore this?

Thanks,
[Your name]
RetireWiz — [your email]

WHERE TO SEND: Ensombl (ensombl.com) — find their "partner with us" / advertising / contact page, or email the partnerships/media team. The same pitch works for the trade press (ifa, Professional Planner, Money Management) if you want a sponsored-article angle instead.`,
    },
    {
      kind: "note",
      title: "How to work the adviser kit",
      audience: "advisers",
      pinned: false,
      body: `WHO to target first: independent/boutique retirement-focused advisers and SMSF accountants — they feel the tooling pain most and can say yes without a committee. Skip big licensees (locked into XPLAN/Midwinter) for now.

WHERE: LinkedIn (post + DMs), the XY Adviser / Ensombl community, adviser Facebook groups, and a short list of 20–30 practices found via Google/LinkedIn.

HOW: personalise the first line every time ("saw you focus on retirement/SMSF clients…"). 5 tailored DMs beat 50 copy-pastes.

SUCCESS BAR: ~30–50 quality visits → if 5–10 waitlist signups come with real "would-pay" answers, that's a genuine signal to build the B2B features. Crickets after honest effort is ALSO a signal — rethink the wedge before building.`,
    },
    {
      kind: "outreach",
      title: "Reddit post — r/fiaustralia (free tool, OC share)",
      audience: "consumers",
      pinned: false,
      body: `TITLE: I got frustrated with retirement calculators, so I built a free one that models the Age Pension + lets you test strategies — feedback welcome

BODY:
Long-time lurker. I kept hitting the same wall with retirement calculators: most ignore the Age Pension (which does a lot of the heavy lifting for most Australians), hide their assumptions, or won't let you test "what if I downsized / salary-sacrificed / retired at 60".

So I built RetireWiz — free, no signup to run it:
• Models super + the means-tested Age Pension (income & assets tests, deeming), tax and fees, all in today's dollars
• Live "what-if" strategies — downsize, salary-sacrifice, retire later, work part-time — showing the impact on your balance, income and how long the money lasts
• Every assumption is on show, and I cross-checked the core numbers against ASIC's Moneysmart so they line up

It's general information, not advice — just the maths. I'd genuinely value this crowd's feedback on where the modelling could be sharper (edge cases, assumptions you'd change).

${home}

(Mods — happy to pull this if it breaks the rules. It's free, no upsell, no signup wall.)

TIP: post with OC/Tool flair, reply to every comment for the first few hours, and don't cross-post the same link to other subs the same day.`,
    },
    {
      kind: "outreach",
      title: "Reddit/social post — 'Does the Age Pension actually matter?' (4 scenarios)",
      audience: "consumers",
      pinned: true,
      body: `TITLE: Does the Age Pension actually matter for your retirement? I modelled 4 cases — it depends entirely on how wealthy you are

BODY:
There's a recurring stoush in retirement/FIRE threads: is the Age Pension a genuine pillar of your plan, or a rounding error you should ignore? People talk straight past each other. So I modelled four cases the same way and the answer is clear — it depends almost entirely on your wealth and spending.

Each is run on current AU rules (means-tested Age Pension — income & assets tests, deeming — plus super preservation rules, tax and fees), in today's dollars, funding to age 90. "Lasts" = the share of market scenarios (Monte Carlo, block-resampling real 1928–2025 return sequences) where the money reaches 90. Here's each plan WITH the pension vs with it switched off:

Ordinary retirees — the pension is the backbone:
• Single, retire 55, $750k, $42k/yr → 87% ... ~12% without the pension (+75pp)
• Couple, retire 55, $1.1M, $60k/yr → 92% ... ~16% without (+76pp)

High-net-worth early retirees — the pension barely moves:
• Single, retire 45, $1M, $40k/yr → 86% ... 49% without (+37pp — still decisive at a low spend)
• Single, retire 45, $2M, $80k/yr → 60% ... 54% without (+6pp — a late-life backstop only)

The pattern: for a normal retiree the means-tested pension does most of the heavy lifting — ignore it and you'll wildly over-save or scare yourself out of retiring. For a high-spend millionaire it's tapered away and barely registers. The "pension doesn't matter" camp and the "pension is everything" camp are both right — about different people. What actually decides it is your assets and how much you spend.

Click any of these and change the numbers yourself (no signup):
• Retire 55, single: ${home}/scenario/retire-55-single
• Retire 55, couple: ${home}/scenario/retire-55-couple
• Retire 45, $40k (pension decisive): ${home}/scenario/fire-at-45
• Retire 45, $80k (pension marginal): ${home}/scenario/fire-at-45-high-spend

I built this (RetireWiz, free) because most calculators ignore the pension entirely, which quietly breaks the answer for the people it matters most to. General information, not advice — just the maths. Keen for feedback on where the modelling could be sharper.

TIP: r/fiaustralia (OC/Tool flair) or r/AusFinance-adjacent are the fit — DISCLOSE you built it, lead with the insight not the links, and reply to every comment for the first few hours. Also works as a LinkedIn post: keep the four bullets, drop the etiquette line, put the scenario links in the first comment if reach dips.`,
    },
    {
      kind: "snippet",
      title: "Reddit comment — 'how much super / will it last' answer",
      audience: "consumers",
      pinned: false,
      body: `Reusable helpful reply for the recurring "how much super do I need" / "will my super last" threads. Lead with the useful info; only add the tool line where it genuinely answers the question, and disclose you built it.

---
The honest answer is "it depends on the Age Pension" — which most calculators skip. A single homeowner can get up to roughly $29k/yr and a couple ~$44k/yr (means-tested on income & assets), so your super often only needs to top that up to your target rather than fund the whole thing. For a benchmark, ASFA's "comfortable" standard is about $52k/yr single and $73k/yr for a couple.

Two free tools worth a look: ASIC's Moneysmart retirement calculator, and RetireWiz (${home}) — I built the second one; it adds the Age Pension means test and lets you test strategies like downsizing or salary-sacrifice. Both show figures in today's dollars, no signup needed.

Happy to sanity-check if you share your rough numbers.`,
    },
    {
      kind: "note",
      title: "Reddit etiquette (don't get banned)",
      audience: "consumers",
      pinned: false,
      body: `• READ each subreddit's rules first. r/fiaustralia is more OC/tool-friendly; r/AusFinance is larger and much stricter on self-promo — there, contribute helpful comments rather than posting your link.
• DISCLOSE you built it, every time. Reddit rewards transparency and nukes stealth marketing.
• VALUE FIRST: the post/comment must be useful even if nobody clicks. No signup wall, no upsell language.
• DON'T drop-and-run — reply to every comment for the first few hours.
• ONE sub at a time, spaced out. The same link across several subs in a day trips spam filters and gets bans.
• FLAIR as OC/Tool where required; offer to remove if mods object.
• LONG GAME: become a genuinely helpful regular and let the tool come up naturally in relevant threads — that converts far better than a one-off post.`,
    },
  ];

  let added = 0;
  for (const s of seeds) {
    const exists = await c.query("select 1 from marketing_assets where title = $1 limit 1", [s.title]);
    if (exists.rows.length) continue;
    await c.query(
      `insert into marketing_assets (kind, title, body, audience, pinned)
       values ($1, $2, $3, $4, $5)`,
      [s.kind, s.title, s.body, s.audience, s.pinned],
    );
    added++;
  }
  console.log(
    added ? `  marketing: added ${added} new curated asset(s).` : "  marketing: curated assets already present.",
  );
}

/** Run the full idempotent migration: schema + all seeds. */
export async function migrate(c: Client): Promise<void> {
  await applySchema(c);
  console.log("  schema: applied.");
  await seedRefData(c);
  await seedSources(c);
  await seedMarketingAssets(c);
  await seedDemoScenarios(c);
}

/**
 * Curated demo scenarios (Reddit reproductions etc.). Code is the source of
 * truth: every scenario is upserted by its stable `slug`, so editing the array
 * in code and deploying updates the live scenario in place. Removing one from
 * the array leaves the DB row untouched (unpublish/delete via the backoffice).
 */
export async function seedDemoScenarios(c: Client): Promise<void> {
  for (const s of DEMO_SCENARIOS) {
    await c.query(
      `insert into demo_scenarios (slug, title, blurb, context, thread_url, data, sort_order, published, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, now())
       on conflict (slug) do update set
         title = excluded.title,
         blurb = excluded.blurb,
         context = excluded.context,
         thread_url = excluded.thread_url,
         data = excluded.data,
         sort_order = excluded.sort_order,
         published = excluded.published,
         updated_at = now()`,
      [s.slug, s.title, s.blurb ?? null, s.context ?? null, s.threadUrl ?? null, JSON.stringify(s.data), s.sortOrder ?? 0, s.published ?? true],
    );
  }
  console.log(`  demo-scenarios: upserted ${DEMO_SCENARIOS.length} scenario(s).`);
}
