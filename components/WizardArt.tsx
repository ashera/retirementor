import type { ReactNode } from "react";

// Generated, self-contained SVG illustrations for the wizard header cards — a
// rounded gradient tile in each step's theme colour with a clean white glyph.
// No external assets; scales crisply at any size.
const ART: Record<string, { from: string; to: string; glyph: ReactNode }> = {
  contributions: {
    from: "#fbbf24",
    to: "#d97706",
    glyph: (
      <g>
        <rect x="15" y="37" width="8" height="12" rx="2" fill="#fff" />
        <rect x="28" y="29" width="8" height="20" rx="2" fill="#fff" />
        <rect x="41" y="20" width="8" height="29" rx="2" fill="#fff" />
        <path d="M17 30l10-7 7 4 12-10" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.85" />
        <path d="M41 15h6v6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.85" />
      </g>
    ),
  },
  outside: {
    from: "#a78bfa",
    to: "#7c3aed",
    glyph: (
      <g fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="32" cy="23" rx="13" ry="5" />
        <path d="M19 23v7c0 2.8 5.8 5 13 5s13-2.2 13-5v-7" />
        <path d="M19 34v7c0 2.8 5.8 5 13 5s13-2.2 13-5v-7" />
      </g>
    ),
  },
  property: {
    from: "#fb923c",
    to: "#ea580c",
    glyph: (
      <g fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 33L32 18l17 15" />
        <path d="M19 31v17h26V31" />
        <rect x="28" y="38" width="8" height="10" />
      </g>
    ),
  },
  income: {
    from: "#2dd4bf",
    to: "#0d9488",
    glyph: (
      <g>
        <rect x="15" y="22" width="34" height="20" rx="3" fill="none" stroke="#fff" strokeWidth="3" />
        <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">$</text>
      </g>
    ),
  },
  goal: {
    from: "#fb7185",
    to: "#e11d48",
    glyph: (
      <g fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="29" cy="35" r="14" />
        <circle cx="29" cy="35" r="7.5" />
        <circle cx="29" cy="35" r="1.6" fill="#fff" />
        <path d="M29 35L45 19" />
        <path d="M39 18h7v7" />
      </g>
    ),
  },
  assumptions: {
    from: "#22d3ee",
    to: "#0891b2",
    glyph: (
      <g strokeLinecap="round">
        <g stroke="#fff" strokeWidth="3" strokeOpacity="0.55">
          <path d="M16 23h32" />
          <path d="M16 34h32" />
          <path d="M16 45h32" />
        </g>
        <circle cx="27" cy="23" r="4.5" fill="#fff" />
        <circle cx="39" cy="34" r="4.5" fill="#fff" />
        <circle cx="23" cy="45" r="4.5" fill="#fff" />
      </g>
    ),
  },
};

export default function WizardArt({ page, className = "h-16 w-16 shrink-0" }: { page: string; className?: string }) {
  const art = ART[page];
  if (!art) return null;
  const id = `wa-${page}`;
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={art.from} />
          <stop offset="1" stopColor={art.to} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id})`} />
      {art.glyph}
    </svg>
  );
}

/** The header card used at the top of a wizard step: eyebrow + blurb on the left,
 *  a themed illustration on the right (matches the Household/You persona cards). */
export function WizardHeaderCard({ eyebrow, blurb, page }: { eyebrow: string; blurb: string; page: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-panel-2/60 p-4">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">{eyebrow}</div>
        <p className="mt-1 text-sm leading-relaxed text-slate-200">{blurb}</p>
      </div>
      <WizardArt page={page} />
    </div>
  );
}
