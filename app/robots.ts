import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Crawlers may index the marketing/entry pages but not the private app tools
// (per-user reports, the admin backoffice, or the dev-only wizard preview).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/report", "/wizard-preview"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
