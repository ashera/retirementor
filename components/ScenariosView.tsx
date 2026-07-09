"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import AdminTabs from "@/components/AdminTabs";
import { fmtCurrency } from "@/lib/au/format";
import type { CheckpointResult, PersonaReport } from "@/lib/au/scenarios/personas";

function val(v: number | string) {
  return typeof v === "number" ? fmtCurrency(v) : v;
}

// Give each persona a face. Silhouette avatars in /public/avatars, matched to
// each persona's name/gender. Couples get BOTH partners (a male + female pair,
// rendered as a subtle overlap); singles get one. Falls back to a deterministic
// pick if a new persona lacks a mapping.
const AVATAR_BY_KEY: Record<string, string[]> = {
  "solo-sandra": ["agent-1"],
  "coupled-craig-kim": ["agent-4", "agent-3"], // Craig & Kim
  "bridging-ben": ["agent-0"],
  "landlord-lena": ["agent-5"],
  "interest-only-ian": ["agent-2"],
  "selling-sam": ["agent-9"],
  "smsf-sam-sue": ["agent-7", "agent-1"], // Sam & Sue
  "capped-carl": ["agent-7"],
  "full-pension-fiona": ["agent-8"],
  "clearing-clare": ["agent-6"],
};

function avatarSrcs(key: string): string[] {
  const ids =
    AVATAR_BY_KEY[key] ??
    [`agent-${[...key].reduce((h, c) => (h + c.charCodeAt(0)) % 10, 0)}`];
  return ids.map((id) => `/avatars/${id}.jpg`);
}

// Canonical capabilities we want the persona suite to exercise, each satisfied
// by one or more of the personas' `covers` tags. Drives the coverage matrix — a
// feature with no covering persona shows up as a gap.
const FEATURE_GROUPS: { group: string; features: { label: string; tags: string[] }[] }[] = [
  { group: "Household", features: [
    { label: "Single", tags: ["Single"] },
    { label: "Couple", tags: ["Couple"] },
    { label: "Individual super", tags: ["Individual super"] },
    { label: "Joint / SMSF super", tags: ["Joint SMSF"] },
  ] },
  { group: "Home & tenure", features: [
    { label: "Homeowner", tags: ["Homeowner"] },
    { label: "Renter", tags: ["Renter", "Non-homeowner switch"] },
    { label: "Downsize", tags: ["Downsize"] },
    { label: "Downsizer contribution", tags: ["Downsizer contribution"] },
    { label: "Sell & rent", tags: ["Sell & rent"] },
    { label: "Home appreciation", tags: ["Home appreciation"] },
  ] },
  { group: "Retirement timing", features: [
    { label: "Standard (at pension age)", tags: ["Standard retirement"] },
    { label: "Early / bridge", tags: ["Early retirement", "Bridge phase"] },
    { label: "Preservation-age edge", tags: ["Preservation-age edge"] },
  ] },
  { group: "Age Pension means test", features: [
    { label: "Assets-test binding", tags: ["Assets-test binding"] },
    { label: "Income-test binding", tags: ["Income-test binding"] },
    { label: "Assets-test cutout (nil)", tags: ["Assets-test cutout", "Nil pension"] },
    { label: "Full pension", tags: ["Full pension"] },
    { label: "Part pension", tags: ["Part pension"] },
  ] },
  { group: "Contributions & tax", features: [
    { label: "Concessional cap", tags: ["Concessional cap", "Concessional cap hit"] },
    { label: "Division 293", tags: ["Division 293"] },
    { label: "Transition to Retirement", tags: ["Transition to Retirement"] },
  ] },
  { group: "Property & mortgage", features: [
    { label: "Investment property + rent", tags: ["Investment property", "Rental income"] },
    { label: "Property sale + CGT", tags: ["Property sale", "Capital gains tax"] },
    { label: "Interest-only mortgage", tags: ["Interest-only mortgage"] },
    { label: "Clear loan with super", tags: ["Clear loan with super"] },
  ] },
  { group: "Work", features: [
    { label: "Part-time work", tags: ["Part-time work"] },
    { label: "Work Bonus", tags: ["Work Bonus"] },
  ] },
];

