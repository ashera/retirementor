#!/usr/bin/env node
// Reddit OUTREACH finder — surface recent threads where one of our /learn articles
// genuinely answers the question, so you can leave a *helpful* comment that links it.
//
// This is a FINDER, not a poster: it ranks candidate threads by how well the article
// fits; you open the good ones and decide whether a reply actually adds value. Please
// comment genuinely and follow each subreddit's self-promotion rules — see the note it
// prints. Reddit blocks server-side fetches, so (like reddit-scan) it drives a real
// browser over Reddit SEARCH, sorted by relevance, within a time window.
//
// USAGE:
//   node scripts/reddit-match.mjs --article=super-on-track
//   node scripts/reddit-match.mjs --article=average-australian --hours=336 --subs=AusFinance,fiaustralia --out=scratchpad/match.md
//   node scripts/reddit-match.mjs --list        # show the article registry

import { chromium } from "playwright";
import pg from "pg";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SITE = "https://www.retirewiz.com.au";

// ── Value parsing (best-effort, from the post title + body) ──────────────────────
function money(s) {
  if (!s) return null;
  const k = /k\b/i.test(s);
  const n = parseFloat(String(s).replace(/[$,\s]/g, "").replace(/k\b/i, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(k ? n * 1000 : n);
}
function parseAge(t) {
  for (const re of [/\b(\d{2})\s*[mf]\b/, /\b(?:i['’]?m|i am|aged?|turning)\s*(\d{2})\b/, /\b(\d{2})\s*(?:yo|y\/?o|years?\s*old)\b/]) {
    const m = t.match(re);
    if (m) { const a = Number(m[1]); if (a >= 18 && a <= 70) return a; }
  }
  return null;
}
function parseSuper(t) {
  for (const re of [/(\$?\s*[\d.,]+\s*k?)\s*(?:in\s+)?(?:of\s+)?super/i, /super\s*(?:balance|of|is|:|at|@)?\s*(\$?\s*[\d.,]+\s*k?)/i]) {
    const m = t.match(re);
    const v = m && money(m[1]);
    if (v && v >= 1_000 && v <= 5_000_000) return v;
  }
  return null;
}
function parseIncome(t) {
  for (const re of [/(?:earn|income|salary|making|wage)\D{0,10}(\$?\s*[\d.,]+\s*k?)/i, /(\$?\s*[\d.,]+\s*k?)\s*(?:a\s*year|p\.?a\.?|salary|income)/i]) {
    const m = t.match(re);
    const v = m && money(m[1]);
    if (v && v >= 10_000 && v <= 1_000_000) return v;
  }
  return null;
}

// ── Article registry: add an entry per /learn article you want to match ──────────
// queries = the Reddit searches to run (relevance-sorted); fit = title keywords that
// mean the article actually answers the thread; pitch = one line for the comment draft.
const ARTICLES = {
  "super-on-track": {
    path: "/learn/super-on-track",
    name: "Is your super on track for your age?",
    queries: ['"how much super"', "behind on super", "super on track", "am I behind super", "average super balance age"],
    fit: ["on track", "behind", "how much super", "enough super", "super at", "average super", "median super", "for my age", "super balance", "am i", "compare", "retirement savings", "25", "30", "35", "40", "catch up"],
    pitch:
      "a free calculator that compares your balance to the typical for your age and shows whether you're on track for a comfortable retirement (with a catch-up figure if not), all in today's dollars",
    extract: (text) => {
      const t = text.toLowerCase();
      const out = {};
      const age = parseAge(t); if (age) out.age = age;
      const sup = parseSuper(t); if (sup) out.super = sup;
      const inc = parseIncome(t); if (inc) out.income = inc;
      return out;
    },
    draft: (v, url) => {
      const have = [v.age && `${v.age}`, v.super && `about $${Math.round(v.super / 1000)}k in super`, v.income && `earning ~$${Math.round(v.income / 1000)}k`].filter(Boolean).join(", ");
      const lead = have ? `At ${have}, a quick gut-check: ` : `A quick way to gut-check this: `;
      return (
        `${lead}it helps to compare against the typical balance for your age and whether you're on track for a comfortable retirement, ` +
        `rather than just "above average" (the average is skewed high).\n\n` +
        `I built a free calculator that does exactly that — in today's dollars${v.age || v.super ? ", prefilled with your numbers" : ""}: ${url}\n\n` +
        `(Disclosure: it's my tool. Happy to explain the assumptions.)`
      );
    },
  },
  "average-australian": {
    path: "/learn/average-australian-retirement",
    name: "Can the average Australian retire comfortably?",
    queries: ["can I retire", "enough to retire", '"how much do I need"', "comfortable retirement", "retire comfortably"],
    fit: ["retire", "comfortable", "how much", "enough", "need to retire", "average", "asfa", "nest egg", "balance to retire"],
    pitch:
      "a breakdown (with a calculator) of whether the average Australian actually retires comfortably — reproducing the viral thread and adding the average-vs-median catch",
  },
  "early-super": {
    path: "/learn/early-super-access",
    name: "Accessing super early — what it really costs",
    queries: ["access super early", "withdraw super early", "early release super", "super for housing"],
    fit: ["access super", "early", "withdraw", "release", "super for", "hardship", "take out super"],
    pitch: "an explainer + calculator on what taking super out early really costs, in today's dollars",
  },
};

// ── CLI ──────────────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);
if (args.list || !args.article) {
  console.log("Articles you can match (--article=<key>):\n");
  for (const [k, a] of Object.entries(ARTICLES)) console.log(`  ${k.padEnd(20)} ${a.name}`);
  if (!args.article) console.log("\nPass --article=<key>. Add more in the ARTICLES registry.");
  process.exit(0);
}
const ART = ARTICLES[args.article];
if (!ART) {
  console.error(`Unknown article "${args.article}". Run with --list.`);
  process.exit(1);
}
const SUBS = (args.subs ? String(args.subs) : "AusFinance,fiaustralia,AusHENRY").split(",").map((s) => s.trim()).filter(Boolean);
const HOURS = Number(args.hours ?? 168); // default 7 days — outreach wants a wider window than the scan
const MIN_FIT = Number(args.min ?? 2);
const LIMIT = Number(args.limit ?? 20);
const OUT = args.out ? String(args.out) : null;
const SAVE = !!args.save; // write results to the DB (DATABASE_URL) — use `railway run` for prod
const T = HOURS <= 168 ? "week" : HOURS <= 744 ? "month" : "year";
const articleUrl = `${SITE}${ART.path}`;
const prefilledUrl = (parsed) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(parsed || {})) qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${articleUrl}?${s}` : articleUrl;
};
const cutoffMs = Date.now() - HOURS * 3600 * 1000;

// ── Fit scoring ──────────────────────────────────────────────────────────────────
const QUESTION_RE = /\?|\b(how|should|am|is|are|what|when|can|do|does|would|could|where|why|which)\b/i;
function fitScore(title) {
  const t = (title || "").toLowerCase();
  const matched = ART.fit.filter((kw) => t.includes(kw));
  let score = matched.length * 2;
  const isQ = QUESTION_RE.test(t) || /\bi\b|\bmy\b/.test(t); // questions / first-person → prime comment targets
  if (isQ) score += 2;
  return { score, matched, isQ };
}

// ── Scrape one search ─────────────────────────────────────────────────────────────
async function search(page, sub, q) {
  const url = `https://www.reddit.com/r/${sub}/search/?q=${encodeURIComponent(q)}&restrict_sr=1&sort=relevance&t=${T}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(4000);
  return page.evaluate(() =>
    [...document.querySelectorAll('a[data-testid="post-title"]')].slice(0, 25).map((a) => {
      let card = a;
      for (let i = 0; i < 10 && card.parentElement; i++) {
        card = card.parentElement;
        if (card.querySelector && card.querySelector("faceplate-timeago")) break;
      }
      const t = card.querySelector("faceplate-timeago");
      return {
        title: a.innerText.trim(),
        href: a.getAttribute("href"),
        ts: t?.getAttribute("ts") || t?.getAttribute("datetime") || "",
      };
    }),
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext({
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  viewport: { width: 1280, height: 1600 },
});
const page = await ctx.newPage();

const byId = new Map();
for (const sub of SUBS) {
  let subHits = 0;
  for (const q of ART.queries) {
    try {
      const results = await search(page, sub, q);
      for (const r of results) {
        if (!r.href || byId.has(r.href)) continue;
        const createdMs = new Date(r.ts).getTime();
        if (Number.isFinite(createdMs) && createdMs < cutoffMs) continue; // outside window (undated → keep)
        const { score, matched, isQ } = fitScore(r.title);
        if (score < MIN_FIT) continue;
        byId.set(r.href, { ...r, sub, createdMs, fit: score, matched, isQ });
        subHits++;
      }
    } catch (e) {
      console.error(`  r/${sub} "${q}": ${String(e).slice(0, 80)}`);
    }
  }
  console.error(`  r/${sub}: ${subHits} candidate(s)`);
}
const rows = [...byId.values()].sort(
  (a, b) => b.fit - a.fit || (b.createdMs || 0) - (a.createdMs || 0),
);
const top = rows.slice(0, LIMIT);

// Enrich the top candidates (only when saving, since it opens each post): parse the
// values from title+body, build the prefilled page link, and draft a response.
async function openBody(href) {
  await page.goto(`https://www.reddit.com${href}`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForTimeout(3000);
  return page.evaluate(() => (document.querySelector('[slot="text-body"]')?.innerText || "").slice(0, 2000));
}
if (SAVE) {
  console.error(`  enriching ${top.length} candidate(s)…`);
  for (const p of top) {
    try {
      const body = ART.extract ? await openBody(p.href) : "";
      p.parsed = ART.extract ? ART.extract(`${p.title}\n${body}`) : {};
    } catch {
      p.parsed = {};
    }
    p.prefilled = prefilledUrl(p.parsed);
    p.response = ART.draft ? ART.draft(p.parsed, p.prefilled) : `${ART.pitch} — ${p.prefilled}`;
  }
}
await browser.close();

const ageStr = (ms) => {
  if (!Number.isFinite(ms)) return "?";
  const h = (Date.now() - ms) / 3600000;
  return h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
};
const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);

let md = `# Reddit outreach matches — ${ART.name}\n`;
md += `_Article: ${articleUrl} · scanned ${SUBS.map((s) => "r/" + s).join(", ")} · last ${HOURS}h · ${stamp} · ${rows.length} candidates_\n\n`;
md += `> ⚠️ **Comment genuinely.** Only reply where the article truly answers the question, lead with a real answer in your own words, disclose it's your tool, and follow each subreddit's self-promotion rules (several AU finance subs restrict links or require flair). Don't copy-paste the same comment around — that's spam and gets you (and the link) banned.\n\n`;
md += `---\n\n`;
if (top.length === 0) {
  md += `_No candidates over the fit threshold (min ${MIN_FIT}) in the window. Try --hours=720 or --min=1, or tweak the article's queries/fit terms in the registry._\n`;
} else {
  top.forEach((p, i) => {
    const link = `https://www.reddit.com${p.href}`;
    md += `## ${i + 1}. [${p.title}](${link})\n`;
    const parsedStr = p.parsed && Object.keys(p.parsed).length ? ` · parsed ${Object.entries(p.parsed).map(([k, v]) => `${k}=${v}`).join(" ")}` : "";
    md += `r/${p.sub} · ${ageStr(p.createdMs)} ago · fit ${p.fit}${p.isQ ? " · question" : ""}${parsedStr}\n`;
    if (p.prefilled) md += `prefilled: ${p.prefilled}\n`;
    if (p.response) md += `draft: ${p.response.replace(/\s+/g, " ").slice(0, 200)}…\n`;
    md += `matched: ${p.matched.join(", ") || "(recency only)"}\n\n`;
  });
}

process.stdout.write(md);
if (OUT) {
  try {
    mkdirSync(dirname(OUT), { recursive: true });
  } catch {
    /* exists */
  }
  writeFileSync(OUT, md);
  console.error(`\nWrote ${OUT}`);
}

// ── Save to the DB (deduped) ───────────────────────────────────────────────────────
if (SAVE) {
  // Prefer the PUBLIC url: this tool runs OUTSIDE Railway (via `railway run`), where the
  // internal host (postgres.railway.internal) isn't reachable — only the public proxy is.
  const dbUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("\n--save: no DATABASE_PUBLIC_URL / DATABASE_URL in env. Run via `railway run` (link the Postgres service) to target prod, or set DATABASE_URL for a local DB.");
  } else if (/\.railway\.internal[:/]/.test(dbUrl)) {
    console.error("\n--save: the only DB URL is the INTERNAL railway host (postgres.railway.internal), which isn't reachable from your machine.");
    console.error("        Link the Postgres service so DATABASE_PUBLIC_URL is injected:  railway link -s Postgres  (then re-run with `railway run`).");
  } else if (top.length === 0) {
    console.error("\n--save: nothing to write.");
  } else {
    const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(dbUrl);
    const c = new pg.Client({ connectionString: dbUrl, ssl: local ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
    try {
      await c.connect();
      let ins = 0, dup = 0;
      for (const p of top) {
        const createdIso = Number.isFinite(p.createdMs) ? new Date(p.createdMs).toISOString() : null;
        const res = await c.query(
          `insert into reddit_outreach
             (reddit_url, reddit_title, subreddit, article_slug, reddit_created_at, fit_score, matched, parsed, prefilled_url, suggested_response)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           on conflict (reddit_url, article_slug) do nothing`,
          [`https://www.reddit.com${p.href}`, p.title, p.sub, args.article, createdIso, p.fit, (p.matched || []).join(", "), JSON.stringify(p.parsed || {}), p.prefilled, p.response],
        );
        res.rowCount > 0 ? ins++ : dup++;
      }
      await c.end();
      console.error(`\n--save: inserted ${ins}, skipped ${dup} duplicate(s) → reddit_outreach (${dbUrl.replace(/:\/\/[^@]+@/, "://***@").replace(/\/[^/]*$/, "")}).`);
    } catch (e) {
      console.error(`\n--save: DB write FAILED — ${String(e).slice(0, 160)}`);
      try { await c.end(); } catch { /* already closed */ }
      process.exitCode = 1;
    }
  }
}
