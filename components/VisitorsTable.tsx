"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fmtDate, fmtDateTime, fmtCompact } from "@/lib/au/format";
import FlagWithBasis from "@/components/FlagWithBasis";
import type { AdminVisitorRow } from "@/lib/adminVisitors";

/** City/region (the country is shown as the flag alongside). */
function placeOf(v: AdminVisitorRow): string {
  const parts = [v.city, v.region].filter(Boolean);
  return parts.length ? parts.join(", ") : "";
}

/** A short, readable device string from the user-agent (best-effort). */
function deviceOf(ua: string | null): string {
  if (!ua) return "—";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Macintosh/.test(ua)
        ? "Mac"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  return [browser, os].filter(Boolean).join(" · ") || "Other";
}

function Badge({ label, tone }: { label: string; tone: "super" | "budget" | "whatif" | "stress" }) {
  const cls = {
    super: "bg-emerald-500/15 text-emerald-300",
    budget: "bg-sky-500/15 text-sky-300",
    whatif: "bg-violet-500/15 text-violet-300",
    stress: "bg-amber-500/15 text-amber-300",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

export default function VisitorsTable({ visitors }: { visitors: AdminVisitorRow[] }) {
  const [q, setQ] = useState("");
  const [engagedOnly, setEngagedOnly] = useState(false);
  const query = q.trim().toLowerCase();

  const filtered = useMemo(() => {
    return visitors.filter((v) => {
      if (engagedOnly && !(v.set_super_balance || v.set_budget_income || v.visited_what_if || v.visited_stress_test)) {
        return false;
      }
      if (!query) return true;
      const hay = [v.city, v.region, v.country, v.ip, v.locale, v.user_agent, v.converted_email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
  }, [visitors, query, engagedOnly]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search location / IP / device…"
          className="w-full max-w-sm rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-white outline-none transition focus:border-accent"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={engagedOnly} onChange={(e) => setEngagedOnly(e.target.checked)} />
          Engaged only
        </label>
        <span className="text-xs text-muted">
          {filtered.length}
          {filtered.length !== visitors.length && ` of ${visitors.length}`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Last seen</th>
              <th className="px-4 py-3 text-right">Visits</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Milestones</th>
              <th className="px-4 py-3">Signed up</th>
              <th className="px-4 py-3">Device</th>
              <th className="px-4 py-3">First seen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr key={v.id} className="border-b border-line/60 align-top transition hover:bg-panel-2/40">
                <td className="px-4 py-2.5 whitespace-nowrap text-muted">{fmtDateTime(v.last_seen_at)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-200">{v.visits}</td>
                <td className="px-4 py-2.5 text-slate-200">
                  <FlagWithBasis kind="visitor" id={v.id} code={v.country} showName />
                  {placeOf(v) && <div className="text-xs text-muted">{placeOf(v)}</div>}
                  {v.ip && <div className="text-xs text-muted/70">{v.ip}</div>}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {v.set_super_balance && (
                      <Badge tone="super" label={`Super ${v.super_balance != null ? fmtCompact(v.super_balance) : "✓"}`} />
                    )}
                    {v.set_budget_income && (
                      <Badge tone="budget" label={`Budget ${v.budget_income != null ? fmtCompact(v.budget_income) : "✓"}`} />
                    )}
                    {v.visited_what_if && <Badge tone="whatif" label="What-if" />}
                    {v.visited_stress_test && <Badge tone="stress" label="Stress test" />}
                    {!v.set_super_balance && !v.set_budget_income && !v.visited_what_if && !v.visited_stress_test && (
                      <span className="text-xs text-muted">Looked around</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {v.converted_email ? (
                    <Link
                      href={`/admin/users/${v.converted_user_id}`}
                      className="text-xs font-medium text-accent hover:underline"
                      title={`Signed up as ${v.converted_email}`}
                    >
                      {v.converted_email}
                    </Link>
                  ) : v.signed_up ? (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent" title="Converted (account since deleted)">
                      Converted
                    </span>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted" title={v.user_agent ?? undefined}>
                  {deviceOf(v.user_agent)}
                  {v.locale && <div className="text-xs text-muted/70">{v.locale}</div>}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-muted">{fmtDate(v.first_seen_at)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  {visitors.length === 0 ? "No anonymous visitors recorded yet." : "No visitors match your filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
