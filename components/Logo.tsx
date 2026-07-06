// RetireWiz brand lockup — an inline SVG bridge mark + wordmark (no raster
// asset), so the brand renders crisply and is trivial to restyle/rename.
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex select-none items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 64 48" className="h-9 w-auto sm:h-11" aria-hidden>
        <defs>
          <linearGradient id="logo-bridge" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#0d9488" />
            <stop offset="1" stopColor="#34d399" />
          </linearGradient>
        </defs>
        <path d="M5 41 A27 27 0 0 1 59 41 L46 41 A14 14 0 0 0 18 41 Z" fill="url(#logo-bridge)" />
        <path
          d="M11.5 41 A20.5 20.5 0 0 1 52.5 41"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeDasharray="2.4 5"
          opacity="0.85"
        />
      </svg>
      <div className="leading-none">
        <div className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          <span className="text-accent">Retire</span>
          <span className="text-white">Wiz</span>
        </div>
        <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted sm:text-[10px]">
          Australian Retirement Planner
        </div>
      </div>
    </div>
  );
}
