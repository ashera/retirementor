"use client";

import { useEffect, useRef, useState } from "react";
import Bert, { type BertPose } from "@/components/Bert";

// Light, original finance/retirement one-liners — Bert-flavoured, no real-person
// attributions (so nothing reads as a misquote).
const QUOTES: string[] = [
  "Compound interest: the quiet magic that works even while you nap.",
  "A budget is just telling your money where to go instead of wondering where it went.",
  "Super is a slow cooker — set it, leave it, and resist lifting the lid for thirty years.",
  "The best time to start saving was years ago. The second best time is before this dialog finishes.",
  "Retirement: when you stop living at work and start working at living.",
  "Time in the market beats timing the market — and beats refreshing this page.",
  "The share market is the only shop where everyone runs for the exit when things go on sale.",
  "A dollar saved is a dollar that keeps working long after you've clocked off.",
  "Don't put all your eggs in one basket — especially if the basket still has a mortgage.",
  "Early retirement is just unemployment with a really good spreadsheet.",
  "Bert's first rule of investing: never check your balance on a Monday.",
  "Money can't buy happiness — but it's far comfier to ponder that in a paid-off home.",
];

// A single fixed pose for the whole dialog — swapping the <img src> mid-load (while
// the main thread is busy) would leave Bert blank until the new pose fetched.
const BERT_POSE: BertPose = "glasses";

/**
 * Full-screen loading dialog for the INITIAL dashboard compute (Monte Carlo +
 * solvers, a few seconds). Locks the page behind a Bert-themed card with rotating
 * humorous finance quotes, so the user sees a deliberate "crunching your numbers"
 * moment rather than a half-built page. Only shown once per session (the parent
 * latches it off after the first load); later edits use the hero's in-place shimmer.
 *
 * A short reveal delay avoids a flash on fast/cached loads, and a minimum on-screen
 * time keeps it from flickering away the instant it appears.
 */
export default function DashboardLoadingOverlay({ active }: { active: boolean }) {
  const [render, setRender] = useState(false); // present in the DOM
  const [show, setShow] = useState(false); // opacity 1 (fade in/out)
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const shownAt = useRef(0);

  // Delayed show + minimum duration, so it never flashes on an instant load.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (active && !render) {
      t = setTimeout(() => {
        setRender(true);
        shownAt.current = Date.now();
        requestAnimationFrame(() => setShow(true));
      }, 180);
    } else if (!active && render) {
      const wait = Math.max(0, 900 - (Date.now() - shownAt.current));
      t = setTimeout(() => {
        setShow(false);
        setTimeout(() => setRender(false), 380);
      }, wait);
    }
    return () => clearTimeout(t);
  }, [active, render]);

  // Rotate the quote (and Bert's pose) while on screen.
  useEffect(() => {
    if (!render) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % QUOTES.length), 2400);
    return () => clearInterval(id);
  }, [render]);

  // Lock scroll underneath.
  useEffect(() => {
    if (!render) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [render]);

  if (!render) return null;
  const quote = QUOTES[idx];

  return (
    <div
      className={`fixed inset-0 z-[70] grid place-items-center p-6 transition-opacity duration-300 ${show ? "opacity-100" : "opacity-0"}`}
      role="status"
      aria-live="polite"
      aria-label="Crunching your retirement numbers"
    >
      <div className="absolute inset-0 bg-ink/85 backdrop-blur-md" />
      <div className="relative w-full max-w-md rounded-3xl border border-line bg-gradient-to-b from-panel-2 to-panel p-8 text-center shadow-2xl">
        <div className="dlo-bob mx-auto w-fit">
          <Bert pose={BERT_POSE} size={118} className="mx-auto" priority />
        </div>

        <div className="mt-3 flex items-center justify-center gap-2 text-accent">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-[0.14em]">Crunching your numbers</span>
        </div>

        <p key={idx} className="dlo-quote mx-auto mt-4 flex min-h-[4.5rem] max-w-xs items-center justify-center text-[15px] font-medium leading-relaxed text-slate-200">
          &ldquo;{quote}&rdquo;
        </p>

        <div className="mx-auto mt-2 h-1.5 w-44 overflow-hidden rounded-full bg-panel-2">
          <div className="dlo-bar h-full w-1/3 rounded-full bg-accent" />
        </div>
        <p className="mt-4 text-[11px] text-muted">Running thousands of market simulations…</p>
      </div>

      <style>{`
        @keyframes dloSlide { 0% { transform: translateX(-130%); } 100% { transform: translateX(360%); } }
        .dlo-bar { animation: dloSlide 1.15s ease-in-out infinite; }
        @keyframes dloQuoteIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
        .dlo-quote { animation: dloQuoteIn .45s ease-out; }
        @keyframes dloBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        .dlo-bob { animation: dloBob 2.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .dlo-bar { animation: none; } .dlo-quote { animation: none; } .dlo-bob { animation: none; }
        }
      `}</style>
    </div>
  );
}
