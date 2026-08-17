import { getArticle } from "@/lib/knowledgeBase";
import { renderOgCard, ogSize, ogContentType } from "@/lib/ogCard";

export const runtime = "nodejs";
export const size = ogSize;
export const contentType = ogContentType;
export const alt = "RetireWiz knowledge base";

// Per-article OG card, showing the article's category + title.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = getArticle(slug);
  return renderOgCard(a?.category ?? "Learn", a?.title ?? "Retirement & super, explained");
}
