// Hand-drawn line icons that give each budget category a visual identity.
// Self-contained SVG (no external assets), themed per-category via a hue so the
// cards read at a glance on the dark UI.

export const CATEGORY_COLOR: Record<string, string> = {
  housing: "#34d399", // emerald
  energy: "#fbbf24", // amber
  food: "#fb923c", // orange
  health: "#fb7185", // rose
  transport: "#38bdf8", // sky
  household: "#a78bfa", // violet
  leisure: "#f472b6", // pink
  travel: "#22d3ee", // cyan
};

function Paths({ k }: { k: string }) {
  switch (k) {
    case "housing":
      return (
        <>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10v10h13V10" />
          <path d="M10 20v-5h4v5" />
        </>
      );
    case "energy":
      return <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" />;
    case "food":
      return (
        <>
          <path d="M6.5 8h11l-1.2 12H7.7z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </>
      );
    case "health":
      return (
        <path d="M12 20S4 14.5 4 8.8A4 4 0 0 1 12 6a4 4 0 0 1 8 2.8C20 14.5 12 20 12 20z" />
      );
    case "transport":
      return (
        <>
          <path d="M3 13.5 5 8h14l2 5.5V17.5H3z" />
          <circle cx="7.5" cy="17.5" r="1.8" />
          <circle cx="16.5" cy="17.5" r="1.8" />
        </>
      );
    case "household":
      return (
        <>
          <path d="M8.5 4.5 5.5 7l2 2 1-1v11.5h7V8l1 1 2-2-3-2.5-1.5-.5a2 2 0 0 1-4 0z" />
        </>
      );
    case "leisure":
      return (
        <>
          <path d="M4.5 5h15l-7.5 8.5z" />
          <path d="M12 13.5V20" />
          <path d="M8.5 20h7" />
        </>
      );
    case "travel":
      return <path d="M3.5 11.5 21 4l-6 17-3.5-7.5z" />;
    default:
      return <circle cx="12" cy="12" r="7" />;
  }
}

export default function BudgetCategoryIcon({
  categoryKey,
  size = 22,
  className,
}: {
  categoryKey: string;
  size?: number;
  className?: string;
}) {
  const color = CATEGORY_COLOR[categoryKey] ?? "#94a3b8";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl ${className ?? ""}`}
      style={{ backgroundColor: `${color}1f`, width: size + 18, height: size + 18 }}
      aria-hidden
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Paths k={categoryKey} />
      </svg>
    </span>
  );
}
