"use client";

import { useEffect, useRef, useState } from "react";
import { fmtCurrency } from "@/lib/au/format";
import { BUDGET_CATEGORY_META, presetCategories } from "@/lib/au/budget";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan } from "@/lib/au/types";
import { useBudgetModel } from "@/components/useBudgetModel";
import CategoryQuiz from "@/components/CategoryQuiz";
import Bert, { type BertPose } from "@/components/Bert";

interface BudgetQuestProps {
  plan: RetirementPlan;
  config: EngineConfig;
  variant?: "modal" | "inline"; // modal = embedded over the app; inline = standalone page
  onApply?: (update: Partial<RetirementPlan>) => void;
  onProgress?: (update: Partial<RetirementPlan>) => void;
  onClose?: () => void;
  onSwitchToClassic?: () => void; // embedded: hand back to the form builder
  ctaLabel?: string; // inline: primary action label
  onCta?: (update: Partial<RetirementPlan>) => void; // inline: hand off to the planner
}

const STATUS_TONE = {
  good: { pill: "text-emerald-300", ring: "var(--rw-good, #34d399)", bar: "bg-emerald-400", chip: "bg-emerald-500/15 text-emerald-300" },
  warn: { pill: "text-amber-300", ring: "#f0b429", bar: "bg-amber-400", chip: "bg-amber-500/15 text-amber-300" },
  bad: { pill: "text-rose-300", ring: "#f87171", bar: "bg-rose-400", chip: "bg-rose-500/15 text-rose-300" },
} as const;

const POSE_FOR = (status: "good" | "warn" | "bad", premium: boolean): BertPose =>
  status === "bad" ? "pointer" : status === "warn" ? "glasses" : premium ? "violin" : "eureka";

