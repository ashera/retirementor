// RetireMentor brand lockup: a gradient "road/bridge" arch mark + wordmark.
// The mark is inline SVG (crisp at any size, transparent on the dark theme);
// the wordmark uses the app font so it stays consistent with the UI.
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex select-none items-center gap-2.5 ${className}`}>
      <svg
        viewBox="0 0 64 48"
        className="h-9 w-auto"
        role="img"
        aria-label="RetireMentor"
      >
        <defs>
          <linearGradient id="rm-bridge" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#2AA6A0" />
            <stop offset="1" stopColor="#57C06B" />
          </linearGradient>
        </defs>
        {/* road surface: a band swept along a semicircular arch */}
        <path
          d="M5 41 A27 27 0 0 1 59 41 L46 41 A14 14 0 0 0 18 41 Z"
          fill="url(#rm-bridge)"
        />
        {/* dashed centre lane line */}
        <path
          d="M11.5 41 A20.5 20.5 0 0 1 52.5 41"
          fill="none"
          stroke="#EAFBF3"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeDasharray="2.4 5"
          opacity="0.92"
        />
      </svg>
      <div className="leading-none">
        <div className="text-xl font-extrabold tracking-tight">
          <span className="text-accent">Retire</span>
          <span className="text-white">Mentor</span>
        </div>
        <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
          Australian Retirement Planner
        </div>
      </div>
    </div>
  );
}
