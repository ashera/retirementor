// Shared FAQ content — rendered on /faq (with FAQPage JSON-LD) and inlined into
// /llms.txt so AI assistants can read the answers directly.
export interface Faq {
  q: string;
  a: string;
}

export const FAQS: Faq[] = [
  {
    q: "How much super do I need to retire in Australia?",
    a: "It depends on the lifestyle you want, whether you own your home, and whether you'll receive the Age Pension. As a rough guide, ASFA's Retirement Standard suggests a homeowner needs around $595,000 (single) or $690,000 (couple) in super for a 'comfortable' retirement, assuming they also draw a part Age Pension. A 'modest' lifestyle needs much less because the Age Pension covers most of it. The most reliable way to know your own number is to model it — that's exactly what the RetireWiz planner does with your real balances, contributions and spending goal.",
  },
  {
    q: "Will my superannuation last through retirement?",
    a: "That comes down to four things: how much you've saved, how much you spend each year, the investment return you earn, and how long you live. Drawing down more than about 4–6% of your balance a year is generally considered aggressive and raises the risk of running out. RetireWiz projects your balance year by year to your chosen planning age and tells you whether — and roughly how likely — your money is to last, including any Age Pension you become entitled to along the way.",
  },
  {
    q: "When can I access my superannuation?",
    a: "You can generally access your super once you reach your 'preservation age' and retire. For everyone retiring now (born after 30 June 1964) the preservation age is 60. You can also access super once you turn 65 even if you're still working. There are limited early-release exceptions for severe financial hardship or compassionate grounds. Accessing super is different from the Age Pension, which starts later.",
  },
  {
    q: "What age can I get the Age Pension in Australia?",
    a: "The Age Pension age is 67 for anyone born on or after 1 January 1957. Reaching Age Pension age doesn't guarantee a payment — you also have to meet the residency rules and pass the income and assets tests. Because super is usually accessible from 60 but the pension starts at 67, many people 'bridge' those years by living off their super first.",
  },
  {
    q: "How much does the Age Pension pay?",
    a: "The maximum Age Pension, including the pension and energy supplements, is around $29,000 a year for a single person and about $44,000 a year combined for a couple. The exact rates are set by the government and indexed twice a year (in March and September), so they rise over time. How much you actually receive is reduced by the income and assets tests. RetireWiz applies the current rates and both tests automatically in your projection.",
  },
  {
    q: "Am I eligible for the Age Pension, and how does means testing work?",
    a: "Eligibility is decided by two tests — an income test and an assets test — and the one that produces the lower payment applies. Your family home is exempt from the assets test, but most other assets (including super in pension phase, savings and investment properties) count. As your assessable assets or income rise, the payment tapers down and eventually cuts out. This is why many retirees receive a part pension that grows as they draw their super down.",
  },
  {
    q: "Can I retire early, before I can access super or the Age Pension?",
    a: "Yes, but you need to fund the gap. To retire before 60 you generally can't touch super, so you'd rely on savings and investments held outside super until preservation age. From 60 to 67 you can draw on super but not yet the Age Pension — the 'bridge' years. RetireWiz is built for this: it models early retirement, your outside-super savings, and the bridge to preservation age and then to the Age Pension.",
  },
  {
    q: "How much super do I need to retire at 60 in Australia?",
    a: "Retiring at 60 means funding more years and bridging to the Age Pension, which doesn't start until 67 — so you generally need more than someone retiring later. There's no single number: it depends on your spending, whether you own your home, your savings outside super, and the returns you earn. Rather than rely on a rule of thumb, model it — RetireWiz projects your super and savings year by year from 60, including the early-retirement 'bridge' before the Age Pension, and tells you whether your money lasts and how likely that is.",
  },
  {
    q: "What's the difference between a 'comfortable' and a 'modest' retirement?",
    a: "These are benchmarks published by the Association of Superannuation Funds of Australia (ASFA). A 'comfortable' retirement — around $52,000 a year for a single and $73,000 for a couple — allows for private health cover, occasional travel, dining out and a reasonable car. A 'modest' retirement — roughly $33,000 (single) and $48,000 (couple) — covers the basics and is better than relying on the Age Pension alone. ASFA updates these figures every quarter for inflation. You can start your budget from these figures inside the planner and adjust them to your own life.",
  },
  {
    q: "How are RetireWiz's projections calculated?",
    a: "Projections are modelled year by year using current Australian rules for super, tax, contribution caps and the means-tested Age Pension. All results are shown in today's dollars so the figures are meaningful now, using default long-term economic assumptions consistent with ASIC's guidance for retirement estimates, and they account for super fees. Because markets are uncertain, the planner also runs thousands of simulations to estimate how likely your money is to last. Results are estimates, not a guarantee of future outcomes.",
  },
  {
    q: "Is RetireWiz free to use?",
    a: "Yes — RetireWiz is completely free. You can model your retirement, run the projections and see how long your money lasts without paying or even creating an account. A free account lets you save and compare multiple scenarios and pick up where you left off on any device. RetireWiz provides general information only and doesn't sell or promote any financial product.",
  },
  {
    q: "Is RetireWiz financial advice?",
    a: "No. RetireWiz provides general information only. It's a superannuation forecast tool prepared in line with ASIC's regulatory guidance and does not consider your personal objectives, financial situation or needs, and does not recommend any specific financial product. It's designed to help you understand your options and have a more informed conversation. Before making a financial decision you should consider getting personal advice from a licensed financial adviser.",
  },
];
