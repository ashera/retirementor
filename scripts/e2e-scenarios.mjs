// End-to-end regression for the scenario model (save/load lifecycle + What-If) as a
// signed-in user. Drives a real browser and asserts both the UI and the database.
//
// Needs: the dev server running AND a local Postgres.
//   npm run dev                       (note the port; it auto-increments if 3000 is taken)
//   node scripts/e2e-scenarios.mjs    (or: npm run test:e2e)
//   BASE_URL=http://localhost:3001 DATABASE_URL=... node scripts/e2e-scenarios.mjs
//
// It creates a dedicated, isolated test user, resets its plans/drafts, runs the
// journeys, then cleans up. Refuses any non-local DATABASE_URL. Exits non-zero on
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
  await db.query("delete from plans where user_id=$1", [uid]);
  await db.query("delete from plan_drafts where user_id=$1", [uid]);
};
await reset();
const token = randomBytes(32).toString("hex");
await db.query("insert into sessions (user_id, token, expires_at) values ($1, $2, now()+interval '1 day')", [uid, token]);

const plans = async () => (await db.query("select name, data from plans where user_id=$1 order by updated_at", [uid])).rows;
const draft = async () => (await db.query("select data from plan_drafts where user_id=$1", [uid])).rows[0]?.data ?? null;

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
  await ctx.addCookies([{ name: "session", value: token, domain: HOST, path: "/", httpOnly: true, sameSite: "Lax" }]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("  PAGEERROR:", e.message));
  const txt = () => page.evaluate(() => document.body.innerText);

  // A — save a fresh plan (in-place-save entry point).
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate((p) => {
    localStorage.setItem("au-retirement-plan", JSON.stringify(p));
    localStorage.setItem("au-retirement-plan-ts", String(Date.now()));
    localStorage.removeItem("au-retirement-saved-id");
  }, PLAN);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.getByPlaceholder(/Name it/i).fill("Scenario One");
  await page.getByRole("button", { name: /Save scenario/i }).click();
  await page.waitForTimeout(1500);
  ok("save creates exactly 1 plan", (await plans()).length === 1);
  ok("dashboard shows 'Currently editing Scenario One'", (await txt()).includes("Scenario One"));

  // B — What-If toggles a strategy; Save changes updates the SAME plan in place.
  await page.getByRole("link", { name: /What-If Strategies/i }).first().click();
  await page.waitForURL("**/what-if").catch(() => {});
  await page.waitForTimeout(900);
  await page.getByText("Flexible spending (guardrails)", { exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Save changes/i }).click();
  await page.waitForTimeout(1500);
  let ps = await plans();
  ok("What-If 'Save changes' stays 1 plan (in place)", ps.length === 1);
  ok("that plan now carries guardrails", !!ps[0]?.data?.guardrails);

  // Back to planner opens on exactly the scenario just edited.
  await page.getByRole("link", { name: /Back to planner/i }).click();
  await page.waitForURL(`${BASE}/`).catch(() => {});
  await page.waitForTimeout(2500);
  ok("back-to-planner shows the guardrails chip", (await txt()).includes("Flexible spending (guardrails)"));
  ok("back-to-planner shows 'Scenario One'", (await txt()).includes("Scenario One"));

  // C — Save as a copy creates a distinct second plan.
  await page.getByPlaceholder(/New name/i).fill("Scenario Two");
  await page.getByRole("button", { name: /Save as a copy/i }).click();
  await page.waitForTimeout(1500);
  ps = await plans();
  ok("Save-as-copy creates a 2nd plan", ps.length === 2);
  ok("both copies carry the strategy", ps.every((p) => !!p.data.guardrails));

  // D — the signed-in cloud draft reflects the What-If work (cross-device).
  const d = await draft();
  ok("cloud draft exists", !!d);
  ok("cloud draft carries guardrails", !!d?.guardrails);

  // E — ?edit=<id> adopts a specific saved scenario in What-If.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const opts = await page.$$eval("option", (os) => os.map((o) => ({ v: o.value, t: o.textContent })));
  const oneId = opts.find((o) => (o.t || "").includes("Scenario One"))?.v;
  if (oneId) await page.getByLabel("Choose a saved scenario").selectOption(oneId);
  await page.waitForTimeout(400);
  await page.locator('a[href*="what-if?edit="]').click();
  await page.waitForURL("**/what-if**").catch(() => {});
  await page.waitForTimeout(1200);
  ok("?edit opens What-If editing 'Scenario One'", (await txt()).includes("Scenario One"));
  const guardOn = await page.evaluate(() => {
    const label = [...document.querySelectorAll("*")].find((e) => e.textContent === "Flexible spending (guardrails)");
    return label?.closest("div.rounded-2xl")?.querySelector('[role="switch"]')?.getAttribute("aria-checked");
  });
  ok("?edit shows the scenario's strategy toggled on", guardOn === "true");

  // F — historical stress test renders a scorecard + fixed/flex toggle for the plan.
  await page.goto(`${BASE}/stress-test`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
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
console.log(failed ? "RESULT: e2e failures ✗" : "RESULT: scenario model e2e green ✓");
process.exit(failed ? 1 : 0);
