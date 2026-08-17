import { caseStudyBySlug } from "@/lib/caseStudies";
import { renderOgCard, ogSize, ogContentType } from "@/lib/ogCard";

export const runtime = "nodejs";
export const size = ogSize;
export const contentType = ogContentType;
export const alt = "RetireWiz case study";

const meta = caseStudyBySlug("retiring-into-a-market-crash");

export default function Image() {
  return renderOgCard("Case study", meta?.title ?? "Retiring into a market crash");
}
