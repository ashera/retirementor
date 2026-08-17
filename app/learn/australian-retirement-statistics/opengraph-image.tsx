import { renderOgCard, ogSize, ogContentType } from "@/lib/ogCard";

export const runtime = "nodejs";
export const size = ogSize;
export const contentType = ogContentType;
export const alt = "Australian retirement in numbers";

export default function Image() {
  return renderOgCard("Reference · 2026", "Australian retirement in numbers");
}
