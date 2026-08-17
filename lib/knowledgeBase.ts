// Knowledge base — plain-English explainers for the key concepts behind the
// planner's calculations, rendered as a searchable library at /learn (index) and
// /learn/<slug> (article). Content is code-authored (one source of truth), so it
// deploys with the app and can link to live example scenarios.
//
// Inline text supports a tiny subset of markdown: **bold** and [text](/href).
// See components/KbContent.tsx for the renderer.

export type KbCategory =
  | "Age Pension"
  | "Aged care"
  | "Spending & withdrawal"
  | "Risk & simulation"
  | "Super, tax & contributions"
  | "How the model works";

export const KB_CATEGORIES: KbCategory[] = [
  "Age Pension",
  "Aged care",
  "Spending & withdrawal",
  "Risk & simulation",
  "Super, tax & contributions",
  "How the model works",
];

/** A block of article body. Discriminated by which key is present. */
export type KbBlock =
  | { p: string } // paragraph (supports **bold** and [text](/href))
  | { list: string[] } // bullet list
  | { steps: string[] } // numbered steps
  | { note: string } // highlighted callout
  | { formula: string } // monospace formula / worked line
  | { table: { headers: string[]; rows: string[][]; caption?: string } }; // comparison table (cells support **bold** + [links]); LLM-friendly for AI summaries

export interface KbSection {
  heading?: string;
  body: KbBlock[];
}

/** A link to a live example — a shared scenario, a tool, or a case study. */
export interface KbExample {
  href: string;
  label: string;
  note: string;
}

export interface KbArticle {
  slug: string;
  title: string;
  category: KbCategory;
  summary: string; // one/two sentences — shown in the index and atop the article
  keywords: string[]; // extra search terms (synonyms, acronyms) beyond the title/summary
  sections: KbSection[];
  examples?: KbExample[];
  related?: string[]; // slugs of related articles
  published?: string; // YYYY-MM-DD first-published date (for Article schema + sitemap); defaults to KB_PUBLISHED_DEFAULT
}

// Baseline publish date for the batch-authored library, used where an article has no
// explicit `published`. Kept STABLE (not the build date) so Article dateModified and the
// sitemap lastModified don't churn on every deploy, which reads as manipulative.
export const KB_PUBLISHED_DEFAULT = "2026-08-01";

/** The first-published date for an article (its own, or the library baseline). */
export function articleDate(a: KbArticle): string {
  return a.published ?? KB_PUBLISHED_DEFAULT;
}

