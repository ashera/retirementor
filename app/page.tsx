import PlannerApp from "@/components/PlannerApp";
import { getCurrentUser } from "@/lib/auth";
import { listPlans, getDraft } from "@/app/actions/plans";
import { buildReviewData, getActiveConfig } from "@/lib/refdata";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  inLanguage: "en-AU",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "AUD" },
  audience: { "@type": "Audience", geographicArea: { "@type": "Country", name: "Australia" } },
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
        user={user ? { email: user.email, isAdmin: user.is_admin } : null}
        savedPlans={savedPlans}
        draft={draft}
        config={config}
        reviewDue={reviewDue}
      />
    </>
  );
}
