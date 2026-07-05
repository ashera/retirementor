// Measures the PDF report at A4 print dimensions and flags any section that
// overflows its page — so page-fit regressions are caught automatically instead
// of by eye. Renders the dev-only /report/measure harness (no DB needed).
//
// Usage:  npm run dev            (note the port it prints — it auto-increments
//                                 to 3001/3002/… if 3000 is taken)
//         BASE_URL=http://localhost:3000 npm run measure:report
// Exits non-zero if any page group (except the allowBreak year table) is taller
// than the A4 content box, so it can gate CI.

import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const URL = `${BASE}/report/measure`;
const CASES = ["simple", "couple", "heavy", "budget", "budget-renter"];

// A4 @96dpi minus 14mm margins on each side (1mm = 3.7795px).
const CONTENT_PX = Math.round((297 - 2 * 14) * 3.7795); // ≈ 1017
const WIDTH_PX = Math.round((210 - 2 * 14) * 3.7795); //   ≈ 688
const TIGHT_PX = CONTENT_PX - 45; // within ~45px of the edge → warn

// Human page names, in order (page 1, then each break-before-page block).
const PAGE_NAMES = ["inputs+summary+balance", "income+lifestages+budget", "range+calculations", "year-table+assumptions"];

async function measure(page) {
  return page.evaluate(() => {
    const report = document.querySelector(".report");
    if (!report) return null;
    const rTop = report.getBoundingClientRect().top;
    const breaks = [...report.querySelectorAll(".break-before-page")];
    const groups = [];
    const firstTop = breaks.length ? breaks[0].getBoundingClientRect().top : report.getBoundingClientRect().bottom;
    groups.push(Math.round(firstTop - rTop)); // page 1: content before the first break
    for (const b of breaks) groups.push(Math.round(b.getBoundingClientRect().height));
    return groups;
  });
}

const browser = await chromium.launch();
let anyFail = false;
console.log(`Report page-fit — A4 content box ${CONTENT_PX}px tall × ${WIDTH_PX}px wide\n`);

for (const c of CASES) {
  const page = await browser.newPage({ viewport: { width: WIDTH_PX, height: 4000 } });
  await page.emulateMedia({ media: "print" });
  let heights;
  try {
    await page.goto(`${URL}?case=${c}`, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForSelector(".report", { timeout: 15000 });
    await page.waitForTimeout(600); // let recharts lay out its SVGs
    heights = await measure(page);
  } catch (e) {
    console.error(`✗ ${c}: failed to load ${URL}?case=${c} — is \`npm run dev\` running?\n  ${e.message}`);
    anyFail = true;
    await page.close();
    continue;
  }
  await page.close();
  if (!heights) { console.error(`✗ ${c}: no .report element found`); anyFail = true; continue; }

  console.log(`● ${c}`);
  heights.forEach((h, i) => {
    // The final block (year-by-year table) is allowBreak — it is DESIGNED to
    // span multiple sheets on long plans, so it's reported but never a failure.
    const spanAllowed = i === heights.length - 1;
    const over = h > CONTENT_PX;
    const tight = !over && h > TIGHT_PX;
    if (over && !spanAllowed) anyFail = true;
    const flag = spanAllowed ? (over ? "spans pages (ok)" : "ok ✓") : over ? "OVERFLOW ✗" : tight ? "tight ⚠" : "ok ✓";
    const name = PAGE_NAMES[i] ?? "extra";
    console.log(`   page ${i + 1} (${name}): ${String(h).padStart(4)} / ${CONTENT_PX}px  ${flag}`);
  });
  console.log("");
}

await browser.close();
console.log(anyFail ? "RESULT: overflow detected ✗" : "RESULT: all pages fit ✓");
process.exit(anyFail ? 1 : 0);
