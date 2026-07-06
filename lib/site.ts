// Central site constants for SEO/metadata. Set NEXT_PUBLIC_SITE_URL to the live
// domain in the deploy environment; the fallback is the current Railway URL.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.retirewiz.com.au").replace(/\/$/, "");
export const SITE_NAME = "RetireWiz";
export const SITE_TAGLINE = "Australian Retirement & Super Planner";
export const SITE_DESCRIPTION =
  "Free Australian retirement calculator — model your superannuation, the means-tested Age Pension, early retirement, fees and how long your money will last, all in today's dollars using current rules. General information only, not financial advice.";