export const KB_ARTICLES: KbArticle[] = [
  // ─────────────────────────────── Age Pension ───────────────────────────────
  {
    slug: "age-pension",
    title: "The Age Pension: who gets it and when",
    category: "Age Pension",
    summary:
      "A means-tested government payment from Age Pension age (67). Most retirees get at least a part pension, and it grows as you spend your savings down.",
    keywords: ["centrelink", "services australia", "pension age", "67", "eligibility", "residency", "part pension", "full pension", "supplement"],
    sections: [
      {
        body: [
          { p: "The **Age Pension** is a fortnightly payment from the Australian Government for older people. It is the backbone of most retirement plans — even fairly comfortable retirees usually receive a **part pension**, and it becomes more important the longer you live and the more you draw your own savings down." },
        ],
      },
      {
        heading: "When it starts",
        body: [
          { p: "You can claim from **Age Pension age**, which is **67** for anyone born on or after 1 January 1957. This is different from your super **preservation age** (60), which is when you can access super. Because super unlocks at 60 but the pension starts at 67, many people fund a [bridge](/learn/preservation-age-bridge) from their own savings in between." },
          { p: "Reaching 67 doesn't guarantee a payment. You also need to meet **residency** rules (generally 10+ years as an Australian resident) and pass the **means tests**." },
        ],
      },
      {
        heading: "How much it pays",
        body: [
          { p: "The maximum, including the pension and energy supplements, is currently around **$31,200 a year for a single** and about **$47,000 combined for a couple**. Rates are set by the government and indexed twice a year (March and September), so they rise over time." },
          { p: "What you actually receive is reduced by an **income test** and an **assets test** — you're paid the **lower** of the two. See [how means testing is calculated](/learn/means-testing) for the exact working." },
          { note: "The family home is exempt from the assets test. That's why a homeowner spending their super down typically sees their part pension **grow** each year — the pension fills the gap as assessable assets fall." },
        ],
      },
    ],
    examples: [
      { href: "/case-studies/does-the-age-pension-matter", label: "Does the Age Pension matter?", note: "How much the pension changes an ordinary retirement — with and without it." },
      { href: "/scenario/retire-55-single", label: "Retire @55 · single", note: "A relatable early retiree where the means-tested pension does the heavy lifting." },
    ],
    related: ["means-testing", "preservation-age-bridge"],
  },
  {
    slug: "means-testing",
    title: "How the Age Pension is calculated (income & assets tests)",
    category: "Age Pension",
    summary:
      "Two tests run in parallel — an income test and an assets test — and you're paid the lower result. Each starts from the maximum pension and tapers it away.",
    keywords: ["means test", "income test", "assets test", "taper", "deeming", "free area", "threshold", "cut-off", "how is the age pension worked out", "reduction"],
    sections: [
      {
        body: [
          { p: "Services Australia runs **two tests** and pays whichever gives the **lower** payment. Each works the same way: start from the maximum pension, work out how far you're over a tax-free threshold (the **free area**), taper the pension down by a set rate, and the result is that test's entitlement." },
        ],
      },
      {
        heading: "The assets test",
        body: [
          { p: "Counts your assessable assets — savings outside super, super, and any investment-property equity — but **not your family home**. Above the free area (currently around **$333,000** for a single homeowner) the pension reduces by **$78 a year for every $1,000** over." },
          { formula: "Maximum pension − (assets over the free area ÷ $1,000 × $78) = assets-test entitlement" },
        ],
      },
      {
        heading: "The income test",
        body: [
          { p: "Your financial assets are **deemed** to earn a set rate (regardless of what they actually earn), and that deemed income is added to other assessable income — rent, and any [income streams](/learn/income-streams) like a defined-benefit or foreign pension. Above the income free area (around **$5,900/yr** single) the pension reduces by **50c for every $1** over." },
          { formula: "Maximum pension − (income over the free area × 50c) = income-test entitlement" },
          { note: "**Deeming** means the test ignores your actual returns and assumes a standard rate. It's why two people with the same savings get the same assessed income even if one holds cash and the other holds shares." },
        ],
      },
      {
        heading: "Which one binds",
        body: [
          { p: "You get the lower of the two. For most retirees with modest savings the **assets test** binds early on; with a large income stream the **income test** can bind instead. The planner shows both tests side by side for every year — click any year on the income chart to see the full working, including which test is binding." },
        ],
      },
    ],
    examples: [
      { href: "/scenario/nomad-retired-60", label: "Retired @60 · DB pension + US Social Security", note: "A case where the income test binds because of large lifelong pension income." },
      { href: "/scenario/retire-55-couple", label: "Retire @55 · couple", note: "The assets test at work for a homeowner couple." },
    ],
    related: ["age-pension", "income-streams"],
  },

  // ─────────────────────────────── Aged care ─────────────────────────────────
  {
    slug: "aged-care-in-australia",
    title: "Aged care in Australia: costs, funding and the means test",
    category: "Aged care",
    summary:
      "A complete guide to paying for aged care in Australia — the two types of care, the four residential fees, the RAD-vs-DAP room decision, the means test, and how it all flows through to your retirement plan and your estate.",
    keywords: ["aged care australia", "my aged care", "residential aged care", "nursing home costs", "support at home", "aged care fees", "aged care means test", "aged care act 2025", "how much does aged care cost", "paying for aged care"],
    sections: [
      {
        body: [
          { p: "Aged care in Australia comes in two forms — **Support at Home** (help while you stay in your own home) and **residential aged care** (moving into a care home). The government fully funds the **clinical care**; you contribute to everyday living, accommodation and non-clinical care, scaled by a **means test**. This guide ties the pieces together — each section links to a deeper explainer, and you can put your own numbers into the [aged care cost calculator](/learn/aged-care-calculator)." },
        ],
      },
      {
        heading: "The two types of care",
        body: [
          { list: [
            "**Support at Home** — the newer home-care program. Clinical care is free; everyday-living and independence services attract means-tested contributions under a combined lifetime cap.",
            "**Residential aged care** — moving into a care home permanently. It carries four charges (below) plus the cost of your room.",
          ] },
        ],
      },
      {
        heading: "What residential care costs",
        body: [
          { p: "Residential care has **four fees**. Clinical care (nursing, medical, allied health) is **fully government-funded** and never charged." },
          {
            table: {
              headers: ["Fee", "What it is", "Amount (2026 vintage)"],
              rows: [
                ["Basic daily fee", "Flat — everyone pays; 85% of the single Age Pension", "~$65.55/day (~$23,900/yr)"],
                ["Hotelling", "**Means-tested** — meals, cleaning, laundry, heating (no cap)", "up to ~$22.15/day (~$8,100/yr)"],
                ["Care contribution (NCCC)", "**Means-tested**, **capped** at $137,917 or 4 years", "up to ~$107.32/day (~$39,200/yr)"],
                ["Accommodation", "Your room — paid as a RAD, a DAP, or a mix", "~$570k RAD, or ~$45k/yr DAP"],
              ],
            },
          },
          { p: "Each fee — and what the acronyms mean — is broken down in [What aged care costs](/learn/aged-care-costs)." },
        ],
      },
      {
        heading: "Paying for the room: RAD or DAP",
        body: [
          { p: "You pay for the room as a **refundable lump sum (RAD)**, a **daily payment (DAP)**, or a mix. The RAD is refundable and **exempt from the Age Pension assets test** (so it can lift your pension); the DAP is an ongoing cost. Under the 2026 Aged Care Act the provider retains ~2%/yr of a RAD for up to 5 years (max 10%). See [Paying for aged care](/learn/aged-care-funding) for the full RAD-vs-DAP comparison and how your home fits in." },
        ],
      },
      {
        heading: "The means test",
        body: [
          { p: "How much of the hotelling and NCCC fees you pay scales with your **assessable assets and income** — from nothing (a full pensioner with modest savings) up to the maximums (a self-funded retiree). It's a **separate** test from the [Age Pension means test](/learn/means-testing), with its own rules — notably, your **former home is counted only up to a cap (~$214,884)**." },
        ],
      },
      {
        heading: "How it flows through your retirement plan",
        body: [
          { p: "Aged care isn't a one-off number — it's a late-life phase that interacts with the rest of your plan: the fees draw down your savings, a RAD moves money into an exempt (pension-lifting) asset, keeping or selling the home changes both your Age Pension and your care cost, and the net-of-retention deposit passes to your estate." },
          { note: "Estimate your own fees — residential or at home, RAD vs DAP, keep vs sell — with the free [aged care cost calculator](/learn/aged-care-calculator), or model a full care phase inside your whole retirement plan in the [planner](/)." },
        ],
      },
    ],
    examples: [
      { href: "/learn/aged-care-calculator", label: "Aged care cost calculator", note: "Estimate the fees, the means test and the RAD/DAP room payment for your situation." },
      { href: "/scenario/aged-care-keep-home", label: "Margaret · keep the home + DAP", note: "~$116k/yr; the plan runs short at 87." },
      { href: "/scenario/aged-care-sell-rad", label: "Margaret · sell to fund a RAD", note: "~$71k/yr; the RAD is refundable and assets-test exempt." },
    ],
    related: ["aged-care-costs", "aged-care-funding", "means-testing"],
    published: "2026-08-17",
  },
  {
    slug: "aged-care-costs",
    title: "What aged care costs: the fees explained",
    category: "Aged care",
    summary:
      "Residential aged care has four fees — a flat basic daily fee plus three means-tested charges — while clinical care is free. Here's each one, and what the acronyms mean.",
    keywords: ["aged care", "RAD", "DAP", "NCCC", "hotelling", "MPIR", "residential aged care", "nursing home", "basic daily fee", "means tested care fee", "Support at Home", "home care", "fees", "aged care act"],
    sections: [
      {
        body: [
          { p: "Aged care in Australia comes in two forms: **Support at Home** (help while you stay in your own home) and **residential aged care** (moving into a care home). The government fully funds the clinical care; you contribute to the rest, scaled by a means test. The figures below are a 2026 vintage and are indexed regularly." },
        ],
      },
      {
        heading: "Residential care: four fees",
        body: [
          { list: [
            "**Basic daily fee** — a flat everyday-living charge everyone pays, set at 85% of the single Age Pension (about **$65.55/day, ~$23,900/yr**). Not means-tested.",
            "**Hotelling contribution** — a means-tested charge for 'hotel' services (meals, cleaning, laundry, heating), up to about **$22.15/day (~$8,100/yr)**. No cap.",
            "**Non-Clinical Care Contribution (NCCC)** — a means-tested charge toward non-clinical personal care (bathing, dressing, mobility), up to about **$107.32/day (~$39,200/yr)** — but **capped**: it stops at **$137,917 over your lifetime, or after 4 years**, whichever comes first.",
            "**Accommodation** — what you pay for the room, as a **RAD** or a **DAP** (see [Paying for aged care](/learn/aged-care-funding)).",
          ] },
          { note: "**Clinical care — nursing, medical and allied health — is fully government-funded.** You never pay for it." },
        ],
      },
      {
        heading: "The acronyms, decoded",
        body: [
          { list: [
            "**RAD — Refundable Accommodation Deposit**: a lump sum you pay for your room. It's **refundable** to you or your estate when you leave (less a small retained amount), and it's **exempt from the Age Pension assets test**.",
            "**DAP — Daily Accommodation Payment**: paying for the room as a daily charge instead of a lump sum — effectively interest on the unpaid room price at the MPIR.",
            "**MPIR — Maximum Permissible Interest Rate**: the government rate that converts a room price into a DAP (currently about **7.96%**). A $570,000 room works out to roughly **$45,000/yr** as a DAP.",
            "**NCCC / hotelling**: the two means-tested care and living charges above.",
          ] },
        ],
      },
      {
        heading: "How the means test scales the fees",
        body: [
          { p: "The hotelling and NCCC charges are **means-tested** — the more assessable income and assets you have, the more you pay, up to the maximums above. A full pensioner with modest savings pays little; a self-funded retiree pays the maximum. This is a **separate** test from the [Age Pension means test](/learn/means-testing), with its own rules — including how your former home is treated. The planner approximates it with a simple means score in this first version." },
        ],
      },
      {
        heading: "Home care (Support at Home)",
        body: [
          { p: "If you're cared for at home instead, the newer **Support at Home** program works similarly: **clinical care is free**, while everyday-living and independence services attract means-tested contributions, under a combined lifetime cap (~$135k across home and residential care)." },
          { note: "These figures are **estimates** and indexed regularly; your actual fees depend on a care assessment and the provider. This is **general information, not financial or aged-care advice** — for your situation, use the government's My Aged Care service or a specialist adviser." },
        ],
      },
    ],
    examples: [
      { href: "/learn/aged-care-calculator", label: "Aged care cost calculator", note: "Move the sliders to estimate the four fees, the RAD/DAP room payment and the means test for your own situation." },
      { href: "/scenario/aged-care-keep-home", label: "Margaret · keep the home + DAP", note: "The four fees plus a ~$45k/yr DAP — ~$116k/yr, and the plan runs short at 87." },
      { href: "/scenario/aged-care-sell-rad", label: "Margaret · sell to fund a RAD", note: "No DAP, so ~$71k/yr; the RAD is refundable and assets-test exempt." },
    ],
    related: ["aged-care-in-australia", "aged-care-funding", "means-testing"],
  },
  {
    slug: "aged-care-funding",
    title: "Paying for aged care: RAD, DAP and the family home",
    category: "Aged care",
    summary:
      "Two decisions drive the whole picture — pay the room as a lump sum (RAD) or a daily charge (DAP), and sell or keep the family home. Both interact with the Age Pension. A worked example.",
    keywords: ["RAD", "DAP", "refundable accommodation deposit", "daily accommodation payment", "family home aged care", "former home", "aged care pension", "sell home aged care", "aged care funding", "MPIR", "protected person"],
    sections: [
      {
        body: [
          { p: "Beyond the [fees](/learn/aged-care-costs), two choices shape the whole picture: **how you pay for the room**, and **what happens to your home**. Both interact with the Age Pension, so they matter more than they first appear." },
        ],
      },
      {
        heading: "RAD vs DAP: lump sum or daily",
        body: [
          {
            table: {
              headers: ["", "RAD — lump sum", "DAP — daily"],
              rows: [
                ["What you pay", "The room price upfront (e.g. ~$570k)", "Interest on the room price at the MPIR (~7.96%)"],
                ["Refundable?", "**Yes** — to you or your estate, less a small retained share", "**No** — an ongoing cost that never comes back"],
                ["Age Pension assets test", "**Exempt** — paying it can **lift** your pension", "The money stays assessable"],
                ["Cash tied up", "A large lump sum", "Nothing large tied up"],
                ["Typical cost", "Retention ~2%/yr, capped at 10%", "~$45k/yr on a $570k room"],
              ],
              caption: "Many people pay a combination of the two. Figures are a 2026 vintage.",
            },
          },
          { formula: "DAP per year = unpaid room price × MPIR   (e.g. $570,000 × 7.96% ≈ $45,000)" },
        ],
      },
      {
        heading: "The family home",
        body: [
          { p: "The home is usually the biggest asset and the hardest decision. For the **aged-care** means test a former home is counted only up to a **capped value (~$214,884)** — but its treatment for the **Age Pension** changes once you move into care:" },
          { list: [
            "**Exempt for 2 years** from the day you enter care, if you keep it.",
            "**After 2 years**, a kept home becomes an **assessable asset** for the Age Pension (at market value), and you're treated as a **non-homeowner** (a higher assets free area partly offsets it).",
            "**Rent it out** and the rent is assessable income that helps pay the fees — but it can reduce your pension.",
            "**A couple**: if your partner still lives there, the home stays **exempt** — they're a 'protected person'. You also become an **'illness-separated' couple** — still assessed on your combined assets, but each paid the higher **single** rate of Age Pension, which usually **increases** your combined pension.",
          ] },
        ],
      },
      {
        heading: "Worked example: Margaret",
        body: [
          { p: "Margaret is a single homeowner who retired at 67 with $500k super, $150k outside super and an $800k home, spending $52k/yr. At 85 she needs 3 years of residential care. Same person, same care — two funding choices:" },
          { list: [
            "**Keep the home, pay DAP** — the accommodation adds ~$45k/yr on top of ~$71k of care and living fees, so about **$116k/yr**. Her $800k of home equity sits **idle** while she pays, and her ~$650k of super + savings **runs short at 87**.",
            "**Sell the home, pay a $550k RAD** — no DAP, so the cost drops to about **$71k/yr**; the $550k RAD is **refundable to her estate** and **exempt from the assets test** (so her Age Pension actually **rises** as she draws down); ~$250k of leftover proceeds plus her super keep the plan **lasting past 92**.",
          ] },
          { note: "Same person, same care need — the funding decision is the difference between **running short at 87** and **lasting past 92**, with a refundable $550k still in the estate. That's why the choice is worth getting right." },
          { p: "This doesn't make selling 'correct' — keeping the home can matter for family, a possible return home, or provider-refund risk. It shows the **mechanism**, so you can ask the right questions." },
        ],
      },
      {
        body: [
          { note: "Illustrative figures from the planner's model (a 2026 vintage of indexed rates) — **general information, not advice**. Aged-care decisions are complex and personal; get advice from a specialist and check the government's My Aged Care service." },
        ],
      },
    ],
    examples: [
      { href: "/learn/aged-care-calculator", label: "Aged care cost calculator", note: "Try RAD vs DAP and keep-vs-sell yourself, and watch the estimated cost move." },
      { href: "/scenario/aged-care-keep-home", label: "Margaret · keep the home + DAP", note: "The idle-home trap: ~$116k/yr and the plan runs short at 87." },
      { href: "/scenario/aged-care-sell-rad", label: "Margaret · sell to fund a RAD", note: "The RAD route: ~$71k/yr, pension rises, plan lasts past 92, deposit refundable." },
    ],
    related: ["aged-care-in-australia", "aged-care-costs", "means-testing"],
  },

  // ─────────────────────────── How the model works ───────────────────────────
  {
    slug: "preservation-age-bridge",
    title: "Preservation age & the early-retirement bridge",
    category: "How the model works",
    summary:
      "Super unlocks at 60 (preservation age) but the Age Pension starts at 67. Retiring earlier means funding the gap from savings outside super.",
    keywords: ["preservation age", "60", "bridge", "early retirement", "access super", "gap years", "outside super", "before pension"],
    sections: [
      {
        body: [
          { p: "There are two age gates in a retirement plan. **Preservation age** (60 for anyone retiring now) is when you can access your super. **Age Pension age** (67) is when the government payment can start. Retiring before either means bridging the gap with money you can actually reach." },
        ],
      },
      {
        heading: "Two bridges",
        body: [
          { list: [
            "**Retire before 60** — super is locked, so you live off **savings and investments outside super** until preservation age. This is the binding constraint for most early retirees.",
            "**Retire 60–67** — you can draw super but not the pension yet. These are the 'bridge years' the pension eventually backstops.",
          ] },
          { p: "The planner models both explicitly: it tracks your outside-super pool separately, spends it down through the bridge, and layers the Age Pension in from 67. If the outside pool runs dry before super unlocks, you'll see the plan fail in those years." },
        ],
      },
    ],
    examples: [
      { href: "/scenario/fire-at-45", label: "FIRE @45", note: "A 45-year-old bridging 15 years to preservation age on outside-super savings." },
      { href: "/scenario/nomad-vietnam", label: "Global nomad · quit @35", note: "How the 35→60 bridge is the binding constraint when super is locked away." },
    ],
    related: ["age-pension", "drawdown-order", "super-vs-outside"],
  },
  {
    slug: "todays-dollars",
    title: "Today's dollars (real vs nominal)",
    category: "How the model works",
    summary:
      "Every figure is shown in today's purchasing power, so $50,000 in 30 years means what $50,000 buys now — not an inflated future number.",
    keywords: ["real", "nominal", "inflation", "cpi", "purchasing power", "deflation", "future dollars", "wage inflation"],
    sections: [
      {
        body: [
          { p: "The planner reports everything in **today's dollars** (also called **real** terms). A projection that shows $50,000 a year at age 85 means *$50,000 of today's spending power* — not a bigger nominal number that merely looks larger because of inflation. This keeps the figures meaningful: you can compare them directly to what things cost now." },
        ],
      },
      {
        heading: "Two-stage deflation",
        body: [
          { p: "Following ASIC's guidance for retirement estimates, the model deflates in two stages: while you're **working**, balances are discounted by **wage inflation** (a bit above CPI, because incomes and the things they buy tend to rise faster); once you're **retired**, by **CPI**. The default assumptions are CPI 2.5% and wage inflation of CPI + 1.2%." },
          { note: "This is why a balance can look like it's *falling* in the chart even while it grows in raw dollar terms — it's being expressed in constant purchasing power." },
        ],
      },
    ],
    examples: [
      { href: "/faq", label: "Retirement & super FAQ", note: "More plain-English background on how the projections are built." },
    ],
    related: ["monte-carlo", "fees"],
  },

  // ───────────────────────── Spending & withdrawal ───────────────────────────
  {
    slug: "safe-withdrawal-rate",
    title: "Safe withdrawal rate (SWR) & the 4% rule",
    category: "Spending & withdrawal",
    summary:
      "The most you can draw each year and still be very likely to last. The famous '4% rule' is a US starting point — Australia's Age Pension usually lets you draw more.",
    keywords: ["swr", "4% rule", "withdrawal rate", "safe withdrawal", "trinity study", "steady swr", "how much can i withdraw"],
    sections: [
      {
        body: [
          { p: "A **safe withdrawal rate** is the percentage of your savings you can spend in the first year — then adjust for inflation each year after — with a high chance of the money lasting your whole retirement. The **4% rule** is the well-known rule of thumb from US research: draw 4% of the starting balance, and historically it survived a 30-year retirement in almost every case." },
        ],
      },
      {
        heading: "The Australian twist",
        body: [
          { p: "4% is conservative here, because Australia has a safety net the US doesn't: the **means-tested [Age Pension](/learn/age-pension)**. As you draw your savings down, the pension grows to partly fill the gap — so a plan that would fail on savings alone often survives. The planner solves for *your* steady SWR given your balances, home ownership and the pension, and it's frequently **5–8%**, higher for leaner portfolios that lean more on the pension." },
          { note: "The withdrawal-rate bar on the dashboard shows your first-year rate against safe / moderate / high bands, plus your solved **steady SWR** marker." },
        ],
      },
    ],
    examples: [
      { href: "/scenario/swr-vs-guardrails", label: "Fixed vs flexible SWR", note: "A $1.2M retiree with both a steady SWR and a higher flexible one, shown side by side." },
      { href: "/scenario/swr-guardrails-good-saver", label: "Good saver · SWR", note: "A leaner portfolio with a higher safe rate — because it leans harder on the Age Pension." },
    ],
    related: ["flexible-swr-guardrails", "flexible-spending", "monte-carlo"],
  },
  {
    slug: "flexible-swr-guardrails",
    title: "Flexible SWR & Guyton-Klinger guardrails",
    category: "Spending & withdrawal",
    summary:
      "If you're willing to trim spending a little after bad markets (and can spend more after good ones), you can start from a higher withdrawal rate. That's the flexible SWR.",
    keywords: ["flexible swr", "guardrails", "guyton klinger", "dynamic spending", "variable spending", "rails", "spending rules"],
    sections: [
      {
        body: [
          { p: "A **steady** SWR assumes you spend the same real amount every year no matter what markets do. A **flexible** SWR assumes you'll respond: ease back a little when your portfolio falls a long way, and spend a bit more when it does well. Because you're not locked into overspending through a downturn, you can safely *start* from a higher rate — typically **1.5–2 percentage points** higher." },
          {
            table: {
              headers: ["", "Fixed (steady) spending", "Flexible (guardrails) spending"],
              rows: [
                ["Starting withdrawal rate", "Lower — must survive the worst market", "**1.5–2pp higher**"],
                ["In a downturn", "Hold spending (higher risk of running out)", "Trim ~10% at the rail (never below your essentials floor)"],
                ["In a boom", "Hold spending", "Raise spending ~10%"],
                ["Trade-off", "Predictable income, but you leave money unspent to be safe", "More income on average, but you must accept real cuts in bad years"],
              ],
            },
          },
        ],
      },
      {
        heading: "How the guardrails work",
        body: [
          { p: "The planner uses the well-known **Guyton-Klinger** rules. Your withdrawal (net of the Age Pension) is checked against upper and lower **rails**:" },
          { list: [
            "If it drifts about **20% above** your target rate (portfolio fell), you cut spending ~**10%**.",
            "If it drifts about **20% below** (portfolio grew), you raise spending ~**10%**.",
            "An **essentials floor** stops cuts from ever taking you below your basic needs.",
          ] },
          { note: "The honest trade-off: a flexible plan 'lasts' partly *because* you cut. In a rough market the flexible spend can dip below the steady level for years — that's the cost of the higher starting rate." },
        ],
      },
    ],
    examples: [
      { href: "/scenario/swr-vs-guardrails", label: "Fixed vs flexible SWR", note: "See the two SWR markers and the honest trade-off in a p10 rough run." },
      { href: "/what-if", label: "What-If board", note: "Toggle 'Flexible spending (guardrails)' on your own plan and watch the effect." },
    ],
    related: ["safe-withdrawal-rate", "flexible-spending", "failsafe-rate"],
  },
  {
    slug: "flexible-spending",
    title: "What 'flexible spending' means",
    category: "Spending & withdrawal",
    summary:
      "Spending that responds to your portfolio instead of a fixed amount every year — the single biggest lever for surviving bad markets.",
    keywords: ["flexible spending", "fixed spending", "variable", "cut spending", "belt tightening", "discretionary", "essentials"],
    sections: [
      {
        body: [
          { p: "**Fixed spending** means drawing the same real amount every year, come what may. **Flexible spending** means adjusting — trimming discretionary costs (travel, dining, hobbies) after a bad run and topping them up after a good one. Real retirees are naturally flexible; a single fixed number hides that." },
        ],
      },
      {
        heading: "Why it matters so much",
        body: [
          { p: "Most plan failures come from being forced to sell assets while they're down early in retirement ([sequence risk](/learn/sequence-risk)). Flexibility breaks that: by spending a little less in the bad years, you leave more invested to recover. In the historical stress test, switching from fixed to flexible spending often turns a plan that fails most downturns into one that survives most of them." },
          { note: "The catch is how *far* you'd really cut. The stress test lets you set the flexibility (from 'cut to the bone' to 'won't cut') and shows how many historical eras survive at each level." },
        ],
      },
    ],
    examples: [
      { href: "/stress-test", label: "Stress test", note: "Compare fixed vs flexible spending against every major downturn since 1929." },
      { href: "/scenario/retire-52-sequence-risk", label: "Retire @52 · sequence risk", note: "A plan that looks fine but needs flexibility to survive real market history." },
    ],
    related: ["flexible-swr-guardrails", "sequence-risk", "failsafe-rate"],
  },
  {
    slug: "drawdown-order",
    title: "Drawdown order & the minimum drawdown",
    category: "Spending & withdrawal",
    summary:
      "In retirement the planner spends outside-super savings before super (it's more tax-efficient), after taking the legislated minimum super drawdown.",
    keywords: ["drawdown order", "minimum drawdown", "account based pension", "which account first", "outside super first", "mandatory withdrawal", "ato minimum"],
    sections: [
      {
        heading: "The mandatory minimum",
        body: [
          { p: "Once super is in a tax-free **account-based pension**, the ATO requires you to withdraw a **minimum** each year — **4%** of the balance under 65, stepping up with age (5% at 65–74, 6% at 75–79, and higher later). You can always take more; you just can't take less." },
        ],
      },
      {
        heading: "Then: outside-super first",
        body: [
          { p: "After the mandatory minimum, the planner funds the rest of your spending from **outside-super savings before super**. Why? Super's earnings in pension phase are **tax-free**, so it's the most valuable place to keep money compounding — you spend the taxed money first. If a minimum super withdrawal is more than you need to spend, the surplus is simply reinvested into your outside savings." },
          { note: "This ordering is means-test-neutral (both super and outside savings are assessable once you're 67), so it improves after-tax outcomes without changing your Age Pension." },
        ],
      },
    ],
    examples: [
      { href: "/scenario/nomad-retired-60", label: "Retired @60", note: "Click any year to see the minimum-drawdown working and how spending is funded in order." },
    ],
    related: ["super-vs-outside", "safe-withdrawal-rate"],
  },
  {
    slug: "failsafe-rate",
    title: "Failsafe withdrawal rate",
    category: "Spending & withdrawal",
    summary:
      "The withdrawal rate that would have survived even the single worst starting year in recorded history — the most cautious possible spend.",
    keywords: ["failsafe", "worst case", "safe max", "big ern", "historical worst", "sorr"],
    sections: [
      {
        body: [
          { p: "Where a safe withdrawal rate targets a *high probability* of success, the **failsafe rate** is the amount that would have survived the **single worst-case** sequence in the historical record — someone who retired at the very worst moment (e.g. right before the 1929 or 1966 downturns). It's the most cautious number a fixed-spending retiree could anchor to." },
          { p: "It's deliberately conservative — it optimises against a once-in-a-century disaster, so most retirees will die with money left over. It's most useful as a floor: 'even in the worst history threw at anyone, this spend would have held.'" },
          { note: "The planner surfaces the failsafe rate on the **stress test** page, alongside the fixed and flexible safe rates, so you can see the full spectrum from cautious to optimistic." },
        ],
      },
    ],
    examples: [
      { href: "/stress-test", label: "Stress test", note: "See your failsafe rate next to the historical era-by-era survival scorecard." },
    ],
    related: ["safe-withdrawal-rate", "sequence-risk", "flexible-spending"],
  },

  // ─────────────────────────── Risk & simulation ─────────────────────────────
  {
    slug: "monte-carlo",
    title: "Monte Carlo simulation & the 'likelihood' figure",
    category: "Risk & simulation",
    summary:
      "The 'X% likely to last' number comes from running your plan through thousands of random market paths, not a single smooth return.",
    keywords: ["monte carlo", "likelihood", "probability", "simulation", "success rate", "chance of lasting", "volatility", "random returns"],
    sections: [
      {
        body: [
          { p: "A single projection uses one smooth average return every year — useful, but no real market behaves like that. **Monte Carlo** runs your plan **thousands of times**, each with a different random sequence of yearly returns drawn from your expected return and its volatility. The share of runs where your money lasts to your planning age becomes the **likelihood** figure (e.g. '92% likely to last')." },
        ],
      },
      {
        heading: "Why a probability, not a yes/no",
        body: [
          { p: "Because markets are uncertain, the honest answer isn't 'yes' or 'no' — it's *how likely*. A plan at 95% is robust; one at 60% carries meaningful risk — some people respond by reducing spending or investment risk. The same machinery powers the safe-withdrawal-rate solver and the effect of turning on [flexible spending](/learn/flexible-spending), which typically lifts the likelihood by reducing draws in bad runs." },
          { note: "Monte Carlo draws returns randomly. For a complementary view that replays *actual* history in order — capturing crashes and recoveries as they really happened — see the [sequence-risk stress test](/learn/sequence-risk)." },
        ],
      },
    ],
    examples: [
      { href: "/", label: "Open the planner", note: "The 'Money lasts' card shows your likelihood; the Quick-adjust sliders update it live." },
    ],
    related: ["sequence-risk", "safe-withdrawal-rate", "todays-dollars"],
  },
  {
    slug: "sequence-risk",
    title: "Sequence-of-returns risk & the historical stress test",
    category: "Risk & simulation",
    summary:
      "The order of returns matters, not just the average. A crash early in retirement is far more dangerous than the same crash later — the stress test replays real history to show it.",
    keywords: ["sequence risk", "sequence of returns", "sorr", "stress test", "market crash", "bear market", "1929", "gfc", "historical", "order of returns"],
    sections: [
      {
        body: [
          { p: "Two retirements can earn the **same average** return and end very differently, purely because of the **order** the returns arrive in. A big loss in the **first few years** — while your balance is largest and you're withdrawing — does lasting damage, because you sell assets while they're down and they're not there to recover. The same loss late in retirement barely matters. This is **sequence-of-returns risk**." },
        ],
      },
      {
        heading: "The historical stress test",
        body: [
          { p: "The planner's **stress test** replays your plan against every major downturn of the last century — 1929, the 1970s stagflation, the GFC, and more — retiring you *straight into* each one. Instead of random returns, it uses the **actual** sequence of returns that followed, so crashes and their recoveries land exactly as they did in history. You get a survival scorecard: how many eras your plan lives through." },
          { note: "The key control is **fixed vs flexible** spending. A plan can survive far more eras when you're willing to trim after a crash — the test shows exactly how many, at each level of belt-tightening." },
        ],
      },
    ],
    examples: [
      { href: "/scenario/retire-52-sequence-risk", label: "Retire @52 · sequence risk", note: "A smooth projection that lasts — but fails most real downturns on fixed spending." },
      { href: "/case-studies/retiring-into-a-market-crash", label: "Retiring into a market crash", note: "A worked case study on sequence risk and how flexibility rescues it." },
    ],
    related: ["monte-carlo", "flexible-spending", "failsafe-rate", "mortality-survival"],
  },
  {
    slug: "mortality-survival",
    title: "Survival-weighted outcomes ('Rich, Broke or Dead')",
    category: "Risk & simulation",
    summary:
      "A run-to-90 test treats every late shortfall as a failure — but you might not live that long. Survival weighting blends 'will it last?' with 'how likely am I to still be here?'",
    keywords: ["mortality", "survival", "rich broke or dead", "life expectancy", "longevity", "outlive your money", "how long will i live"],
    sections: [
      {
        body: [
          { p: "Planning to a fixed age (say 90) counts a shortfall at 89 as a full failure — even though many people won't reach 89. That can make a plan look riskier than it really is. The **survival-weighted** view weights each future year by the chance you're **still alive** to experience it, using Australian Life Tables." },
        ],
      },
      {
        heading: "Rich, broke or dead",
        body: [
          { p: "For each year it splits the outcomes into three: you're **rich** (money comfortably lasting), **broke** (savings gone), or **dead** (didn't reach this age). The headline is the honest one most people actually want: your **chance of outliving your money** — running out *while you're still alive*." },
          { p: "For couples it uses last-survivor mortality (the plan needs to last while *either* partner is alive), and you can set each person's sex for a more accurate curve." },
        ],
      },
    ],
    examples: [
      { href: "/stress-test", label: "Stress test", note: "The survival overlay lives here — see your 'chance you outlive your money'." },
    ],
    related: ["monte-carlo", "sequence-risk"],
  },

  // ────────────────────── Super, tax & contributions ─────────────────────────
  {
    slug: "super-vs-outside",
    title: "Super vs outside-super savings (and how each is taxed)",
    category: "Super, tax & contributions",
    summary:
      "Super in pension phase is tax-free; savings outside super are taxed on their earnings. That difference drives where you hold money and which you spend first.",
    keywords: ["outside super", "non-super", "cgt", "capital gains", "dividends", "tax-free pension", "franking", "investment tax", "brokerage"],
    sections: [
      {
        heading: "Two pools, two tax treatments",
        body: [
          {
            table: {
              headers: ["", "Super (pension phase)", "Outside super"],
              rows: [
                ["Tax on earnings", "**Tax-free** from age 60", "Dividends/distributions taxed each year at your marginal rate"],
                ["Tax on capital gains", "**None** in pension phase", "Taxed on sale (50% discount if held 12+ months)"],
                ["Access", "Locked until [preservation age](/learn/preservation-age-bridge)", "Any time"],
                ["Best used for", "Long-term tax-free compounding", "The early-retirement **bridge** before super unlocks"],
              ],
            },
          },
        ],
      },
      {
        heading: "Why it shapes the plan",
        body: [
          { p: "Because super earnings are tax-free, it's the best place to keep money compounding — so the planner spends [outside savings first](/learn/drawdown-order). Outside super earns its keep as the **bridge** that funds early retirement before super unlocks. The model taxes the outside pool properly: yearly tax on the dividend yield, and deferred, discounted CGT on growth when units are sold to fund spending." },
          { note: "This deferred-CGT treatment (rather than taxing the whole return as income every year) was one of the largest accuracy improvements in the model — it typically lifts the safe withdrawal rate by around a percentage point." },
        ],
      },
    ],
    examples: [
      { href: "/scenario/fire-at-45-high-spend", label: "FIRE @45 · $80k", note: "A large outside-super pool where the CGT treatment is first-order." },
      { href: "/case-studies/will-the-cgt-changes-hurt-your-retirement", label: "Will the CGT changes hurt your retirement?", note: "A worked case on how outside-super capital gains tax flows through a plan." },
    ],
    related: ["drawdown-order", "contribution-caps", "transfer-balance-cap"],
  },
  {
    slug: "contribution-caps",
    title: "Contribution caps & salary sacrifice",
    category: "Super, tax & contributions",
    summary:
      "You can add to super pre-tax (concessional) or after-tax (non-concessional), each capped per year. Salary sacrifice is the main lever to build super faster.",
    keywords: ["concessional", "non-concessional", "contribution cap", "salary sacrifice", "voluntary contributions", "super guarantee", "before tax", "after tax", "15% tax"],
    sections: [
      {
        body: [
          { list: [
            "**Concessional (pre-tax)** — your employer's Super Guarantee plus any salary sacrifice. Taxed at **15%** going in (usually less than your marginal rate, which is the benefit), capped per year.",
            "**Non-concessional (after-tax)** — money you add from already-taxed income. No further contributions tax, but a separate, higher cap.",
          ] },
          { p: "Extra concessional contributions are the classic way to build super faster: you divert income that would be taxed at your marginal rate into super, where it's taxed at 15% and then grows in a low-tax environment." },
        ],
      },
      {
        heading: "In the planner",
        body: [
          { p: "Add voluntary contributions in the wizard's 'Extra contributions' step. The model applies the 15% contributions tax, respects the caps, and — because it now tracks **working-age take-home pay** — shows the income hit of salary-sacrificing, so you see the real trade-off between more super later and less take-home now." },
        ],
      },
    ],
    examples: [
      { href: "/", label: "Open the planner", note: "Add extra contributions in the wizard and watch super at retirement respond." },
    ],
    related: ["super-vs-outside", "transfer-balance-cap", "fees"],
  },
  {
    slug: "recontribution-strategy",
    title: "Recontribution: turning taxable super into tax-free",
    category: "Super, tax & contributions",
    summary:
      "Withdraw a lump sum from super after 60 and put it straight back as an after-tax contribution. It doesn't change how much you have — it converts the 'taxable' part of your super into the 'tax-free' part, which mainly cuts the tax your beneficiaries pay when you die.",
    keywords: ["recontribution", "recontribution strategy", "cash out and recontribute", "taxable component", "tax-free component", "super death benefit tax", "death benefit tax", "non-dependant", "adult children", "spouse equalisation", "non-concessional contribution"],
    sections: [
      {
        body: [
          { p: "A **recontribution strategy** is simple in outline: once you're over 60 and can access your super, you **withdraw a lump sum** (tax-free), then **put it straight back in** as an after-tax (non-concessional) contribution. Your balance ends up the same — but the **tax character** of your super changes." },
        ],
      },
      {
        heading: "Why it works: the two components of super",
        body: [
          { p: "Every super balance is made of two components, and they're taxed differently **when someone else inherits it**:" },
          {
            table: {
              headers: ["Component", "Where it comes from", "Tax on death to a non-dependant"],
              rows: [
                ["**Taxable**", "Employer (SG) and salary-sacrifice contributions, plus all fund earnings", "Taxed at about **15% (+2% Medicare)**"],
                ["**Tax-free**", "The after-tax (non-concessional) contributions you've made", "**Nothing** — passes tax-free"],
              ],
            },
          },
          { p: "For most people super is **mostly taxable** — a whole career of pre-tax contributions and decades of earnings. That's fine while you're alive (from 60 it's all tax-free to you). It only bites when your super passes to a **non-dependant** — typically your **adult children**, who then pay tax on the taxable component. A spouse or a financially-dependent child pays nothing." },
        ],
      },
      {
        heading: "How the swap works",
        body: [
          { steps: [
            "**Withdraw** a lump sum. From age 60 (once you've met a condition of release) this is **tax-free**, and it comes out of the taxable and tax-free components **proportionally**.",
            "**Re-contribute** the same amount as a **non-concessional** (after-tax) contribution — it goes back in as **100% tax-free component**.",
            "**Net effect:** your balance is unchanged, but a slice of your **taxable** component has become **tax-free**.",
          ] },
          { formula: "Converted this swap = withdrawal × (taxable component ÷ total balance)" },
          { p: "Because each swap only converts the taxable **share** of what you take out, you repeat it over a few years (each within the contribution cap) to convert most of your balance — a little less converts each time as the tax-free share grows." },
        ],
      },
      {
        heading: "Where the money lands: pension, accumulation and the cap",
        body: [
          { p: "There's a wrinkle worth understanding, because it's where the strategy can trip up. A non-concessional contribution **can't go into an existing account-based pension** — it has to land in an **accumulation** account. And in accumulation, earnings are **taxed at 15%**, not tax-free as they are in pension phase." },
          { p: "So a recontribution actually moves money **out of the tax-free pension environment and into accumulation**. To get it back to earning tax-free, you **start a fresh account-based pension** with it — which is why the strategy is usually run as a **commute → recontribute → restart the pension** refresh, resetting the tax-free/taxable split across your whole balance in one go." },
          { note: "The limit on all this is the [Transfer Balance Cap](/learn/transfer-balance-cap) — the lifetime ceiling (around $2 million) on how much you can hold in a tax-free pension. You can only move the money back into pension phase if you have **cap room**. If you're already at the cap, the recontributed amount is stranded in **accumulation** and its earnings are taxed at 15% — a drag that can eat into, or even outweigh, the death-tax saving." },
          { p: "RetireWiz models the refresh: it routes the recontributed amount back into your pension pool up to your remaining Transfer Balance Cap, so for a retiree under the cap the money stays in retirement phase and keeps earning tax-free. Only an amount that would push you over the cap is left in accumulation." },
        ],
      },
      {
        heading: "A worked example",
        body: [
          { p: "Meg, 66 and retired, has **$500,000** in super — all of it the taxable component. If she died today and left it to her adult son, he'd pay about **17% × $500,000 ≈ $85,000** in death-benefit tax." },
          { p: "She withdraws **$130,000** (tax-free — she's over 60) and re-contributes it as a non-concessional contribution. Her balance is back to $500,000, but now **$130,000 is tax-free** and **$370,000 is taxable**." },
          { note: "Her son's potential tax drops to about **17% × $370,000 ≈ $62,900** — roughly **$22,000 less**, from one swap. Repeating it over a few years converts most of the balance." },
        ],
      },
      {
        heading: "What it's used for",
        body: [
          { list: [
            "**Cutting the death-benefit tax** for non-dependant beneficiaries (adult children) — the main use.",
            "**Evening up super between spouses** — withdraw from one and contribute to the other, to balance two accounts (useful for making the most of **two** tax-free pension caps).",
            "**Sheltering super from the Age Pension assets test** — moving money into a younger spouse's accumulation account, which isn't assessed until they reach [pension age](/learn/means-testing).",
          ] },
        ],
      },
      {
        heading: "The rules and the catch",
        body: [
          { list: [
            "You must be able to **access** your super (a condition of release — usually **age 60 and retired**, or **65** regardless).",
            "The re-contribution is a **non-concessional contribution**, so it's capped — around **$130,000 a year**, or roughly three years' worth at once under the **bring-forward** rule (see [contribution caps](/learn/contribution-caps)).",
            "You must be **under 75**, and your **total super balance** must be under the limit to make non-concessional contributions.",
            "It only helps if you have a **taxable component** and a **non-dependant** beneficiary — for a spouse it makes no difference to the death-benefit tax.",
          ] },
          { note: "The mechanics — the caps, the bring-forward trigger, and timing — are technical, and a mistimed contribution can breach a cap. This is **general information, not advice**; get personal advice before acting." },
        ],
      },
      {
        heading: "In the planner",
        body: [
          { p: "RetireWiz tracks your taxable and tax-free components through the whole projection and shows, on your dashboard, the **tax your beneficiaries would pay** if you died at your planning age. The **Recontribute** lever on the [What-If board](/what-if) lets you model the strategy and see the effect." },
        ],
      },
    ],
    examples: [
      { href: "/what-if", label: "What-If board", note: "Toggle the Recontribute lever and watch how it shifts the taxable/tax-free split." },
    ],
    related: ["super-vs-outside", "contribution-caps", "transfer-balance-cap", "drawdown-order"],
    published: "2026-08-17",
  },
  {
    slug: "transfer-balance-cap",
    title: "The Transfer Balance Cap (tax-free super limit)",
    category: "Super, tax & contributions",
    summary:
      "There's a lifetime limit on how much super you can move into a tax-free pension. Above it, the excess stays in accumulation and its earnings are taxed at 15%.",
    keywords: ["transfer balance cap", "tbc", "accumulation phase", "pension phase", "1.9 million", "two pool", "super cap", "tax free limit"],
    sections: [
      {
        body: [
          { p: "The **Transfer Balance Cap (TBC)** limits how much super you can move into the tax-free **pension phase** — currently around **$2 million** per person. Anything above the cap has to stay in **accumulation phase**, where earnings are taxed at **15%** (still low, just not free)." },
        ],
      },
      {
        heading: "How the planner handles it",
        body: [
          { p: "For larger balances the model tracks super as **two pools** — a tax-free pension pool up to the cap and a taxed accumulation pool above it — and taxes each correctly. It also matters for the means test: super in accumulation phase is treated differently before Age Pension age. Most people never hit the cap, but for high balances it materially changes the after-tax result." },
        ],
      },
    ],
    related: ["super-vs-outside", "contribution-caps", "means-testing"],
  },
  {
    slug: "fees",
    title: "Super fees and why they matter",
    category: "Super, tax & contributions",
    summary:
      "A percentage fee quietly reduces your return every year and compounds over decades. The planner models fees explicitly because they're often the biggest gap in a forecast.",
    keywords: ["fees", "admin fee", "investment fee", "insurance", "moneysmart", "expense ratio", "cost", "0.85%"],
    sections: [
      {
        body: [
          { p: "Super funds charge fees: a **percentage** admin/investment fee (a share of your balance each year), often a **fixed dollar** admin fee, and sometimes **insurance** premiums. A percentage fee looks tiny — 0.85% — but it comes off your return *every year* and compounds, so over a working life it can cost tens of thousands." },
          { p: "The planner deducts fees explicitly: the percentage fee reduces your return, and fixed admin and insurance are dollar deductions in the ledger. Funds usually quote returns **after** investment fees, so the planner's 'before fees' return sits a little higher and then takes the fee out separately — matching the way Moneysmart models it." },
          { note: "You can set your own fees in the wizard's Assumptions step. Fees were the single largest source of difference when reconciling the planner against Moneysmart." },
        ],
      },
    ],
    examples: [
      { href: "/", label: "Open the planner", note: "Adjust the admin/investment fee in Assumptions and see super at retirement change." },
    ],
    related: ["todays-dollars", "contribution-caps"],
  },
  {
    slug: "transition-to-retirement",
    title: "Transition to Retirement: same take-home, more super, less tax",
    category: "Super, tax & contributions",
    summary:
      "From age 60 you can salary-sacrifice more and draw a tax-free TTR pension to replace the pay you give up — shifting income from your marginal rate down to super's 15%. Your take-home holds; the tax you save builds super.",
    keywords: ["ttr", "transition to retirement", "ttr pension", "salary sacrifice", "preservation age", "60", "contribution swap", "tax-free pension", "still working"],
    sections: [
      {
        body: [
          { p: "**Transition to Retirement (TTR)** lets you start a super pension while you're still working, from your **preservation age of 60**. Paired with extra salary sacrifice, it becomes a tax play: you push more of your pay into super (taxed at **15%** instead of your marginal rate) and draw a **tax-free TTR pension** to top your take-home back up. Your pay packet doesn't change — but more lands in super and the tax office takes less." },
        ],
      },
      {
        heading: "How the swap works",
        body: [
          { p: "Say you sacrifice an extra **$15,000** of salary. Instead of being taxed at your marginal rate (say 32% incl. Medicare = ~$4,800), it's taxed at super's flat **15%** ($2,250). To keep your take-home whole, you draw a **tax-free pension** from super equal to the pay you gave up. The tax you saved — net of the 15% — simply stays in super." },
          { formula: "Extra super = income tax saved on the slice − 15% contributions tax" },
          { note: "The higher your marginal rate, the bigger the gap between it and 15% — so TTR is worth more to higher earners, right up to your concessional contributions cap." },
        ],
      },
      {
        heading: "What it doesn't do",
        body: [
          { p: "Since 2017 a TTR pension's **earnings are taxed at 15%**, the same as accumulation — so there's **no earnings advantage**, only the contribution swap. TTR pension payments must be between **4% and 10%** of the pension balance each year. And the extra sacrifice is capped by your [concessional contributions cap](/learn/contribution-caps) (~$32,500/yr including the Super Guarantee)." },
          { p: "It's most powerful in the years just before you retire, while you're still on a high marginal rate. Once you stop work, an ordinary account-based pension takes over." },
        ],
      },
      {
        heading: "How the planner models it",
        body: [
          { p: "Add **Transition to Retirement** as a What-If lever (or set it up while you refine your plan). In each year you're 60+ and still working, the engine raises your concessional contribution, lowers your assessable income (so income tax and the 2% Medicare levy fall), and draws a tax-free TTR pension to hold your take-home exactly. In a couple, each partner still working past 60 can run their own. Open the **flow-of-funds diagram** below to see exactly where one year's money goes." },
        ],
      },
    ],
    examples: [
      { href: "/what-if", label: "Try it in What-If", note: "Toggle Transition to Retirement and watch super at retirement rise at no cost to your take-home." },
    ],
    related: ["contribution-caps", "super-vs-outside", "todays-dollars"],
  },
  {
    slug: "income-streams",
    title: "Other income streams (DB pensions, annuities, foreign pensions)",
    category: "Super, tax & contributions",
    summary:
      "Lifelong income outside super — a defined-benefit pension, annuity, or foreign pension like US Social Security — modelled as a first-class source that offsets your drawdown.",
    keywords: ["income stream", "defined benefit", "annuity", "foreign pension", "us social security", "db pension", "other income", "indexed pension", "lifelong income"],
    sections: [
      {
        body: [
          { p: "Some retirees have **guaranteed lifelong income** that isn't super drawdown — a **defined-benefit pension**, an **annuity**, or a **foreign pension** such as US Social Security. The planner models these as income streams: they offset how much you draw from savings, and you set three things for each — whether it's **indexed** (keeps its real value) or fixed, whether it's **taxable**, and whether it's **assessable** for the Age Pension income test." },
        ],
      },
      {
        heading: "Why a lifelong pension is worth so much",
        body: [
          { p: "An indexed lifelong pension is unusually valuable: it's inflation-proof, it can be **tax-free from Age Pension age** (the seniors offset covers a modest income), and it's only *partially* means-tested. So a relatively small super balance can top it up to a comfortable lifestyle. The trade-off is that the income counts in the [income test](/learn/means-testing), tapering any Age Pension." },
          { note: "Add income streams in the wizard's 'Other income' step — it's a core plan fact, not a what-if." },
        ],
      },
    ],
    examples: [
      { href: "/scenario/nomad-retired-60", label: "Retired @60 · DB + US Social Security", note: "$30,500 of lifelong indexed pension income carrying a plan comfortably past 90." },
    ],
    related: ["means-testing", "non-resident-tax", "super-vs-outside"],
  },
  {
    slug: "non-resident-tax",
    title: "Non-resident (foreign resident) tax",
    category: "Super, tax & contributions",
    summary:
      "If you retire permanently overseas, Australian tax works differently — no tax-free threshold, only Australian-sourced income is taxed, and the Age Pension generally can't be claimed from abroad.",
    keywords: ["non-resident", "foreign resident", "overseas", "expat", "tax residency", "living abroad", "portability", "source"],
    sections: [
      {
        body: [
          { p: "Tax residency changes the whole picture. A **foreign resident** (someone living permanently overseas) is taxed on the **foreign-resident scale**: **no tax-free threshold** (taxed from the first dollar at 30%), **no Medicare levy**, and **no low-income or seniors offsets**." },
        ],
      },
      {
        heading: "Source and the Age Pension",
        body: [
          { p: "A non-resident is taxed only on **Australian-sourced** income. So an Australian defined-benefit pension or rent is taxed here, but **foreign-sourced** income — a foreign pension, or your overseas share portfolio — generally falls outside Australian tax. And the **Age Pension** usually can't be newly claimed from abroad, and existing entitlements are pro-rated after 26 weeks overseas, so the planner treats it as unavailable by default." },
          { note: "Turn this on in the wizard's Assumptions step ('Tax residency'). Non-resident tax is genuinely complex — source rules and tax treaties vary — so it's an estimate. Most people should leave it on 'Resident'." },
        ],
      },
    ],
    examples: [
      { href: "/scenario/nomad-retired-60", label: "Retired @60 abroad", note: "How a foreign-resident retiree's DB pension and US Social Security are treated." },
    ],
    related: ["income-streams", "means-testing", "super-vs-outside"],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getArticle(slug: string): KbArticle | undefined {
  return KB_ARTICLES.find((a) => a.slug === slug);
}

export function articlesByCategory(cat: KbCategory): KbArticle[] {
  return KB_ARTICLES.filter((a) => a.category === cat);
}

/** Flatten an article's text (title, summary, keywords, body) for search indexing. */
export function searchText(a: KbArticle): string {
  const blocks = a.sections.flatMap((s) => [
    s.heading ?? "",
    ...s.body.flatMap((b) =>
      "p" in b ? [b.p] : "list" in b ? b.list : "steps" in b ? b.steps : "note" in b ? [b.note] : "formula" in b ? [b.formula] : [],
    ),
  ]);
  return [a.title, a.summary, a.category, ...a.keywords, ...blocks].join(" ").toLowerCase();
}

/** Lightweight index for the client search component (keeps payload small). */
export interface KbIndexEntry {
  slug: string;
  title: string;
  category: KbCategory;
  summary: string;
  text: string; // pre-flattened lowercase search haystack
}

export function kbIndex(): KbIndexEntry[] {
  return KB_ARTICLES.map((a) => ({ slug: a.slug, title: a.title, category: a.category, summary: a.summary, text: searchText(a) }));
}
