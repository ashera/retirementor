#!/usr/bin/env node
// Reddit relevance scanner for RetireWiz content/feature research.
//
// WHY: Reddit blocks server-side fetches (WebFetch, the .json API → 403), but a real
// browser renders fine. So we drive headless Chromium (Playwright) over each
// subreddit's /new/ feed, keep the posts from the last N hours, and rank them by how
// relevant their titles are to what our Australian retirement planner models.
//
// USAGE:
//   node scripts/reddit-scan.mjs                 # defaults: 48h, AusFinance+fiaustralia+AusHENRY
//   node scripts/reddit-scan.mjs --hours=48 --subs=AusFinance,fiaustralia --min=3 --limit=25
//   node scripts/reddit-scan.mjs --out=scratchpad/reddit.md
//
// OUTPUT: a ranked Markdown digest to stdout (and --out file if given). Each row links
// the thread with its age, score, comments and the keywords it matched — so you can
// eyeball which threads are worth turning into a /learn article, demo scenario, or
// feature (as we did for the "average Australian" and FIRE@45 pieces).

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ── CLI args ───────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);
const SUBS = (args.subs ? String(args.subs) : "AusFinance,fiaustralia,AusHENRY").split(",").map((s) => s.trim()).filter(Boolean);
const HOURS = Number(args.hours ?? 48);
const MIN_RELEVANCE = Number(args.min ?? 3);
const LIMIT = Number(args.limit ?? 25);
const MAX_SCROLLS = Number(args.scrolls ?? 14);
const OUT = args.out ? String(args.out) : null;

// ── Relevance model: what our AU retirement planner actually models ──────────────
// Each keyword carries a weight; a title match counts, with a bonus for appearing in
// the title (that's all we scrape from the feed). Short/ambiguous terms use word
// boundaries so "fire" doesn't match "firefighter".
const STRONG = [
  "retire", "retirement", "retiring", "retiree", "super", "superannuation", "age pension", "pension",
  "preservation age", "drawdown", "safe withdrawal", "nest egg", "comfortable retirement",
  "how much do i need", "annuity", "transfer balance", "concessional", "salary sacrifice",
  "downsizer", "aged care", "asfa", "early retirement", "retire early", "coast fire", "coastfire",
  "barista fire", "centrelink", "account based pension", "preservation", "financial independence",
];
const MEDIUM = [
  "net worth", "contributions", "contribution cap", "defined benefit", "part time", "part-time",
  "franking", "dividend", "compound", "nest-egg", "withdrawal rate", "longevity", "div293",
  "division 293", "nest egg", "super fund", "self funded", "self-funded",
];
const WORD_BOUNDED = new Set(["fire", "swr", "smsf", "etf", "fi"]); // ambiguous → \bword\b
const EXTRA_WB = [
  { kw: "fire", w: 3 }, { kw: "swr", w: 3 }, { kw: "smsf", w: 3 }, { kw: "fi", w: 2 },
];

function rx(kw) {
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return WORD_BOUNDED.has(kw) || /^\w+$/.test(kw) && kw.length <= 4 ? new RegExp(`\\b${esc}\\b`) : new RegExp(esc);
}
const STRONG_RX = STRONG.map((kw) => ({ kw, re: rx(kw), w: 3 }));
const MEDIUM_RX = MEDIUM.map((kw) => ({ kw, re: rx(kw), w: 1 }));
const WB_RX = EXTRA_WB.map(({ kw, w }) => ({ kw, re: new RegExp(`\\b${kw}\\b`), w }));
const ALL_RX = [...STRONG_RX, ...WB_RX, ...MEDIUM_RX];

function relevance(title) {
  const t = (title || "").toLowerCase();
  const matched = [];
  let score = 0;
  const seen = new Set();
  for (const { kw, re, w } of ALL_RX) {
    if (seen.has(kw)) continue;
    if (re.test(t)) {
      matched.push(kw);
      score += w;
      seen.add(kw);
    }
  }
  return { score, matched };
}

