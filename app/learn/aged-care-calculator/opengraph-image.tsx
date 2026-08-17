import { renderOgCard, ogSize, ogContentType } from "@/lib/ogCard";

export const runtime = "nodejs";
export const size = ogSize;
export const contentType = ogContentType;
export const alt = "Aged care cost calculator";

export default function Image() {
  return renderOgCard("Aged care · Calculator", "Aged care cost calculator");
}
