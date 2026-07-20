// Registry of public "case study" content pages (the /case-studies library). Each
// is a curated, code-authored article; the metadata here powers the library index,
// the footer/sitemap, and per-page SEO. The article body lives in its own route
// under app/case-studies/<slug>/ so it can compute live figures from the engine.

export interface CaseStudyMeta {
  slug: string;
  title: string;
  dek: string; // one-line summary — library card + meta description
  date: string; // ISO published date (absolute)
  readMinutes: number;
  published: boolean;
}

export const CASE_STUDIES: CaseStudyMeta[] = [
  {
    slug: "retiring-into-a-market-crash",
    title: "Retiring straight into a market crash — would your money survive?",
    dek: "We replayed one $1.05M early-retirement plan against every major market crash of the last century. On fixed spending it survives just 2 of 7. Flexible spending lifts that to 5 — but only if you'd actually make the cuts.",
    date: "2026-07-20",
    readMinutes: 5,
    published: true,
  },
  {
    slug: "will-the-cgt-changes-hurt-your-retirement",
    title: "Will the 2027 CGT changes hurt your retirement?",
    dek: "From 1 July 2027 the 50% capital gains tax discount is abolished. We modelled it: for whether your money lasts, the effect is minimal — though a large estate does take a real trim.",
    date: "2026-07-13",
    readMinutes: 5,
    published: true,
  },
  {
    slug: "does-the-age-pension-matter",
    title: "Does the Age Pension actually matter?",
    dek: "Four retirement plans, each modelled with and without the Age Pension. Its importance turns out to depend almost entirely on your wealth and how much you spend.",
    date: "2026-07-13",
    readMinutes: 4,
    published: true,
  },
];

export const publishedCaseStudies = () => CASE_STUDIES.filter((c) => c.published);
export const caseStudyBySlug = (slug: string) =>
  CASE_STUDIES.find((c) => c.slug === slug && c.published);
