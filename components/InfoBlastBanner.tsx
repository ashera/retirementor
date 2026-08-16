"use client";

import { useEffect, useRef, useState } from "react";
import { getActiveInfoBlasts, type InfoBlast } from "@/app/actions/infoblasts";

const ROTATE_MS = 30_000;

// A rotating announcement banner ("InfoBlast") on the hero card. Content is managed in
// the backoffice (/admin/infoblasts): each blast has an attention-grabbing icon, a title
// and a paragraph of subtext, and can be enabled/disabled. Enabled blasts rotate every
// 30 seconds. When there are none it renders `fallback` (the hero's headroom nudge),
// which this banner occupies the slot of — so nothing useful is lost.
export default function InfoBlastBanner({ fallback = null }: { fallback?: React.ReactNode }) {
  const [blasts, setBlasts] = useState<InfoBlast[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [idx, setIdx] = useState(0);
  const [entering, setEntering] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let live = true;
    getActiveInfoBlasts()
      .then((b) => {
        if (live) {
          setBlasts(b);
          setLoaded(true);
        }
      })
      .catch(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (blasts.length < 2) return;
    timer.current = setInterval(() => {
      setEntering(false); // fade out
      setTimeout(() => {
        setIdx((i) => (i + 1) % blasts.length);
        setEntering(true); // fade in the next
      }, 250);
    }, ROTATE_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [blasts.length]);

  // Before the fetch resolves, render nothing (so we never flash the fallback then
  // swap it out); once loaded with no blasts, show the fallback in this slot.
  if (blasts.length === 0) return loaded ? <>{fallback}</> : null;
  const b = blasts[idx % blasts.length];

  return (
    <div
      className="mt-4 flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent/[0.08] px-4 py-3.5 ring-1 ring-inset ring-accent/10"
      role="status"
      aria-live="polite"
    >
      <span aria-hidden className="mt-0.5 text-2xl leading-none">
        {b.icon || "✨"}
      </span>
      <div
        className={`min-w-0 flex-1 transition-opacity duration-300 ${entering ? "opacity-100" : "opacity-0"}`}
      >
        <div className="text-sm font-bold text-white">{b.title}</div>
        {b.subtext && <p className="mt-0.5 text-[13px] leading-snug text-slate-300">{b.subtext}</p>}
      </div>
      {blasts.length > 1 && (
        <div className="mt-1 flex shrink-0 items-center gap-1.5" aria-hidden>
          {blasts.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition ${i === idx % blasts.length ? "bg-accent" : "bg-accent/25"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
