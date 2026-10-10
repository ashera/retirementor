# Content & feature backlog — from Reddit research

Ideas sourced by `npm run reddit:scan` (the Playwright-based AU-finance subreddit scanner).
Each entry notes the thread(s) that inspired it, the angle, what we'd build, and how it maps
to the engine. Re-run the scanner periodically to refresh (`node scripts/reddit-scan.mjs --help`
via the header comment). Shipped pieces move to the bottom.

> Scanner coverage note: logged-out Reddit `/new/` is gated at ~50 posts, so high-volume subs
> (AusFinance) effectively cover the last ~day and the focused subs (fiaustralia, AusHENRY) 2–3 days.

## Open ideas (prioritised)

### 1. "Is your super on track for your age?" — article + on-track gauge  ⭐ IN PROGRESS
- **From:** r/AusFinance "Finally hit $100k in super!!" (389▲, 65💬 — *"I believe 100k at my age is
  above average, yet I still feel behind"*), r/fiaustralia "28M am I behind on Super?", "30 and want
  to be financially stable when I retire".
- **Signal:** the single most recurring, emotionally-charged question across the scan — people
  constantly benchmark their balance against averages by age.
- **Build:** `/learn/super-on-track` article + calculator. Enter age + balance (+ income): (a) peer
  benchmark vs the approximate **median by age** (we already maintain the table on the stats page),
  (b) project to 67 with the same FV formula as the average-Australian piece → on track for
  ASFA-comfortable? (c) a catch-up line ("~$X/yr extra to get on track").
- **Maps to:** the median-by-age table + the FV calculator; companion to `/learn/average-australian-retirement`.
- **Effort:** medium. **SEO:** strong ("how much super should I have at 40").

### 2. "Super vs shares: where should your next dollar go if you want to retire before 60?"
- **From:** r/fiaustralia "Should I put money in both super and shares?" — comments nail the trade-off
  (15%-in + tax-free to the $2.1M TBC + CGT concessions **vs** accessibility before 60; Div293; the new $3M tax).
- **Build:** a crossover calculator — $1 into super (taxed 15%, locked to 60, tax-advantaged) vs $1
  outside (marginal tax, accessible, CGT) across your marginal rate + years to preservation age.
- **Maps to:** the outside-super deferred-CGT engine + the preservation-age bridge. **Effort:** medium.

### 3. "What unpaid super really costs you" — explainer + compounding-gap calculator
- **From:** r/AusFinance "Employer stopped paying super, baby on the way" (52▲, 57💬).
- **Build:** the compounding cost of an SG gap, mirroring the early-super-access calculator. Newsy
  (unpaid super is a known issue). **Effort:** low–medium.

### 4. Div296 ($3M super earnings tax) — engine feature + explainer
- **From:** repeated comment references in the "super vs shares" thread.
- **Note:** we model Div293 but not the proposed $3M earnings tax. A high-balance (AusHENRY) feature
  + explainer. **Effort:** larger (engine change).

## Shipped
- **"Can the average Australian retire comfortably?"** — `/learn/average-australian-retirement`
  (reproduces the viral r/AusFinance thread + the average-vs-median nuance). Commit b6a9bdc.
