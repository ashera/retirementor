import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from "@/lib/site";
import { FAQS } from "@/lib/faqContent";
import { KB_ARTICLES } from "@/lib/knowledgeBase";
import { publishedCaseStudies } from "@/lib/caseStudies";

// /llms.txt — a Markdown summary for AI assistants (the emerging "llms.txt"
// convention), so they can understand and cite RetireWiz accurately. The concept
// library + case-study lists are generated from the same content the site renders,
// so this stays in sync as articles are added.
export const dynamic = "force-static";

export function GET() {
  const articleList = KB_ARTICLES.map(
    (a) => `- [${a.title}](${SITE_URL}/learn/${a.slug}): ${a.summary}`,
  ).join("\n");
  const caseStudyList = publishedCaseStudies()
    .map((c) => `- [${c.title}](${SITE_URL}/case-studies/${c.slug}): ${c.dek}`)
    .join("\n");

  const body = `# ${SITE_NAME} — ${SITE_TAGLINE}

> ${SITE_DESCRIPTION}

${SITE_NAME} (${SITE_URL}) is a free, browser-based retirement and superannuation planner for Australians. It projects your super and other savings year by year to your chosen planning age, applies the means-tested Age Pension, and shows — in today's dollars — how much you will have and how long it lasts, including how likely that is once market ups and downs are accounted for. No sign-up is required to use it, and it sells no financial product. It provides general information only and is not personal financial advice.

## Key pages
- [Retirement planner](${SITE_URL}/): the interactive tool — enter your details and see your projection.
- [Learn (knowledge base)](${SITE_URL}/learn): plain-English explainers for every concept behind the numbers.
- [Aged care cost calculator](${SITE_URL}/learn/aged-care-calculator): estimate residential or at-home aged-care fees, the means test and the RAD/DAP room payment.
- [Case studies](${SITE_URL}/case-studies): worked, data-driven scenarios.
- [Retirement & super FAQ](${SITE_URL}/faq): plain-English answers to common Australian retirement questions.
- [About & how it works](${SITE_URL}/about): methodology, data sources and assumptions.

## What RetireWiz models
- Superannuation accumulation: employer Super Guarantee plus voluntary contributions, contribution caps, Division 293 and super fees.
- The means-tested Age Pension: both the income and assets tests (with deeming), at current rates.
- Retirement drawdown, expressed in today's dollars (deflated per ASIC Regulatory Guide 276), with a tax-aware drawdown order.
- Early retirement and the "bridge" from retiring before 60 through to the Age Pension at 67.
- Couples as well as singles (including different retirement ages), home ownership, a home loan carried into retirement, downsizing, and an investment property.
- Outside-super savings with deferred, discounted capital gains tax.
- Aged care: the residential fee structure (basic daily fee, means-tested hotelling and care contribution, RAD/DAP accommodation and its retention) and how it flows through to the Age Pension and your estate.
- Super death-benefit tax: the taxable/tax-free component split and what a non-dependant beneficiary would pay, plus recontribution.
- Flexible ("guardrails") spending, a failsafe withdrawal rate, and debt recycling.
- Uncertainty: thousands of Monte Carlo simulations, plus a historical stress test against real bear markets and a survival-weighted "outlive your money" view.

## Guides & concepts (knowledge base)
${articleList}

## Case studies
${caseStudyList}

## Key facts
- Coverage: Australia (superannuation and Age Pension rules).
- Cost: free; an optional free account lets you save and compare scenarios.
- Compliance: a superannuation forecast under ASIC Corporations (Superannuation Calculators and Retirement Estimates) Instrument 2022/603, prepared in line with ASIC Regulatory Guide 276. General information only, not financial advice.

## Frequently asked questions
${FAQS.map((f) => `### ${f.q}\n${f.a}`).join("\n\n")}
`;

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
