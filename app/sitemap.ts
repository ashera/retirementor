import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { BUILD_DATE } from "@/lib/version";
import { publishedCaseStudies } from "@/lib/caseStudies";
import { KB_ARTICLES, articleDate } from "@/lib/knowledgeBase";

// Only genuinely public content pages belong here — the app tools are per-user
// and behind /compare, /report etc., which we keep out of the index.
// lastModified uses a STABLE content date where we have one (case studies, KB articles),
// and the deploy date (BUILD_DATE) for the app/tool pages that change with each release.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, lastModified: BUILD_DATE, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/about`, lastModified: BUILD_DATE, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/case-studies`, lastModified: BUILD_DATE, changeFrequency: "monthly", priority: 0.7 },
    ...publishedCaseStudies().map((c) => ({
      url: `${SITE_URL}/case-studies/${c.slug}`,
      lastModified: c.date,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/faq`, lastModified: BUILD_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/learn`, lastModified: BUILD_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/learn/aged-care-calculator`, lastModified: BUILD_DATE, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/learn/australian-retirement-statistics`, lastModified: BUILD_DATE, changeFrequency: "monthly", priority: 0.7 },
    ...KB_ARTICLES.map((a) => ({
      url: `${SITE_URL}/learn/${a.slug}`,
      lastModified: articleDate(a),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    { url: `${SITE_URL}/for-advisers`, lastModified: BUILD_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/releases`, lastModified: BUILD_DATE, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/compliance`, lastModified: BUILD_DATE, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/signup`, lastModified: BUILD_DATE, changeFrequency: "yearly", priority: 0.6 },
    // Note: /login and other noindex/per-user routes are deliberately NOT listed — a
    // sitemap should only carry indexable pages. tests/sitemap.test.ts enforces this.
  ];
}
