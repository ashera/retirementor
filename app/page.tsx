import { headers } from "next/headers";
import PlannerApp from "@/components/PlannerApp";
import VisitorActivity from "@/components/VisitorActivity";
import { getCurrentUser } from "@/lib/auth";
import { countryFromIp } from "@/lib/geo";
import { listPlans, getDraft } from "@/app/actions/plans";
import { buildReviewData, getActiveConfig } from "@/lib/refdata";
import { getUserStats } from "@/lib/adminUsers";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      logo: `${SITE_URL}/logo.png`,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      inLanguage: "en-AU",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      inLanguage: "en-AU",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "AUD" },
      audience: { "@type": "Audience", geographicArea: { "@type": "Country", name: "Australia" } },
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

export default async function Page() {
  const user = await getCurrentUser();
  const [savedPlans, draft, config] = await Promise.all([
    user ? listPlans() : Promise.resolve([]),
    user ? getDraft() : Promise.resolve(null),
    getActiveConfig(),
  ]);
  const reviewDue = user?.is_admin ? (await buildReviewData()).dueTotal : 0;
  const userStats = user?.is_admin ? await getUserStats() : null;
  // The country flag for the menu bar: a signed-in user's stored country, else the
  // anonymous visitor's country resolved from their IP (same GeoLite lookup we track).
  let country = user?.country ?? null;
  if (!user) {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip");
    country = countryFromIp(ip);
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {!user && <VisitorActivity />}
      <PlannerApp
        user={user ? { email: user.email, isAdmin: user.is_admin, name: user.name, avatarUrl: user.avatar_url } : null}
        country={country}
        savedPlans={savedPlans}
        draft={draft}
        config={config}
        reviewDue={reviewDue}
        userStats={userStats}
      />
    </>
  );
}
