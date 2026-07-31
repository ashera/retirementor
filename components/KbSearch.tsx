"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { KB_CATEGORIES, type KbCategory, type KbIndexEntry } from "@/lib/knowledgeBase";

// Client-side searchable index for the knowledge base. Typing filters the
// articles by title / summary / keywords / body (all pre-flattened server-side
// into `text`). No query → everything, grouped by category.

function tokenize(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

export default function KbSearch({ index }: { index: KbIndexEntry[] }) {
  const [q, setQ] = useState("");
  const tokens = tokenize(q);

  const matches = useMemo(() => {
    if (tokens.length === 0) return index;
    // AND across tokens; each token must appear somewhere in the haystack.
    return index.filter((e) => tokens.every((t) => e.text.includes(t)));
  }, [index, tokens]);

  const grouped = useMemo(() => {
    const by = new Map<KbCategory, KbIndexEntry[]>();
    for (const e of matches) {
      const arr = by.get(e.category) ?? [];
      arr.push(e);
      by.set(e.category, arr);
    }
    return KB_CATEGORIES.map((c) => [c, by.get(c) ?? []] as const).filter(([, arr]) => arr.length > 0);
  }, [matches]);

  return (
    <div>
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">🔍</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search concepts — e.g. Age Pension, Monte Carlo, flexible SWR, deeming…"
          aria-label="Search the knowledge base"
          autoFocus
          className="w-full rounded-xl border border-line bg-panel py-3 pl-11 pr-4 text-white outline-none transition placeholder:text-muted focus:border-accent"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-sm text-muted transition hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-muted">
        {tokens.length === 0
          ? `${index.length} concepts`
          : `${matches.length} match${matches.length === 1 ? "" : "es"} for “${q.trim()}”`}
      </p>

      {matches.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-line bg-panel p-8 text-center text-muted">
          No concepts match “{q.trim()}”. Try a broader term, or browse the categories by clearing the search.
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {grouped.map(([cat, entries]) => (
            <section key={cat}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">{cat}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {entries.map((e) => (
                  <Link
                    key={e.slug}
                    href={`/learn/${e.slug}`}
                    className="group rounded-2xl border border-line bg-panel p-4 transition hover:border-accent/40 hover:bg-panel-2"
                  >
                    <h3 className="font-semibold text-white group-hover:text-accent">{e.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{e.summary}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
