"use client";

import { useState } from "react";
import { fmtDate } from "@/lib/au/format";
import { adminGetPlanData } from "@/app/actions/admin";

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

/** Admin: list a user's saved scenarios and load any one into the admin's own
 *  planner dashboard (for support / inspection). */
export default function UserPlansList({ plans }: { plans: PlanRow[] }) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <>
      {error && <p className="mb-2 text-sm text-red-300">{error}</p>}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
        {plans.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-sm">
            <span className="font-medium text-slate-100">{p.name}</span>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-xs text-muted">updated {fmtDate(p.updated_at)}</span>
              <button
                onClick={() => load(p.id, p.name)}
                disabled={loadingId != null}
                className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-accent transition hover:border-accent disabled:opacity-40"
              >
                {loadingId === p.id ? "Loading…" : "Load into my dashboard →"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
