import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from "@/lib/site";
import { FAQS } from "@/lib/faqContent";

// /llms.txt — a Markdown summary for AI assistants (the emerging "llms.txt"
// convention), so they can understand and cite RetireWiz accurately.
export const dynamic = "force-static";

export function GET() {
  const body = `# ${SITE_NAME} — ${SITE_TAGLINE}

> ${SITE_DESCRIPTION}

${SITE_NAME} (${SITE_URL}) is a free, browser-based retirement and superannuation planner for Australians. It projects your super and other savings year by year to your chosen planning age, applies the means-tested Age Pension, and shows — in today's dollars — how much you will have and how long it lasts, including how likely that is once market ups and downs are accounted for. No sign-up is required to use it, and it sells no financial product. It provides general information only and is not personal financial advice.

## Key pages
- [Retirement planner](${SITE_URL}/): the interactive tool — enter your details and see your projection.
- [Retirement & super FAQ](${SITE_URL}/faq): plain-English answers to common Australian retirement questions.
- [About & how it works](${SITE_URL}/about): methodology, data sources and assumptions.

## What RetireWiz models
- Superannuation accumulation: employer Super Guarantee plus voluntary contributions, contribution caps and super fees.
- The means-tested Age Pension: both the income and assets tests, at current rates.
- Retirement drawdown, expressed in today's dollars (deflated per ASIC Regulatory Guide 276).
- Early retirement and the "bridge" from retiring before 60 through to the Age Pension at 67.
- Couples as well as singles, home ownership, a home loan carried into retirement, and an investment property.
- Uncertainty: thousands of Monte Carlo simulations to estimate how likely your money is to last.

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