export default function BudgetQuest({
  plan, config, variant = "modal", onApply, onProgress, onClose, onSwitchToClassic, ctaLabel, onCta,
}: BudgetQuestProps) {
  const m = useBudgetModel(plan, config);
  const {
    categories, setCat, total, split, tierInfo, lastsToLE, depletedAge,
    confidence, headroom, verdict, badges, bert, budgetUpdate, household,
  } = m;

  // Per-category "work it out" quiz — which category's quiz is open (null = none).
  const [quizKey, setQuizKey] = useState<string | null>(null);

  // Slider ceilings from the Comfortable preset (a stable reference, so the max never
  // chases the current value).
  const comfy = presetCategories(config, plan.household, plan.homeowner, "comfortable");
  const catMax = (key: string) =>
    Math.max(Math.ceil(((comfy[key] ?? 5_000) * 2.5) / 1_000) * 1_000, categories[key] ?? 0, 12_000);

  const tone = STATUS_TONE[verdict.status];
  const lastsAge = lastsToLE ? `${plan.lifeExpectancy}+` : depletedAge ?? "—";
  const confPct = Math.round(confidence * 100);
  const C = 2 * Math.PI * 52;
  const ringOffset = C * (1 - Math.max(0, Math.min(1, confidence)));

  // Continuous save (embedded): mirror the budget back to the plan as they play, and
  // flush on unmount — so closing via ✕ / backdrop never loses work. Only fires on a
  // genuine change from what they opened with.
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;
  const updateRef = useRef(budgetUpdate);
  updateRef.current = budgetUpdate;
  const key = JSON.stringify(budgetUpdate);
  const initialKey = useRef(key).current;
  useEffect(() => {
    if (key === initialKey) return;
    const t = setTimeout(() => progressRef.current?.(updateRef.current), 500);
    return () => clearTimeout(t);
  }, [key, initialKey]);
  useEffect(() => () => {
    if (JSON.stringify(updateRef.current) !== initialKey) progressRef.current?.(updateRef.current);
  }, [initialKey]);

  // Micro-celebration when the lifestyle tier ticks up.
  const [celebrate, setCelebrate] = useState(false);
  const prevTier = useRef(tierInfo.index);
  useEffect(() => {
    if (tierInfo.index > prevTier.current) {
      setCelebrate(true);
      const t = setTimeout(() => setCelebrate(false), 900);
      prevTier.current = tierInfo.index;
      return () => clearTimeout(t);
    }
    prevTier.current = tierInfo.index;
  }, [tierInfo.index]);

  const essentials = BUDGET_CATEGORY_META.filter((c) => c.essential);
  const discretionary = BUDGET_CATEGORY_META.filter((c) => !c.essential);

  const CatRow = ({ meta }: { meta: (typeof BUDGET_CATEGORY_META)[number] }) => {
    const val = categories[meta.key] ?? 0;
    const max = catMax(meta.key);
    return (
      <div className="flex items-center gap-3 py-1.5">
        <div className="w-28 shrink-0">
          <div className="text-[13px] leading-tight text-slate-200">{meta.label}</div>
          <button
            type="button"
            onClick={() => setQuizKey(meta.key)}
            className="text-[10px] font-medium text-accent transition hover:underline"
            title={`Not sure? Answer a few questions to work out your ${meta.label.toLowerCase()} budget`}
          >
            🎲 work it out
          </button>
        </div>
        <input
          type="range" min={0} max={max} step={meta.essential ? 250 : 500} value={Math.min(val, max)}
          onChange={(e) => setCat(meta.key, Number(e.target.value))}
          aria-label={`${meta.label} per year`}
          className={`h-1.5 flex-1 ${meta.essential ? "accent-emerald-500" : "accent-amber-400"}`}
        />
        <div className="w-16 shrink-0 text-right text-[12px] tabular-nums text-muted">{fmtCurrency(val)}</div>
      </div>
    );
  };

  const hud = (
    <div className="grid gap-5 md:grid-cols-[1fr_260px]">
      {/* Left: Bert + tier + categories */}
      <div>
        {/* Bert host */}
        <div className="flex items-start gap-3 rounded-2xl border border-line bg-panel-2/60 p-3">
          <Bert pose={POSE_FOR(verdict.status, tierInfo.tier === "premium")} size={56} className="shrink-0" />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">Bert says</div>
            <p className="mt-0.5 text-[13px] leading-snug text-slate-200">{bert}</p>
          </div>
        </div>

        {/* Tier meter */}
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className={`text-xl font-bold tracking-tight text-white transition-transform ${celebrate ? "scale-110" : ""}`}>
              {tierInfo.label}
              {tierInfo.tier === "premium" && <span className="ml-1 text-amber-300">◆</span>}
            </span>
            <span className="text-sm font-semibold tabular-nums text-slate-300">{fmtCurrency(total)}/yr</span>
          </div>
          <div className="mt-2 flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-3 flex-1 rounded transition-colors ${
                  i <= tierInfo.index ? (i === 3 ? "bg-amber-400" : "bg-accent") : "bg-panel-2 border border-line"
                }`}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-muted">
            <span>Below modest</span><span>Modest</span><span>Comfortable</span><span>Premium</span>
          </div>
        </div>

        {/* Category allocation */}
        <div className="mt-4 rounded-2xl border border-line bg-panel-2/40 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Essentials · your floor · {fmtCurrency(split.essential)}/yr</div>
          <div className="mt-1">{essentials.map((c) => <CatRow key={c.key} meta={c} />)}</div>
          <div className="mt-3 border-t border-line pt-3 text-[11px] font-semibold uppercase tracking-wide text-amber-300/80">Lifestyle · where it flexes · {fmtCurrency(split.discretionary)}/yr</div>
          <div className="mt-1">{discretionary.map((c) => <CatRow key={c.key} meta={c} />)}</div>
        </div>
      </div>

      {/* Right: sustainability + badges */}
      <div>
        <div className="rounded-2xl border border-line bg-panel-2 p-4 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Will it last?</div>
          <svg className="mx-auto mt-2 h-32 w-32" viewBox="0 0 120 120" role="img" aria-label={`Lasts to age ${lastsAge}, ${confPct}% confidence`}>
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--rw-line, #26332c)" strokeWidth="12" />
            <circle
              cx="60" cy="60" r="52" fill="none" stroke={tone.ring} strokeWidth="12" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={ringOffset} transform="rotate(-90 60 60)"
              style={{ transition: "stroke-dashoffset .5s ease, stroke .3s ease" }}
            />
            <text x="60" y="56" textAnchor="middle" className="fill-white" style={{ font: "800 26px ui-monospace, monospace" }}>{lastsAge}</text>
            <text x="60" y="75" textAnchor="middle" className="fill-slate-400" style={{ font: "600 9px ui-monospace, monospace", letterSpacing: "1px" }}>LASTS TO</text>
          </svg>
          <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone.chip}`}>
            ● {verdict.label}
          </div>
          <div className="mt-1.5 text-[11px] text-muted">{confPct}% confidence · to life expectancy</div>
        </div>

        {/* Badges */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <span
              key={b.id}
              title={b.phase ? "Coming in a later phase" : b.earned ? "Unlocked" : "Not yet"}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${
                b.earned ? "border-amber-400/50 bg-amber-500/10 text-amber-200" : "border-line bg-panel text-muted"
              }`}
            >
              <span className={b.earned ? "" : "opacity-40"}>{b.earned ? b.icon : "🔒"}</span> {b.label}
            </span>
          ))}
        </div>

        {headroom > 1_000 && verdict.status === "good" && (
          <p className="mt-3 text-[12px] leading-snug text-muted">
            You could add about <span className="font-semibold text-amber-300">{fmtCurrency(Math.round(headroom / 500) * 500)}</span>/yr and still be safe.
          </p>
        )}
      </div>
    </div>
  );

  const quizEl = quizKey ? (
    <CategoryQuiz
      categoryKey={quizKey}
      categoryLabel={BUDGET_CATEGORY_META.find((c) => c.key === quizKey)?.label ?? "Category"}
      household={household}
      config={config}
      onApply={(t) => { setCat(quizKey, t); setQuizKey(null); }}
      onClose={() => setQuizKey(null)}
    />
  ) : null;

  // ── Inline (standalone /budget) ────────────────────────────────────────────
  if (variant === "inline") {
    return (
      <div className="rounded-2xl border border-line bg-panel p-5">
        {quizEl}
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-accent">Your retirement lifestyle</h3>
          {onSwitchToClassic && (
            <button onClick={onSwitchToClassic} className="text-[11px] font-medium text-muted hover:text-white">Switch to the classic form →</button>
          )}
        </div>
        <div className="mt-4">{hud}</div>
        {onCta && (
          <div className="mt-5 flex justify-end">
            <button onClick={() => onCta(budgetUpdate)} className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110">
              {ctaLabel ?? "See it in your full plan →"}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Modal (embedded play mode) ─────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      {quizEl}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-[760px] max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent">
              <span aria-hidden>🎮</span> Budget Quest
            </div>
            <h2 className="mt-0.5 text-lg font-bold text-white">Design the retirement you want</h2>
          </div>
          <div className="flex items-center gap-3">
            {onSwitchToClassic && (
              <button onClick={onSwitchToClassic} className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium text-muted transition hover:text-white">☰ Classic</button>
            )}
            <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted transition hover:bg-panel-2 hover:text-white">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{hud}</div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-muted transition hover:text-white">Cancel</button>
          <button
            onClick={() => onApply?.(budgetUpdate)}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft"
          >
            Lock in this budget →
          </button>
        </div>
      </div>
    </div>
  );
}
