// A small, self-contained "MC" mark for the Monte Carlo (likelihood) section:
// an ascending bar-chart "M" beside a segmented roulette-wheel "C" — a nod to the
// method's name (Monte Carlo = games of chance) and to the fan of outcomes it
// produces. Colours are tuned to read on the dark panel rather than the brand's
// white-background original (black wheel segments become slate so they don't
// vanish). Pure inline SVG — no external assets, scales with `className`.
export default function MonteCarloMark({ className }: { className?: string }) {
  // Roulette wheel, drawn as a segmented ring left open on the right → a "C".
  const cx = 54;
  const cy = 22;
  const rO = 19; // outer radius
  const rI = 10; // inner radius (hole)
  const start = 42; // degrees; the drawn ring runs clockwise from here…
  const end = 318; // …to here, leaving the gap facing right
  const N = 10; // segments around the ring

  const red = "#e2483f";
  const dark = "#475569"; // "black" pockets, lightened for the dark UI
  const green = "#22c55e"; // the lone green pocket, up near the opening

  const toXY = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };
  const wedge = (a1: number, a2: number) => {
    const [ox1, oy1] = toXY(rO, a1);
    const [ox2, oy2] = toXY(rO, a2);
    const [ix2, iy2] = toXY(rI, a2);
    const [ix1, iy1] = toXY(rI, a1);
    return `M ${ox1} ${oy1} A ${rO} ${rO} 0 0 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${rI} ${rI} 0 0 0 ${ix1} ${iy1} Z`;
  };

  const step = (end - start) / N;
  const segments = Array.from({ length: N }, (_, i) => {
    const a1 = start + i * step;
    const color = i === N - 1 ? green : i % 2 === 0 ? dark : red;
    return { d: wedge(a1, a1 + step), color };
  });

  return (
    <svg
      viewBox="0 0 78 44"
      className={className}
      role="img"
      aria-label="Monte Carlo"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Bar-chart "M": a slate down-stroke triangle + three rising red bars */}
      <path d="M4 4 L4 40 L16 40 Z" fill="#94a3b8" />
      <rect x="16" y="25" width="6" height="15" rx="1" fill={red} />
      <rect x="24" y="16" width="6" height="24" rx="1" fill={red} />
      <rect x="32" y="6" width="6" height="34" rx="1" fill={red} />

      {/* Roulette-wheel "C": segmented ring + hub */}
      {segments.map((s, i) => (
        <path key={i} d={s.d} fill={s.color} />
      ))}
      <circle cx={cx} cy={cy} r="3.4" fill="#94a3b8" />
      <circle cx={cx} cy={cy} r="1.3" fill="#0f172a" />
    </svg>
  );
}
