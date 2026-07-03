# Retirementor — Australian Retirement Planner

A Next.js app that models Australian retirement outcomes: superannuation accumulation and
drawdown, the means-tested Age Pension, early-retirement bridging, mortgages, investment
property, a guided budget planner, Monte Carlo longevity, and an auditor-grade scenario test
suite. Everything is modelled in **today's dollars with real returns** (FY2026-27 reference data).

> Educational estimates only — not financial advice.

## Stack

- **Next.js 15** (App Router) · **React 19** · **TypeScript** · **Tailwind v4** · **Recharts**
- **PostgreSQL** via raw `pg` (no ORM); Next server actions
- Custom **scrypt** auth with DB-backed sessions (httpOnly cookie)
- **Vitest** test runner; results recorded to the DB and surfaced in an admin backoffice

## Getting started

Prerequisites: Node 20+, PostgreSQL.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env.local` with your database connection (this file is gitignored):
   ```
   DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/financial
   ```
3. Set up the schema and seed reference data (idempotent — safe to re-run):
   ```bash
   npm run db:migrate
   ```
4. (Optional) Promote a user to admin for the backoffice:
   ```bash
   node scripts/make-admin.mjs you@example.com
   ```
5. Run the dev server:
   ```bash
   npm run dev
   ```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run db:migrate` | Apply the schema and seed reference data (idempotent) |
| `npm test` | Run the Vitest suite |
| `npm run test:record` | Run tests and record results to the DB |

## Deploying to Railway

The repo is Railway-ready (`railway.json`):

1. Create a project from this GitHub repo and add a **PostgreSQL** plugin. Railway
   injects `DATABASE_URL` automatically — reference the Postgres service's
   `DATABASE_URL` from the app service's variables (the private `*.railway.internal`
   URL is preferred; the app also accepts a public proxy URL over TLS).
2. On every deploy Railway runs, in order:
   - **build** — `npm run build`
   - **pre-deploy** — `npm run db:migrate` (creates tables and seeds reference data
     against the live database; idempotent, so it's safe on every deploy and never
     clobbers admin edits)
   - **start** — `npm run start`
3. After the first deploy, create an account in the app, then promote it to admin:
   ```bash
   railway run npm run db:migrate   # if you ever need to run it manually
   railway run node scripts/make-admin.mjs you@example.com
   ```

Because the migration is the pre-deploy step, a failed migration aborts the deploy
and the previous version keeps serving — a bad schema change never ships.

## Testing & the independent oracle

The domain logic is guarded by a layered, defence-in-depth suite:

- **Analytical reference** (`lib/au/scenarios/reference.ts`) re-derives super/outside balances,
  deeming, and the two-test Age Pension from published rules and closed-form maths — deliberately
  *not* from the engine loop, so it catches drift rather than rubber-stamping it.
- **Named personas** (`lib/au/scenarios/personas.ts`) assert key timeline values for 10 audit
  personas (single/couple, owner/renter, mortgage P&I/IO/clear, investment property hold/sell,
  SMSF, full- and nil-pension cases).
- **Stress matrix** (`tests/scenarios/stress.test.ts`) sweeps ~965 plans against invariants and
  the closed-form reference.
- **Moneysmart external oracle** (`lib/au/scenarios/moneysmart.ts`) — a guided admin tool to
  transcribe results from ASIC's Moneysmart calculator and commit them as third-party regression
  anchors that catch modelling gaps the analytical reference shares (fees, Division 293, TBC).

The **admin backoffice** (`/admin`) exposes review, parameters, sources, tests, scenarios, and the
Moneysmart tool, each with full workings for audit.
