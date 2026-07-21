"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/au/format";
import { adminGetPlanData, adminDeletePlan, adminShareLink } from "@/app/actions/admin";

// localStorage keys the planner dashboard reads on mount (see PlannerApp). Writing
// the plan + a fresh timestamp makes the dashboard adopt it over any cloud draft.
const KEY = {
  plan: "au-retirement-plan",
  baseline: "au-retirement-baseline",
  baselineName: "au-retirement-baseline-name",
  ts: "au-retirement-plan-ts",
};

interface PlanRow {
  id: string;
  name: string;
  updated_at: string;
}

/** Admin: list a user's saved scenarios, load any one into the admin's own planner
 *  dashboard (for support / inspection), or delete it. */
export default function UserPlansList({ plans, email }: { plans: PlanRow[]; email?: string }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const share = async (id: string) => {
    setError(null);
    setShareUrl(null);
    setSharingId(id);
    const r = await adminShareLink(id);
    setSharingId(null);
    if (!r.ok || !r.token) {
      setError(r.error ?? "Couldn't create a share link.");
      return;
    }
    const url = `${window.location.origin}/api/s/${r.token}`;
    setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard blocked — the URL is shown below to copy manually */
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete “${name}”? This permanently removes this saved scenario${email ? ` from ${email}` : ""}.`)) return;
    setError(null);
    setDeletingId(id);
    const r = await adminDeletePlan(id);
    if (!r.ok) {
      setError(r.error ?? "Couldn't delete that scenario.");
      setDeletingId(null);
      return;
    }
    router.refresh(); // re-fetch the detail page so the list + count update
    setDeletingId(null);
  };

  const load = async (id: string, name: string) => {
    if (!window.confirm(`Load “${name}” into your dashboard? This replaces your current working plan.`)) return;
    setError(null);
    setLoadingId(id);
    const r = await adminGetPlanData(id);
    if (!r.ok || !r.data) {
      setError(r.error ?? "Couldn't load that plan.");
      setLoadingId(null);
      return;
    }
    try {
      const json = JSON.stringify(r.data);
      localStorage.setItem(KEY.plan, json);
      localStorage.setItem(KEY.baseline, json);
      localStorage.setItem(KEY.baselineName, r.name ?? name);
      localStorage.setItem(KEY.ts, String(Date.now()));
    } catch {
      setError("Couldn't write to local storage.");
      setLoadingId(null);
      return;
    }
    window.location.href = "/"; // full navigation → planner mounts fresh and reads storage
  };

  if (plans.length === 0) return <p className="text-sm text-muted">No saved scenarios.</p>;

  const busy = loadingId != null || deletingId != null || sharingId != null;

  return (
    <>
      {error && <p className="mb-2 text-sm text-red-300">{error}</p>}
      {shareUrl && (
        <div className="mb-2 rounded-lg border border-accent/40 bg-accent/[0.06] px-3 py-2 text-xs">
          <p className="font-medium text-accent">Scenario link copied — send it to Claude:</p>
          <code className="mt-1 block break-all text-slate-200">{shareUrl}</code>
        </div>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
        {plans.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-sm">
            <span className="font-medium text-slate-100">{p.name}</span>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-xs text-muted">updated {fmtDate(p.updated_at)}</span>
              <button
                onClick={() => share(p.id)}
                disabled={busy}
                className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-accent transition hover:border-accent disabled:opacity-40"
              >
                {sharingId === p.id ? "Linking…" : "🔗 Link for Claude"}
              </button>
              <button
                onClick={() => load(p.id, p.name)}
                disabled={busy}
                className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-accent transition hover:border-accent disabled:opacity-40"
              >
                {loadingId === p.id ? "Loading…" : "Load into my dashboard →"}
              </button>
              <button
                onClick={() => remove(p.id, p.name)}
                disabled={busy}
                aria-label={`Delete ${p.name}`}
                className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-muted transition hover:border-red-400/50 hover:text-red-400 disabled:opacity-40"
              >
                {deletingId === p.id ? "Deleting…" : "✕ Delete"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
