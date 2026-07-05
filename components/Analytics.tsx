import Script from "next/script";

// Provider-agnostic analytics. Nothing loads unless the matching env var is set,
// so there's zero tracking (and no cookie banner needed) until you opt in.
//   - Plausible (cookieless, privacy-friendly): set NEXT_PUBLIC_PLAUSIBLE_DOMAIN
//     to the domain you registered in Plausible (e.g. retirementor.com.au).
//     Self-hosting? Point NEXT_PUBLIC_PLAUSIBLE_HOST at your instance.
//   - GA4: set NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX  (note: sets cookies — you'll want a consent banner)
const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const PLAUSIBLE_HOST = (process.env.NEXT_PUBLIC_PLAUSIBLE_HOST ?? "https://plausible.io").replace(/\/$/, "");
const GA = process.env.NEXT_PUBLIC_GA_ID;

export default function Analytics() {
  return (
    <>
      {PLAUSIBLE_DOMAIN && (
        <>
          {/* Combined script: pageviews + outbound-link clicks + tagged/custom events. */}
          <Script
            defer
            data-domain={PLAUSIBLE_DOMAIN}
            src={`${PLAUSIBLE_HOST}/js/script.outbound-links.tagged-events.js`}
            strategy="afterInteractive"
          />
          {/* Queue stub so track() calls fired before the script loads aren't lost. */}
          <Script id="plausible-init" strategy="afterInteractive">
            {`window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)}`}
          </Script>
        </>
      )}
      {GA && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA}');`}
          </Script>
        </>
      )}
    </>
  );
}
