import type { Metadata, Viewport } from "next";
import "./globals.css";
import Analytics from "@/components/Analytics";
import FooterNav from "@/components/FooterNav";
import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from "@/lib/site";

const title = `${SITE_NAME} — ${SITE_TAGLINE}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "retirement calculator Australia",
    "superannuation calculator",
    "Age Pension calculator",
    "will my super last",
    "early retirement Australia",
    "retirement planner",
    "super projection",
    "how much super do I need",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "finance",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title,
    description: SITE_DESCRIPTION,
    locale: "en_AU",
  },
  twitter: { card: "summary_large_image", title, description: SITE_DESCRIPTION },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : {},
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0e1a",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-AU">
      <body className="flex min-h-screen flex-col antialiased">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-line px-5 py-6 text-center text-xs text-muted print:hidden">
          <FooterNav />
          <p className="mx-auto max-w-3xl">
            <strong className="text-slate-300">{SITE_NAME}</strong> is a
            superannuation forecast tool provided under ASIC Corporations
            (Superannuation Calculators and Retirement Estimates) Instrument
            2022/603 and prepared in line with ASIC Regulatory Guide 276. It
            provides{" "}
            <strong className="text-slate-300">general information only</strong>{" "}
            and is not personal financial product advice — it does not consider
            your objectives, financial situation or needs, and does not promote
            any financial product. All results are estimates shown in
            today&apos;s dollars using ASIC&apos;s default economic assumptions,
            and are not a guarantee of future outcomes. Consider obtaining
            advice from an AFS licensee before making any financial decision.
          </p>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
