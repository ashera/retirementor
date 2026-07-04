// RetireMentor brand lockup — the supplied artwork (public/logo.png).
// The PNG is on a solid black field; `mix-blend-mode: lighten` drops that
// black against the app's near-black background (--color-ink #0a0e1a) so the
// mark and wordmark sit cleanly without a visible box.
export default function Logo({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="RetireMentor — Australian Retirement Planner"
      className={`h-16 w-auto select-none sm:h-20 ${className}`}
      style={{ mixBlendMode: "lighten" }}
    />
  );
}
