import Link from "next/link";
import type { ReactNode } from "react";
import type { KbSection } from "@/lib/knowledgeBase";

// Renders a knowledge-base article body. Server component (pure) — the inline
// text supports a tiny markdown subset: **bold** and [text](/href). Internal
// links (starting "/") use next/link; anything else is a plain anchor.

const INLINE = /(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)/g;

export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      const href = m[3];
      const label = m[2];
      out.push(
        href.startsWith("/") ? (
          <Link key={key++} href={href} className="font-medium text-accent hover:underline">
            {label}
          </Link>
        ) : (
          <a key={key++} href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
            {label}
          </a>
        ),
      );
    } else if (m[4]) {
      out.push(
        <strong key={key++} className="font-semibold text-white">
          {m[5]}
        </strong>,
      );
    }
    last = INLINE.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function KbContent({ sections }: { sections: KbSection[] }) {
  return (
    <div className="space-y-8">
      {sections.map((sec, i) => (
        <section key={i}>
          {sec.heading && <h2 className="mb-3 text-lg font-semibold text-white">{sec.heading}</h2>}
          <div className="space-y-3">
            {sec.body.map((b, j) => {
              if ("p" in b) return <p key={j} className="leading-relaxed text-slate-300">{renderInline(b.p)}</p>;
              if ("list" in b)
                return (
                  <ul key={j} className="space-y-1.5">
                    {b.list.map((li, k) => (
                      <li key={k} className="flex gap-2 leading-relaxed text-slate-300">
                        <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
                        <span>{renderInline(li)}</span>
                      </li>
                    ))}
                  </ul>
                );
              if ("steps" in b)
                return (
                  <ol key={j} className="space-y-1.5">
                    {b.steps.map((st, k) => (
                      <li key={k} className="flex gap-2.5 leading-relaxed text-slate-300">
                        <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
                          {k + 1}
                        </span>
                        <span>{renderInline(st)}</span>
                      </li>
                    ))}
                  </ol>
                );
              if ("note" in b)
                return (
                  <div key={j} className="rounded-xl border border-accent/25 bg-accent/5 px-4 py-3 text-sm leading-relaxed text-slate-300">
                    {renderInline(b.note)}
                  </div>
                );
              if ("formula" in b)
                return (
                  <div key={j} className="overflow-x-auto rounded-lg border border-line bg-panel-2 px-4 py-2.5">
                    <code className="whitespace-pre text-[13px] text-slate-200">{b.formula}</code>
                  </div>
                );
              return null;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
