import PlannerApp from "@/components/PlannerApp";
import { getCurrentUser } from "@/lib/auth";
import { listPlans, getDraft } from "@/app/actions/plans";
import { buildReviewData, getActiveConfig } from "@/lib/refdata";
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
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PlannerApp
        user={user ? { email: user.email, isAdmin: user.is_admin, name: user.name, avatarUrl: user.avatar_url } : null}
        savedPlans={savedPlans}
        draft={draft}
        config={config}
        reviewDue={reviewDue}
      />
    </>
  );
}
