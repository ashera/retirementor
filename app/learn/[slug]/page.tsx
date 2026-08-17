import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE_URL } from "@/lib/site";
import { KB_ARTICLES, getArticle, articleDate } from "@/lib/knowledgeBase";
import { articleLd, breadcrumbLd } from "@/lib/seo";
import KbContent from "@/components/KbContent";
import TtrFlowButton from "@/components/TtrFlowButton";
import { TTR_FLOW_EXAMPLE } from "@/lib/au/ttrFlow";

export function generateStaticParams() {
  return KB_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) return {};
  const title = `${a.title} — RetireWiz`;
  return {
    title,
    description: a.summary,
    alternates: { canonical: `${SITE_URL}/learn/${a.slug}` },
    openGraph: { title, description: a.summary, url: `${SITE_URL}/learn/${a.slug}`, type: "article" },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) notFound();

  const related = (a.related ?? []).map(getArticle).filter((x): x is NonNullable<typeof x> => !!x);

  const jsonLd = [
    articleLd({
      headline: a.title,
      description: a.summary,
      path: `/learn/${a.slug}`,
      datePublished: articleDate(a),
      section: a.category,
    }),
    breadcrumbLd([
      { name: "Home", path: "/" },
      { name: "Knowledge base", path: "/learn" },
      { name: a.title, path: `/learn/${a.slug}` },
    ]),
  ];

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <Link href="/learn" className="font-medium hover:text-white">← Knowledge base</Link>
        <span aria-hidden>·</span>
        <span className="text-accent">{a.category}</span>
      </div>

      <header className="mt-5">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">{a.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-slate-300">{a.summary}</p>
        <p className="mt-3 text-xs text-muted">
          Updated{" "}
          <time dateTime={articleDate(a)}>
            {new Date(articleDate(a)).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
          </time>
          {" · "}General information, not financial advice
        </p>
      </header>

      <article className="mt-8">
        <KbContent sections={a.sections} />
      </article>

      {a.slug === "transition-to-retirement" && (
        <section className="mt-8 rounded-2xl border border-accent/25 bg-accent/5 p-5">
          <div className="text-sm font-semibold text-white">See it visually</div>
          <p className="mb-3 mt-1 text-sm text-muted">
            Follow one year&apos;s money — the slice you sacrifice, the tax-free pension that returns it, and the tax
            you save — in an interactive flow-of-funds diagram.
          </p>
          <TtrFlowButton flows={[{ age: 60, flow: TTR_FLOW_EXAMPLE }]} label="See the flow of funds →" />
        </section>
      )}

      {a.examples && a.examples.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">Try it — worked examples</h2>
          <div className="space-y-3">
            {a.examples.map((ex) => (
              <Link
                key={ex.href + ex.label}
                href={ex.href}
                className="group flex items-start gap-3 rounded-2xl border border-line bg-panel p-4 transition hover:border-accent/40 hover:bg-panel-2"
              >
                <span aria-hidden className="mt-0.5 text-lg">🔗</span>
                <span>
                  <span className="font-semibold text-white group-hover:text-accent">{ex.label}</span>
                  <span className="mt-0.5 block text-sm text-muted">{ex.note}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">Related concepts</h2>
          <div className="flex flex-wrap gap-2">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`/learn/${r.slug}`}
                className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm text-slate-300 transition hover:border-accent/40 hover:text-white"
              >
                {r.title}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-12 rounded-2xl border border-accent/30 bg-accent/10 p-6 text-center">
        <h2 className="text-lg font-bold text-white">See it in your own plan</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300">
          Model your super, the Age Pension and how long your money lasts — free, in today&apos;s dollars.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110"
        >
          Open the planner <span aria-hidden>→</span>
        </Link>
      </div>
    </main>
  );
}
