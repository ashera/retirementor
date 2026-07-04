"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { EngineConfig } from "@/lib/au/config";
import { DEFAULT_PLAN, type RetirementPlan } from "@/lib/au/types";
import { simulate } from "@/lib/au/simulate";
import { runMonteCarlo } from "@/lib/au/montecarlo";
import ReportView from "@/components/ReportView";

const STORAGE_KEY = "au-retirement-plan";

/**
 * Scenario report for the CURRENT working plan (the one on the dashboard),
 * read from localStorage — so it works for an unsaved scenario, logged in or
 * out. Reads client-side (after mount) to avoid a hydration mismatch.
 */
export default function CurrentReport({ config }: { config: EngineConfig }) {
  const [plan, setPlan] = useState<RetirementPlan | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setPlan(raw ? { ...DEFAULT_PLAN, ...JSON.parse(raw) } : DEFAULT_PLAN);
    } catch {
      setPlan(DEFAULT_PLAN);
    }
  }, []);

  const result = useMemo(() => (plan ? simulate(plan, config) : null), [plan, config]);
  const mc = useMemo(() => (plan ? runMonteCarlo(plan, config) : null), [plan, config]);

  if (!plan || !result || !mc) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-muted">Preparing your report…</main>;
  }

  const generatedAt = new Date().toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <div className="no-print mx-auto -mb-2 mt-4 w-full max-w-[820px] px-6 text-center text-xs text-slate-500">
        This report reflects the scenario currently on your planner.{" "}
        <Link href="/" className="font-medium text-teal-600 hover:underline">
          Change it on the dashboard
        </Link>{" "}
        and reopen to refresh.
      </div>
      <ReportView
        plan={plan}
        result={result}
        mc={mc}
        config={config}
        name="Current scenario"
        generatedAt={generatedAt}
      />
    </>
  );
}