// ── Scrape one subreddit's /new/ feed down to the time cutoff ────────────────────
async function scanSub(page, sub, cutoffMs) {
  const url = `https://www.reddit.com/r/${sub}/new/`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(3500);
  const extract = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("shreddit-post")].map((p) => ({
        title: p.getAttribute("post-title") || "",
        permalink: p.getAttribute("permalink") || "",
        score: Number(p.getAttribute("score") || 0),
        comments: Number(p.getAttribute("comment-count") || 0),
        created: p.getAttribute("created-timestamp") || "",
        sub: (p.getAttribute("subreddit-prefixed-name") || "").replace(/^r\//, ""),
      })),
    );

  let posts = await extract();
  for (let i = 0; i < MAX_SCROLLS; i++) {
    const oldest = Math.min(...posts.map((p) => new Date(p.created).getTime()).filter(Number.isFinite));
    if (Number.isFinite(oldest) && oldest < cutoffMs) break; // reached the window edge
    const before = posts.length;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1400);
    posts = await extract();
    if (posts.length === before && i > 1) break; // feed stopped growing
  }
  return posts;
}

// ── Main ─────────────────────────────────────────────────────────────────────────
const cutoffMs = Date.now() - HOURS * 3600 * 1000;
const browser = await chromium.launch();
const ctx = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  viewport: { width: 1280, height: 1800 },
});
const page = await ctx.newPage();

const byId = new Map();
for (const sub of SUBS) {
  try {
    const posts = await scanSub(page, sub, cutoffMs);
    let kept = 0;
    for (const p of posts) {
      const createdMs = new Date(p.created).getTime();
      if (!Number.isFinite(createdMs) || createdMs < cutoffMs) continue;
      const id = p.permalink || p.title;
      if (byId.has(id)) continue;
      const { score, matched } = relevance(p.title);
      if (score < MIN_RELEVANCE) continue;
      const engagement = p.score + p.comments;
      // Blend relevance with log-scaled engagement so a popular, on-topic thread (a
      // strong content/feature signal) outranks a niche zero-upvote question.
      const rank = Math.round((score + Math.log10(1 + engagement) * 2) * 10) / 10;
      byId.set(id, { ...p, createdMs, relevance: score, matched, engagement, rank });
      kept++;
    }
    console.error(`  r/${sub}: ${posts.length} fetched → ${kept} relevant in last ${HOURS}h`);
  } catch (e) {
    console.error(`  r/${sub}: FAILED — ${String(e).slice(0, 120)}`);
  }
}
await browser.close();

const rows = [...byId.values()].sort(
  (a, b) => b.rank - a.rank || b.engagement - a.engagement || b.createdMs - a.createdMs,
);
const top = rows.slice(0, LIMIT);

const ageStr = (ms) => {
  const h = (Date.now() - ms) / 3600000;
  return h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
};
const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
let md = `# Reddit scan — AU retirement relevance (last ${HOURS}h)\n`;
md += `_Scanned ${SUBS.map((s) => "r/" + s).join(", ")} · ${stamp} · ${rows.length} relevant, showing top ${top.length}_\n\n`;
if (top.length === 0) {
  md += `_No posts over the relevance threshold (min ${MIN_RELEVANCE}) in the window. Try --hours=72 or --min=2._\n`;
} else {
  top.forEach((p, i) => {
    const link = `https://www.reddit.com${p.permalink}`;
    md += `## ${i + 1}. [${p.title}](${link})\n`;
    md += `r/${p.sub} · ${ageStr(p.createdMs)} ago · ▲ ${p.score} · 💬 ${p.comments} · rank ${p.rank} (relevance ${p.relevance})\n`;
    md += `matched: ${p.matched.join(", ")}\n\n`;
  });
}

process.stdout.write(md);
if (OUT) {
  try {
    mkdirSync(dirname(OUT), { recursive: true });
  } catch {
    /* dir exists */
  }
  writeFileSync(OUT, md);
  console.error(`\nWrote ${OUT}`);
}
