import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { publishedCaseStudies } from "@/lib/caseStudies";

// Only genuinely public content pages belong here — the app tools are per-user
// and behind /compare, /report etc., which we keep out of the index.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/case-studies`, changeFrequency: "monthly", priority: 0.7 },
    ...publishedCaseStudies().map((c) => ({
      url: `${SITE_URL}/case-studies/${c.slug}`,
      lastModified: c.date,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/for-advisers`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/signup`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE_URL}/login`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