// A feature × persona grid so an auditor can see, at a glance, which persona
// exercises each capability — and spot any capability with no coverage.
function CoverageMatrix({ reports }: { reports: PersonaReport[] }) {
  const [open, setOpen] = useState(false);
  const covers = (tags: string[], r: PersonaReport) => tags.some((t) => r.covers.includes(t));
  const allFeatures = FEATURE_GROUPS.flatMap((g) => g.features);
  const gaps = allFeatures.filter((f) => !reports.some((r) => covers(f.tags, r)));
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-panel">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-panel-2/40"
      >
        <span className="flex items-center gap-2">
          <span className={`text-muted transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>▸</span>
          <span className="text-sm font-semibold text-white">Coverage matrix</span>
          <span className="hidden text-xs text-muted sm:inline">— which persona exercises each capability</span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            gaps.length ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"
          }`}
        >
          {gaps.length ? `${gaps.length} uncovered` : `all ${allFeatures.length} covered`}
        </span>
      </button>
      {open && (
        <div className="border-t border-line">
          {gaps.length > 0 && (
            <div className="border-b border-line bg-amber-500/5 px-5 py-2 text-xs text-amber-300">
              No persona covers: {gaps.map((g) => g.label).join(", ")} — add one.
            </div>
          )}
          <div className="overflow-x-auto px-4 py-3">
            <table className="border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-panel px-2 py-1" />
                  {reports.map((r) => (
                    <th key={r.key} className="px-1 pb-2 align-bottom" title={r.name}>
                      <img
                        src={avatarSrcs(r.key)[0]}
                        alt=""
                        className="mx-auto h-6 w-6 rounded-full object-cover ring-1 ring-line"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_GROUPS.map((g) => (
                  <Fragment key={g.group}>
                    <tr>
                      <td
                        colSpan={reports.length + 1}
                        className="sticky left-0 bg-panel px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-accent"
                      >
                        {g.group}
                      </td>
                    </tr>
                    {g.features.map((f) => {
                      const n = reports.filter((r) => covers(f.tags, r)).length;
                      return (
                        <tr key={f.label} className="hover:bg-panel-2/40">
                          <td className={`sticky left-0 z-10 whitespace-nowrap bg-panel px-2 py-1 ${n === 0 ? "text-amber-400" : "text-slate-300"}`}>
                            {f.label}
                          </td>
                          {reports.map((r) => (
                            <td key={r.key} className="px-1 py-1 text-center" title={covers(f.tags, r) ? `${r.name} covers ${f.label}` : undefined}>
                              {covers(f.tags, r) ? <span className="text-accent">●</span> : <span className="text-line">·</span>}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// One face for a single, two subtly-overlapped faces for a couple. The ring is
// the card's own background colour so the overlap reads as a clean crescent.
function PersonaAvatar({ srcs }: { srcs: string[] }) {
  if (srcs.length < 2) {
    return (
      <img
        src={srcs[0]}
        alt=""
        aria-hidden
        className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-line"
      />
    );
  }
  return (
    <div className="flex shrink-0 items-center" aria-hidden>
      <img
        src={srcs[0]}
        alt=""
        className="h-12 w-12 rounded-full object-cover ring-2 ring-panel-2"
      />
      <img
        src={srcs[1]}
        alt=""
        className="-ml-4 h-12 w-12 rounded-full object-cover ring-2 ring-panel-2"
      />
    </div>
  );
}

function Checkpoint({ cp }: { cp: CheckpointResult }) {
  return (
    <div className="rounded-xl border border-line bg-panel">
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div>
          <div className="text-sm font-semibold text-white">{cp.label}</div>
          <div className="text-[11px] uppercase tracking-wide text-muted">{cp.point}</div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            cp.pass ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
          }`}
        >
          {cp.pass ? "✓ Match" : "✗ Mismatch"}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-px overflow-hidden border-y border-line bg-line text-center">
        <div className="bg-panel-2 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-accent">Independent (expected)</div>
          <div className="text-base font-bold tabular-nums text-white">{val(cp.expected)}</div>
        </div>
        <div className="bg-panel-2 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted">Engine (actual)</div>
          <div className="text-base font-bold tabular-nums text-white">{val(cp.actual)}</div>
        </div>
      </div>

      <div className="space-y-1.5 px-4 py-3 text-xs leading-relaxed">
        <div>
          <span className="font-semibold text-slate-200">Source of expected value:</span>{" "}
          <span className="text-muted">{cp.source}</span>
        </div>
        <div>
          <span className="font-semibold text-slate-200">Workings:</span>{" "}
          <span className="text-muted">{cp.workings}</span>
        </div>
        {cp.tolerance > 0 && (
          <div className="text-[11px] text-muted/70">Tolerance ±{fmtCurrency(cp.tolerance)}.</div>
        )}
      </div>
    </div>
  );
}

function PersonaCard({
  report,
  open,
  onToggle,
}: {
  report: PersonaReport;
  open: boolean;
  onToggle: () => void;
}) {
  const passed = report.checkpoints.filter((c) => c.pass).length;
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-panel-2">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-5 text-left transition hover:bg-panel/40"
      >
        <span
          className={`mt-1 shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          ▸
        </span>
        <PersonaAvatar srcs={avatarSrcs(report.key)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-white">{report.name}</h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                report.allPass ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
              }`}
            >
              {report.allPass ? `${passed}/${report.checkpoints.length} match` : `${report.checkpoints.length - passed} mismatch`}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted">{report.blurb}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {report.covers.map((c) => (
              <span key={c} className="rounded-full border border-line bg-panel px-2 py-0.5 text-[11px] text-slate-300">
                {c}
              </span>
            ))}
          </div>
        </div>
      </button>

      {!open && null}
      {open && (
        <div className="border-t border-line p-5">
          <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Inputs</h3>
          <div className="overflow-hidden rounded-xl border border-line">
            {report.inputs.map((row, i) => (
              <div
                key={row.label}
                className={`flex justify-between gap-4 px-3 py-1.5 text-xs ${i % 2 ? "bg-panel" : "bg-panel-2"}`}
              >
                <span className="text-muted">{row.label}</span>
                <span className="text-right font-medium text-slate-200">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Assumptions &amp; why they make the check independent
          </h3>
          <ul className="space-y-1.5 rounded-xl border border-line bg-panel p-3 text-xs text-muted">
            {report.assumptions.map((a) => (
              <li key={a} className="flex gap-2">
                <span className="text-accent">•</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

          <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
            Checkpoints — independent expected vs engine
          </h3>
          <div className="space-y-2.5">
            {report.checkpoints.map((cp) => (
              <Checkpoint key={cp.label} cp={cp} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function ScenariosView({
  email,
  reports,
  staleCount,
  financialYear,
  runAt,
}: {
  email: string;
  reports: PersonaReport[];
  staleCount: number;
  financialYear: string;
  runAt: string; // ISO timestamp of when the page (re)computed the reports server-side
}) {
  // These reports are recomputed live on every page load, so the request time IS
  // the "last run" time. Format in the admin's local timezone after mount so the
  // SSR markup (server timezone) and the hydrated client don't disagree.
  const [runLabel, setRunLabel] = useState<string | null>(null);
  useEffect(() => {
    setRunLabel(
      new Date(runAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }),
    );
  }, [runAt]);

  const total = reports.reduce((s, r) => s + r.checkpoints.length, 0);
  const passed = reports.reduce((s, r) => s + r.checkpoints.filter((c) => c.pass).length, 0);
  const allPass = passed === total;

  // Collapsed by default; auto-expand any persona with a mismatch so failures are
  // never hidden behind an accordion.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(reports.filter((r) => !r.allPass).map((r) => r.key)),
  );
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const expandAll = () => setOpen(new Set(reports.map((r) => r.key)));
  const collapseAll = () => setOpen(new Set());

  // Filtering by free-text and coverage tags so a long cast stays findable.
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState<Set<string>>(new Set());
  const allTags = [...new Set(reports.flatMap((r) => r.covers))].sort();
  const toggleTag = (t: string) =>
    setTags((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  const q = query.trim().toLowerCase();
  const filtered = reports.filter(
    (r) =>
      (q === "" || `${r.name} ${r.blurb} ${r.covers.join(" ")}`.toLowerCase().includes(q)) &&
      (tags.size === 0 || [...tags].every((t) => r.covers.includes(t))),
  );

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-muted hover:text-white">
          ← Planner
        </Link>
        <span className="text-muted">{email} · admin</span>
      </div>

      <AdminTabs active="scenarios" staleCount={staleCount} />

      <header className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest text-accent">
          Backoffice · Scenarios
        </div>
        <h1 className="mt-1 text-3xl font-bold text-white">Independent scenario verification</h1>
        <p className="mt-2 max-w-3xl text-muted">
          Each named persona is projected by the calculation engine and, <em>separately</em>, has its
          key values re-derived from first principles — closed-form superannuation maths and the
          published Age Pension formula (Services Australia income &amp; assets tests, ATO
          contribution/earnings tax). The &lsquo;expected&rsquo; column below is produced by that
          independent reference, <span className="text-slate-200">not</span> by the engine, so a match
          is genuine corroboration rather than a self-referential snapshot.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-line bg-panel px-5 py-4 text-sm">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            allPass ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
          }`}
        >
          {allPass ? "All corroborated" : `${total - passed} mismatch${total - passed === 1 ? "" : "es"}`}
        </span>
        <span className="font-semibold text-white">
          {passed}/{total} checkpoints match the independent reference
        </span>
        <span className="text-muted">{reports.length} personas</span>
        <span className="text-xs text-muted">Computed against the FY{financialYear} reference data</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted" title="Recomputed live from the reference on every page load — this is the request time.">
          <span aria-hidden>🕒</span>
          Just run ·{" "}
          <time dateTime={runAt} className="font-medium text-slate-200 tabular-nums">
            {runLabel ?? "moments ago"}
          </time>
        </span>
      </div>

      <CoverageMatrix reports={reports} />

      {/* Filter */}
      <div className="mb-4 space-y-3 rounded-2xl border border-line bg-panel-2 p-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search personas by name, description or tag…"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-white outline-none placeholder:text-muted focus:border-accent/50"
        />
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => toggleTag(t)}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                tags.has(t)
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line bg-panel text-muted hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
          {(tags.size > 0 || query) && (
            <button
              onClick={() => { setTags(new Set()); setQuery(""); }}
              className="rounded-full px-2.5 py-1 text-[11px] text-muted underline-offset-2 hover:text-white hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between text-xs text-muted">
        <span>
          Showing {filtered.length} of {reports.length} personas
        </span>
        <div className="flex items-center gap-3">
          <button onClick={expandAll} className="transition hover:text-white">Expand all</button>
          <span className="text-line">·</span>
          <button onClick={collapseAll} className="transition hover:text-white">Collapse all</button>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((r) => (
          <PersonaCard key={r.key} report={r} open={open.has(r.key)} onToggle={() => toggle(r.key)} />
        ))}
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-line bg-panel-2 p-8 text-center text-muted">
            No personas match your filter.
          </div>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        The same persona reports drive the automated test suite (Vitest), so this view and the tests
        can never diverge. Expected values are recomputed live from the reference on each page load.
      </p>
    </main>
  );
}
