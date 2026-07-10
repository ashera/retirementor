import type { Metadata } from "next";
import AdvisersLanding from "@/components/AdvisersLanding";
import { SITE_URL } from "@/lib/site";

const title = "RetireWiz for Advisers — client-ready AU retirement modelling";
const description =
  "A fast, transparent Australian retirement, superannuation and Age Pension modeller for financial advisers and accountants — strategies live, client-ready reports, white-label, verified against ASIC's Moneysmart. Join the early-access waitlist.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/for-advisers` },
  openGraph: { title, description, url: `${SITE_URL}/for-advisers`, type: "website" },
};

export default function ForAdvisersPage() {
  return <AdvisersLanding />;
}
