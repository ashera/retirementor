"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan } from "@/lib/au/types";
import { DEFAULT_PLAN } from "@/lib/au/types";
import type { SavedPlan } from "@/app/actions/plans";
import { simulate } from "@/lib/au/simulate";
import { runMonteCarlo } from "@/lib/au/montecarlo";
import { buildTimeline, phaseLabel, type TimelinePhase } from "@/lib/au/timeline";
import { track } from "@/lib/analytics";
import Bert from "@/components/Bert";
import YearDetailModal from "@/components/YearDetailModal";
import ShareControl from "@/components/ShareControl";

const PLAN_KEY = "au-retirement-plan";
const SAVED_ID_KEY = "au-retirement-saved-id";

const MOOD_RING: Record<string, string> = {
  strong: "text-emerald-400",
  ok: "text-accent",
  tight: "text-amber-400",
  short: "text-amber-400",
};

export default function TimelineView({
  config,
  savedPlans,
  sharedPlan = null,
  signedIn = false,
}: {
  config: EngineConfig;
  savedPlans: SavedPlan[];
  sharedPlan?: { plan: RetirementPlan; name: string; basePath: string } | null;
  signedIn?: boolean;
}) {
  const shared = !!sharedPlan;
  const [plan, setPlan] = useState<RetirementPlan | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [openAge, setOpenAge] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (sharedPlan) {
      setPlan({ ...DEFAULT_PLAN, ...sharedPlan.plan });
      setSavedName(sharedPlan.name);
      track("Timeline viewed");
      return;
    }
    try {
      const raw = localStorage.getItem(PLAN_KEY);
      if (raw) setPlan({ ...DEFAULT_PLAN, ...JSON.parse(raw) });
      const id = localStorage.getItem(SAVED_ID_KEY);
      setSavedId(id);
      if (id) setSavedName(savedPlans.find((s) => s.id === id)?.name ?? null);
    } catch {
      /* no stored plan → empty state */
    }
    track("Timeline viewed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-dismiss the "link copied" toast.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // The public share link attaches to the SAVED scenario; only offer it to a
  // signed-in owner whose timeline is a saved plan (not a guest or a shared view).
  const shareToken = savedId ? savedPlans.find((s) => s.id === savedId)?.share_token ?? null : null;
  const canShare = !shared && signedIn && !!savedId;

  const built =
    !!plan &&
    Array.isArray(plan.people) &&
    plan.people.length > 0 &&
    Number.isFinite(plan.people[0]?.currentAge) &&
    Number.isFinite(plan.retirementAge) &&
    Number.isFinite(plan.lifeExpectancy);

  const result = useMemo(() => (built && plan ? simulate(plan, config) : null), [built, plan, config]);
  const mc = useMemo(
    () => (built && plan ? runMonteCarlo(plan, config, { iterations: 1000 }) : null),
    [built, plan, config],
  );
  const timeline = useMemo(
    () => (plan && result ? buildTimeline(plan, result, config, { mcPct: mc ? mc.successRate * 100 : null }) : null),
    [plan, result, config, mc],
  );

  // Year-breakdown modal wiring (reuses the dashboard's reconciliation modal).
  const rows = result?.rows ?? [];
  const ages = rows.map((r) => r.age);
  const minAge = ages.length ? ages[0] : 0;
  const maxAge = ages.length ? ages[ages.length - 1] : 0;
  const openRow = openAge != null ? rows.find((r) => r.age === openAge) ?? null : null;
  const hasRowAt = (age: number) => rows.some((r) => r.age === age);

  if (!built || !timeline) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16">
        <Link href="/" className="text-sm font-medium text-muted hover:text-white">← RetireWiz</Link>
        <div className="mt-8 rounded-2xl border border-line bg-panel p-8 text-center">
          <Bert pose="glasses" size={92} className="mx-auto" />
          <h1 className="mt-4 text-2xl font-bold text-white">Your retirement story starts with a plan</h1>
          <p className="mx-auto mt-3 max-w-md text-muted">
            Build (or load) a scenario and Bert will play it forward year by year — the milestones, the strategies, and how the years hold together.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110"
          >
            Build your plan <span aria-hidden>→</span>
          </Link>
        </div>
      </main>
    );
  }

  const staged = plan!.spendingMode === "stages";
  const whatIfHref = shared ? `${sharedPlan!.basePath}/what-if` : "/what-if";
  const homeHref = shared ? sharedPlan!.basePath : "/";

  // Group beats into chapters by phase (the spending smile is the narrative arc).
  const chapters: { phase: TimelinePhase; label: string; beats: typeof timeline.beats }[] = [];
  for (const beat of timeline.beats) {
    const last = chapters[chapters.length - 1];
    if (last && last.phase === beat.phase) last.beats.push(beat);
    else chapters.push({ phase: beat.phase, label: phaseLabel(beat.phase, staged), beats: [beat] });
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href={homeHref} className="font-medium text-muted hover:text-white">← {shared ? "Back" : "RetireWiz"}</Link>
        <div className="flex flex-wrap items-center gap-2">
          {canShare && (
            <ShareControl
              id={savedId!}
              initialToken={shareToken}
              onNotice={setNotice}
              linkPath="/timeline"
              shareLabel="🔗 Share this story"
              copyLabel="🔗 Copy story link"
              copiedNotice="Timeline link copied — anyone with it can view your retirement story (read-only)."
            />
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/[0.08] px-3 py-1 text-[11px] font-semibold text-amber-300">
            ◆ Illustrative story · not a guarantee
          </span>
        </div>
      </div>

      <header className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">
          {savedName ? savedName : "Your scenario"}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{timeline.title}</h1>
        <p className="mt-3 max-w-xl text-lg leading-relaxed text-slate-300">{timeline.intro}</p>
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <span className="rounded-xl border border-line bg-panel px-4 py-2 text-sm font-semibold text-white">
            {timeline.headline}
          </span>
          {timeline.mcPct != null && (
            <span className={`rounded-xl border border-line bg-panel px-4 py-2 text-sm font-semibold ${MOOD_RING[timeline.mood]}`}>
              {Math.round(timeline.mcPct)}% chance it lasts to {timeline.lastsToAge}
            </span>
          )}
        </div>
      </header>

      {/* ── The story ──────────────────────────────────────────────────────── */}
      <div className="mt-10">
        {chapters.map((chapter, ci) => (
          <section key={ci} className="mb-2">
            {chapter.label && (
              <div className="mb-4 flex items-center gap-3">
                <h2 className="font-serif text-lg font-bold text-white">{chapter.label}</h2>
                <span className="h-px flex-1 bg-line" />
              </div>
            )}
            <ol className="relative ml-[22px] border-l-2 border-line pl-8">
              {chapter.beats.map((beat) => {
                const clickable = hasRowAt(beat.age);
                return (
                  <li key={beat.id} className="relative pb-8 last:pb-2">
                    <span
                      aria-hidden
                      className={`absolute -left-[47px] grid h-[42px] w-[42px] place-items-center rounded-full border-2 bg-panel text-lg shadow-sm ${
                        beat.kind === "self-funded" || beat.kind === "super-flip" ? "border-accent-soft" : beat.kind.startsWith("horizon") ? "border-amber-400" : "border-accent"
                      }`}
                      style={{ boxShadow: "0 0 0 4px var(--color-ink)" }}
                    >
                      {beat.icon}
                    </span>

                    <div
                      className={`rounded-2xl border border-line bg-panel p-4 transition ${
                        clickable ? "cursor-pointer hover:border-accent/50 hover:bg-panel-2" : ""
                      }`}
                      onClick={clickable ? () => setOpenAge(beat.age) : undefined}
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onKeyDown={
                        clickable
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setOpenAge(beat.age);
                              }
                            }
                          : undefined
                      }
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[13px] font-semibold tabular-nums text-accent">{beat.yearLabel ?? beat.year}</span>
                        <span className="text-[12px] text-muted">· age {beat.age}</span>
                      </div>
                      <h3 className="mt-0.5 font-serif text-xl font-semibold text-white">{beat.title}</h3>
                      <p className="mt-1.5 text-[15px] leading-relaxed text-slate-200">{beat.fact}</p>

                      {beat.bert && (
                        <div className="mt-3 flex items-start gap-2.5">
                          <Bert pose={beat.bert.pose} size={38} className="shrink-0" />
                          <p className="pt-1 text-[13px] leading-snug text-accent-soft">{beat.bert.line}</p>
                        </div>
                      )}

                      {beat.vignette && (
                        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5">
                          <span className="shrink-0 rounded border border-amber-500/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                            Illustrative
                          </span>
                          <p className="text-[13px] italic leading-snug text-slate-300">{beat.vignette}</p>
                        </div>
                      )}

                      {clickable && (
                        <div className="mt-2 text-[11px] font-medium text-muted">See this year in detail →</div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>

      {/* ── Footer / change-the-story ──────────────────────────────────────── */}
      <div className="mt-6 rounded-2xl border border-accent/25 bg-accent/[0.06] p-6 text-center">
        <h2 className="font-serif text-xl font-bold text-white">Not the story you want?</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-slate-300">
          Every strategy and life event you turn on rewrites a chapter. Change the plan and watch the years change with it.
        </p>
        <Link
          href={whatIfHref}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110"
        >
          Change the story with What-If <span aria-hidden>→</span>
        </Link>
      </div>

      <p className="mx-auto mt-8 max-w-xl text-center text-[11px] leading-relaxed text-muted">
        This is an illustrative projection, not personal financial advice or a guarantee. All figures are in today&apos;s dollars and rest on the assumptions behind your scenario; real markets, rules and life will differ. The story dresses the projection in plain language — the amber lines are illustrative colour, every figure is engine output.
      </p>

      {openRow && plan && (
        <YearDetailModal
          row={openRow}
          plan={plan}
          nextRow={rows.find((r) => r.age === openAge! + 1)}
          view="savings"
          onClose={() => setOpenAge(null)}
          onPrev={() => setOpenAge((a) => (a != null ? Math.max(minAge, a - 1) : a))}
          onNext={() => setOpenAge((a) => (a != null ? Math.min(maxAge, a + 1) : a))}
          canPrev={openAge != null && openAge > minAge}
          canNext={openAge != null && openAge < maxAge}
        />
      )}

      {notice && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4" role="status" aria-live="polite">
          <div className="max-w-md rounded-xl border border-accent/40 bg-panel px-4 py-2.5 text-sm text-slate-100 shadow-lg">
            {notice}
          </div>
        </div>
      )}
    </main>
  );
}
