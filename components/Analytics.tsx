import Script from "next/script";

// Provider-agnostic analytics. Nothing loads unless the matching env var is set,
// so there's zero tracking (and no cookie banner needed) until you opt in.
//   - Plausible (cookieless, privacy-friendly): set NEXT_PUBLIC_PLAUSIBLE_DOMAIN=yourdomain.com
//   - GA4: set NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX  (note: sets cookies — you'll want a consent banner)
const PLAUSIBLE = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const GA = process.env.NEXT_PUBLIC_GA_ID;

export default function Analytics() {
  return (
    <>
      {PLAUSIBLE && (
        <Script
          defer
          data-domain={PLAUSIBLE}
          src="https://plausible.io/js/script.js"
          strategy="afterInteractive"
        />
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
