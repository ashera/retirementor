import Link from "next/link";

type Tab = "review" | "parameters" | "sources" | "tests" | "scenarios" | "moneysmart" | "users" | "media" | "feedback" | "advisers" | "marketing";

export default function AdminTabs({
  active,
  staleCount = 0,
  feedbackCount = 0,
  adviserCount = 0,
}: {
  active: Tab;
  staleCount?: number;
  feedbackCount?: number;
  adviserCount?: number;
}) {
  const tab = (href: string, key: Tab, label: string, badge: number) => {
    const isActive = active === key;
    return (
      <Link
        href={href}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${
          isActive
            ? "bg-accent font-semibold text-ink"
            : "font-medium text-muted hover:text-white"
        }`}
      >
        {label}
        {badge > 0 && (
          <span
            className={`rounded-full px-1.5 text-xs ${
              isActive ? "bg-ink/20 text-ink" : "bg-red-500 text-white"
            }`}
          >
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      {/* Operational / data tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-panel-2 p-1">
        {tab("/admin/review", "review", "Review", 0)}
        {tab("/admin", "parameters", "Parameters", 0)}
        {tab("/admin/sources", "sources", "Sources", staleCount)}
        {tab("/admin/tests", "tests", "Feature Tests", 0)}
        {tab("/admin/scenarios", "scenarios", "Persona Tests", 0)}
        {tab("/admin/moneysmart", "moneysmart", "Moneysmart", 0)}
        {tab("/admin/users", "users", "Users", 0)}
      </div>

      {/* Marketing section */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-panel-2 p-1">
        <span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Marketing</span>
        {tab("/admin/marketing", "marketing", "Kit", 0)}
        {tab("/admin/feedback", "feedback", "Feedback", feedbackCount)}
        {tab("/admin/advisers", "advisers", "Advisers", adviserCount)}
        {tab("/admin/media", "media", "Media", 0)}
      </div>
    </nav>
  );
}
