// Repro + regression for the "saved scenario overwritten by signed-out work" bug.
//
//   Steps (from the user's report):
//     1. Log in, create Scenario1
//     2. Log out
//     3. "Start again — clear details"
//     4. Build a new plan while signed out (guest)
//     5. Log back in as the original user  → Scenario1 was silently replaced
//
// We drive the on-login reconciliation directly: seed Scenario1 in the DB + the
// active pointer, then plant a "foreign" fresher local plan (built signed-out:
// no saved-id, owner="") and load the dashboard signed in. The saved scenario
// must survive untouched.
//
// Needs the dev server + local Postgres (same as e2e-scenarios.mjs).

import { chromium } from "playwright";
import pg from "pg";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const HOST = new URL(BASE).hostname;
const DB_URL = process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/financial";
const EMAIL = "repro-overwrite@retirewiz.local";

const dbHost = (() => { try { return new URL(DB_URL).hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "::1", ""].includes(dbHost)) {
  console.error(`REFUSING non-local DB host "${dbHost}".`); process.exit(1);
}

const results = [];
const ok = (name, cond) => { results.push([!!cond, name]); console.log(`${cond ? "  ok ✓" : "FAIL ✗"}  ${name}`); };
const hashPassword = async (pw) => { const s = randomBytes(16).toString("hex"); const b = await scryptAsync(pw, s, 64); return `${s}:${b.toString("hex")}`; };

// Scenario1 — the saved plan (distinctive salary so we can spot an overwrite).
const SAVED = {
  household: "single",
  people: [{ currentAge: 40, superBalance: 150000, salary: 111111, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  superMode: "individual", jointSuperBalance: 300000, jointSuperSplit: 50,
  homeowner: true, outsideSuper: 50000, annualOutsideSavings: 5000,
  retirementAge: 65, spendingMode: "flat", targetSpending: 55000,
  spendingStages: { goGo: 55000, slowGo: 44000, noGo: 38500 },
  investmentReturn: 7, returnVolatility: 11, inflation: 2.5, lifeExpectancy: 90,
};
// The plan a guest builds at step 4 — completely different salary.
const GUEST = { ...SAVED, people: [{ ...SAVED.people[0], salary: 999999 }] };

const db = new pg.Client({ connectionString: DB_URL });
await db.connect();
const up = await db.query(
  `insert into users (email, password_hash, is_admin) values ($1,$2,false)
   on conflict (email) do update set is_admin=false returning id`,
  [EMAIL, await hashPassword("x")],
);
const uid = up.rows[0].id;
await db.query("delete from plans where user_id=$1", [uid]);
// Seed Scenario1 + point the active pointer at it, with an OLD updated_at so the
// planted local copy is unambiguously "fresher".
const ins = await db.query(
  "insert into plans (user_id, name, data, updated_at) values ($1,$2,$3, now() - interval '1 hour') returning id",
  [uid, "Scenario1", JSON.stringify(SAVED)],
);
const scenario1Id = ins.rows[0].id;
await db.query("update users set active_plan_id=$1 where id=$2", [scenario1Id, uid]);
const token = randomBytes(32).toString("hex");
await db.query("insert into sessions (user_id, token, expires_at) values ($1,$2, now()+interval '1 day')", [uid, token]);

const savedSalary = async () => {
  const r = await db.query("select data->'people'->0->>'salary' s, name from plans where id=$1", [scenario1Id]);
  return r.rows[0] ? { salary: Number(r.rows[0].s), name: r.rows[0].name } : null;
};
const planCount = async () => (await db.query("select count(*)::int n from plans where user_id=$1", [uid])).rows[0].n;

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  await ctx.addCookies([{ name: "session", value: token, domain: HOST, path: "/", httpOnly: true, sameSite: "Lax" }]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("  PAGEERROR:", e.message));

  // Load once so the origin exists, then plant the "signed-out guest" local state:
  // fresher plan, NO saved-id (cleared by "Start again"), owner="" (built signed out).
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate((g) => {
    localStorage.setItem("au-retirement-plan", JSON.stringify(g));
    localStorage.setItem("au-retirement-plan-ts", String(Date.now() + 60_000)); // unambiguously fresher
    localStorage.removeItem("au-retirement-saved-id");
    localStorage.setItem("au-retirement-plan-owner", ""); // built while signed out
  }, GUEST);

  // Step 5 — log back in (reload the dashboard while signed in).
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  // Give any (buggy) auto-save a generous window to fire.
  await page.waitForTimeout(4000);

  const after = await savedSalary();
  ok("Scenario1 still exists", after && after.name === "Scenario1");
  ok(`Scenario1 data NOT overwritten by guest plan (salary ${after?.salary})`, after?.salary === 111111);
  ok("no stray extra scenario was created", (await planCount()) === 1);

  // The active scenario the user sees should be their saved one, and the local
  // copy should now be re-stamped as theirs (savedId points at Scenario1).
  const localSavedId = await page.evaluate(() => localStorage.getItem("au-retirement-saved-id"));
  ok("local saved-id reconciled to Scenario1", localSavedId === scenario1Id);
  const localOwner = await page.evaluate(() => localStorage.getItem("au-retirement-plan-owner"));
  ok("local plan re-stamped to the signed-in user", localOwner === EMAIL);

  // --- Variant: user did NOT click "Start again", so the OLD saved-id lingers.
  //     Guest work still stamped owner="" → must not overwrite either. ---
  await db.query("update plans set data=$1, updated_at = now() - interval '1 hour' where id=$2", [JSON.stringify(SAVED), scenario1Id]);
  await page.evaluate((args) => {
    const [g, id] = args;
    localStorage.setItem("au-retirement-plan", JSON.stringify(g));
    localStorage.setItem("au-retirement-plan-ts", String(Date.now() + 60_000));
    localStorage.setItem("au-retirement-saved-id", id); // lingering id from before logout
    localStorage.setItem("au-retirement-plan-owner", ""); // but the edit was made signed out
  }, [GUEST, scenario1Id]);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  const after2 = await savedSalary();
  ok(`variant (no "Start again"): Scenario1 still NOT overwritten (salary ${after2?.salary})`, after2?.salary === 111111);

  // --- Control: a LEGIT fresher local plan owned by the signed-in user (their own
  //     un-pushed edits) SHOULD still persist — the fix must not break this. ---
  await page.evaluate((args) => {
    const [g, id, email] = args;
    localStorage.setItem("au-retirement-plan", JSON.stringify(g));
    localStorage.setItem("au-retirement-plan-ts", String(Date.now() + 120_000));
    localStorage.setItem("au-retirement-saved-id", id);
    localStorage.setItem("au-retirement-plan-owner", email); // MINE
  }, [GUEST, scenario1Id, EMAIL]);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  const after3 = await savedSalary();
  ok(`control: my own fresher edits DO persist (salary ${after3?.salary})`, after3?.salary === 999999);
} finally {
  await browser.close();
  await db.query("delete from plans where user_id=$1", [uid]);
  await db.query("delete from sessions where user_id=$1", [uid]);
  await db.query("delete from users where id=$1", [uid]);
  await db.end();
}

const failed = results.filter(([p]) => !p);
console.log(`\nRESULT: ${results.length - failed.length}/${results.length} passed ${failed.length ? "✗" : "✓"}`);
process.exit(failed.length ? 1 : 0);
