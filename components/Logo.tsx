// RetireWiz brand lockup — the supplied artwork (public/logo.png). The PNG sits
// on a solid black field; `mix-blend-mode: lighten` drops that black against the
// app's near-black background (--color-ink #0a0e1a) so the mark and wordmark sit
// cleanly without a visible box.
export default function Logo({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="RetireWiz — Australian Retirement Planner"
      className={`h-14 w-auto select-none sm:h-16 ${className}`}
      style={{ mixBlendMode: "lighten" }}
    />
  );
}
