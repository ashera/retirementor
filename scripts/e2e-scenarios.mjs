// End-to-end regression for the active-scenario model (continuous auto-save to ONE
// named scenario per user + What-If) as a signed-in user. Drives a real browser and
// asserts both the UI and the database.
//
// Needs: the dev server running AND a local Postgres.
//   npm run dev                       (note the port; it auto-increments if 3000 is taken)
//   node scripts/e2e-scenarios.mjs    (or: npm run test:e2e)
//   BASE_URL=http://localhost:3001 DATABASE_URL=... node scripts/e2e-scenarios.mjs
//
// It creates a dedicated, isolated test user, resets its plans/active pointer, runs
// the journeys, then cleans up. Refuses any non-local DATABASE_URL. Exits non-zero on
// any failed assertion, so it can gate CI.

import { chromium } from "playwright";
import pg from "pg";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const HOST = new URL(BASE).hostname;
const DB_URL = process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/financial";
const EMAIL = "test-bot@retirewiz.local";

// Safety: never touch a non-local database.
const dbHost = (() => { try { return new URL(DB_URL).hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "::1", ""].includes(dbHost)) {
  console.error(`REFUSING: DATABASE_URL host "${dbHost}" is not local — this test writes/deletes data.`);
  process.exit(1);
}

const results = [];
const ok = (name, cond) => {
  results.push([!!cond, name]);
  console.log(`${cond ? "  ok ✓" : "FAIL ✗"}  ${name}`);
};

const hashPassword = async (pw) => {
  const salt = randomBytes(16).toString("hex");
  const buf = await scryptAsync(pw, salt, 64);
  return `${salt}:${buf.toString("hex")}`;
};

const PLAN = {
  household: "single",
  people: [{ currentAge: 40, superBalance: 150000, salary: 95000, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }],
  superMode: "individual", jointSuperBalance: 300000, jointSuperSplit: 50,
  homeowner: true, outsideSuper: 50000, annualOutsideSavings: 5000,
  retirementAge: 65, spendingMode: "flat", targetSpending: 55000,
  spendingStages: { goGo: 55000, slowGo: 44000, noGo: 38500 },
  investmentReturn: 7, returnVolatility: 11, inflation: 2.5, lifeExpectancy: 90,
};

const db = new pg.Client({ connectionString: DB_URL });
await db.connect();

// --- Setup: isolated test user, clean slate, a session token. ---
const up = await db.query(
  `insert into users (email, password_hash, is_admin) values ($1, $2, true)
   on conflict (email) do update set is_admin = true returning id`,
  [EMAIL, await hashPassword("test-bot-password")],
);
const uid = up.rows[0].id;
const reset = async () => {
  // active_plan_id FK is ON DELETE SET NULL, so dropping the plans clears the pointer.
  await db.query("delete from plans where user_id=$1", [uid]);
};
await reset();
const token = randomBytes(32).toString("hex");
await db.query("insert into sessions (user_id, token, expires_at) values ($1, $2, now()+interval '1 day')", [uid, token]);

const plans = async () => (await db.query("select id, name, data from plans where user_id=$1 order by updated_at", [uid])).rows;
const activePlanId = async () => (await db.query("select active_plan_id from users where id=$1", [uid])).rows[0]?.active_plan_id ?? null;

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
  await ctx.addCookies([{ name: "session", value: token, domain: HOST, path: "/", httpOnly: true, sameSite: "Lax" }]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("  PAGEERROR:", e.message));
  page.on("dialog", (d) => d.accept()); // accept the delete confirm()
  const txt = () => page.evaluate(() => document.body.innerText);

  // A — a signed-in user with local work but no scenarios yet: the first auto-save
  //     silently creates their ONE active scenario, "My First Scenario". No button.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate((p) => {
    localStorage.setItem("au-retirement-plan", JSON.stringify(p));
    localStorage.setItem("au-retirement-plan-ts", String(Date.now()));
    localStorage.removeItem("au-retirement-saved-id");
    localStorage.removeItem("au-retirement-baseline-name");
  }, PLAN);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(6000); // debounced auto-save (1.5s) + heavy first-render + create + round-trip
  let ps = await plans();
  ok("auto-save creates exactly 1 active scenario", ps.length === 1);
  ok("it is named 'My First Scenario'", ps[0]?.name === "My First Scenario");
  ok("users.active_plan_id points at it", (await activePlanId()) === ps[0]?.id);
  const firstId = ps[0]?.id;

  // B — What-If toggles a strategy; auto-save updates the SAME active plan in place.
  await page.getByRole("link", { name: /What-If Strategies/i }).first().click();
  await page.waitForURL("**/what-if").catch(() => {});
  await page.waitForTimeout(1200);
  // Strategies are compact goal-grouped pills; tapping one APPLIES it and opens its
  // detail modal in the active state. Close the modal; auto-save flushes on its own.
  await page.getByRole("button", { name: /Flexible spending \(guardrails\)/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /^Save$/ }).click().catch(() => {}); // close the strategy modal
  await page.waitForTimeout(2200); // debounced auto-save (1.2s) + round-trip
  ps = await plans();
  ok("What-If auto-save stays 1 plan (in place)", ps.length === 1);
  ok("the active plan now carries guardrails", !!ps[0]?.data?.guardrails);
  ok("active_plan_id is unchanged", ps[0]?.id === firstId && (await activePlanId()) === firstId);

  // C — Back to planner opens on exactly the scenario just edited, strategy intact.
  await page.getByRole("link", { name: /Back to planner/i }).click();
  await page.waitForURL(`${BASE}/`).catch(() => {});
  await page.waitForTimeout(2500);
  const back = await txt();
  ok("back-to-planner shows the guardrails chip", back.includes("Flexible spending (guardrails)"));
  ok("back-to-planner names 'My First Scenario'", back.includes("My First Scenario"));

  // D — ?edit=<id> adopts a specific saved scenario in What-If AND makes it active,
  //     so subsequent auto-saves target it (the switcher's underlying mechanism).
  const ins = await db.query(
    "insert into plans (user_id, name, data) values ($1, $2, $3) returning id",
    [uid, "Scenario Two", JSON.stringify({ ...PLAN, targetSpending: 60000 })],
  );
  const twoId = ins.rows[0].id;
  await page.goto(`${BASE}/what-if?edit=${twoId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  ok("?edit opens What-If editing 'Scenario Two'", (await txt()).includes("Scenario Two"));
  ok("?edit sets it as the active scenario on the server", (await activePlanId()) === twoId);

  // The scenario controls (rename, switch, new, delete, …) are folded into the
  // confidence hero's ⚙ Manage modal, so each folded-control test opens it first.
  const openManage = async () => {
    await page.getByRole("button", { name: /Manage/i }).click();
    await page.getByRole("dialog", { name: /Manage scenario/i }).waitFor();
  };

  // F — rename the active scenario from the ⚙ Manage modal's name field.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await openManage();
  const nameField = page.getByLabel("Scenario name");
  await nameField.click();
  await nameField.fill("Renamed Two");
  await nameField.press("Enter");
  await page.waitForTimeout(1200);
  ok(
    "inline rename updates the active scenario name",
    (await db.query("select name from plans where id=$1", [twoId])).rows[0]?.name === "Renamed Two",
  );

  // G — "New scenario" (in the Manage modal) opens the create dialog; "copy" branches.
  const beforeBranch = (await plans()).length;
  await page.getByRole("button", { name: /New scenario/i }).click(); // Manage modal is open
  await page.waitForTimeout(500);
  ok("New scenario opens a dialog", (await page.getByRole("dialog").count()) > 0);
  // "Based on this scenario" is the default; name pre-fills "Copy of {name}".
  await page.getByRole("button", { name: /Create scenario/i }).click();
  await page.waitForTimeout(1800);
  const afterBranch = await plans();
  const copy = afterBranch.find((p) => /^Copy of Renamed Two/.test(p.name));
  ok("copy mode branches a copy (count +1)", afterBranch.length === beforeBranch + 1);
  ok("copy is named 'Copy of {name}'", !!copy);
  ok("copy becomes the active scenario", (await activePlanId()) === copy?.id);

  // G2 — "Start from scratch" creates a blank named scenario and jumps into the wizard.
  await openManage();
  await page.getByRole("button", { name: /New scenario/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Start from scratch/i }).waitFor();
  await page.getByRole("button", { name: /Start from scratch/i }).click();
  const nameInput = page.getByRole("dialog").getByLabel("Scenario name");
  await nameInput.fill("Fresh Build");
  await page.getByRole("button", { name: /Create scenario/i }).click();
  await page.waitForTimeout(1600);
  const scratch = (await plans()).find((p) => p.name === "Fresh Build");
  ok("scratch mode creates the named scenario", !!scratch);
  ok("scratch scenario is the active one", (await activePlanId()) === scratch?.id);
  ok("scratch jumps straight into the wizard (no guide/Get-started)", (await txt()).includes("Your plan overview"));
  // Reload to a clean state (wizard closed), then switch back to the renamed plan so
  // the delete-fallback test below has a built active plan.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // H — the switcher flips the active scenario; deleting the active one falls back.
  // The active plan is now the BLANK "Fresh Build", so the dashboard shows the
  // empty-state scenario bar (with its switcher) rather than the hero — switch from
  // there back to a built plan, which brings the hero (and its ⚙ Manage) back.
  await page.getByLabel("Switch scenario").selectOption(twoId);
  await page.waitForTimeout(1800);
  ok("switcher makes the chosen scenario active", (await activePlanId()) === twoId);
  await openManage();
  await page.getByRole("button", { name: /Delete Renamed Two/i }).click();
  await page.waitForTimeout(1600);
  const remaining = await plans();
  const activeAfterDelete = await activePlanId();
  ok("delete removes the active scenario", !remaining.some((p) => p.id === twoId));
  ok("delete falls back to another active scenario", remaining.some((p) => p.id === activeAfterDelete));

  // J — a READ-ONLY shared link (/s/<token>) is a sandbox: viewing it (even while
  //     signed in, even after the auto-save debounce + a tab-hide flush) must NEVER
  //     write to the viewer's own active scenario.
  const mine = await db.query(
    "insert into plans (user_id, name, data) values ($1, 'Untouched', $2) returning id",
    [uid, JSON.stringify({ ...PLAN, targetSpending: 55000 })],
  );
  const untouchedId = mine.rows[0].id;
  await db.query("update users set active_plan_id=$1 where id=$2", [untouchedId, uid]);
  const shareTok = randomBytes(16).toString("hex");
  await db.query(
    "insert into plans (user_id, name, data, share_token) values ($1, 'Shared Elsewhere', $2, $3)",
    [uid, JSON.stringify({ ...PLAN, targetSpending: 24000 }), shareTok],
  );
  const untouchedSpend = async () =>
    (await db.query("select data->>'targetSpending' as s from plans where id=$1", [untouchedId])).rows[0]?.s;
  await page.goto(`${BASE}/s/${shareTok}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500); // past the 1.5s cloud-save debounce
  await page.evaluate(() => {
    try {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange")); // the tab-hide flush path
    } catch {
      /* ignore */
    }
  });
  await page.waitForTimeout(1200);
  ok("shared link leaves the active scenario's DATA untouched", (await untouchedSpend()) === "55000");
  ok("shared link leaves active_plan_id unchanged", (await activePlanId()) === untouchedId);

  // E — historical stress test renders a scorecard + fixed/flex toggle for the plan.
  await page.goto(`${BASE}/stress-test`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: /Skip the theatrics/i }).click().catch(() => {}); // skip the timed run
  await page.waitForTimeout(600);
  const st = await txt();
  ok("stress test shows a survival scorecard", /Survived \d+ of 7/.test(st));
  ok("stress test lists the era battery", st.includes("Global Financial Crisis") && st.includes("The Great Depression"));
  ok("stress test offers fixed-vs-flexible spending", /Spending strategy/i.test(st) && /Fixed/.test(st) && /Flexible/.test(st));
} catch (e) {
  console.error("\ne2e run threw — is `npm run dev` running at", BASE, "?\n ", e.message);
  ok("run completed without throwing", false);
} finally {
  await browser.close();
  await reset(); // leave the DB tidy; keep the test user for reuse
  await db.query("delete from sessions where user_id=$1", [uid]);
  await db.end();
}

const failed = results.filter(([pass]) => !pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
console.log(failed ? "RESULT: e2e failures ✗" : "RESULT: active-scenario e2e green ✓");
process.exit(failed ? 1 : 0);
