"use client";

import { useMemo, useState } from "react";
import { fmtCurrency } from "@/lib/au/format";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import type { EngineConfig } from "@/lib/au/config";
import type { Household } from "@/lib/au/types";
import { quizFor } from "@/lib/au/budgetQuiz";
import Bert from "@/components/Bert";

interface CategoryQuizProps {
  categoryKey: string;
  categoryLabel: string;
  household: Household;
  config?: EngineConfig;
  onApply: (total: number) => void;
  onClose: () => void;
}

// A per-category "work it out" mini-quiz: a short series of multiple-choice questions
// (from the category's sub-items) with next / back / done, a running tally, and a result
// that drops straight into the budget. Rendered as an overlay so it works from either
// budget skin.
export default function CategoryQuiz({ categoryKey, categoryLabel, household, config = DEFAULT_CONFIG, onApply, onClose }: CategoryQuizProps) {
  const questions = useMemo(() => quizFor(categoryKey, household, config), [categoryKey, household, config]);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));

  const total = answers.reduce<number>((s, a, idx) => s + (a == null ? 0 : questions[idx].opts[a].amt), 0);
  const done = i >= questions.length;
  const Q = done ? null : questions[i];

  const choose = (k: number) => setAnswers((prev) => prev.map((a, idx) => (idx === i ? k : a)));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-accent">Work it out</div>
            <h3 className="mt-0.5 text-base font-bold text-white">{categoryLabel}</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted transition hover:bg-panel-2 hover:text-white">✕</button>
        </div>

        {/* Progress + tally */}
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-2.5">
          <div className="flex gap-1.5">
            {questions.map((_, k) => (
              <div key={k} className={`h-1.5 w-6 rounded-full ${k === i ? "bg-accent" : answers[k] != null || done ? "bg-accent/50" : "bg-panel-2 border border-line"}`} />
            ))}
          </div>
          <div className="text-[11px] tabular-nums text-muted">{done ? "all done ✓" : <>so far <span className="font-bold text-accent">{fmtCurrency(total)}</span>/yr</>}</div>
        </div>

        {/* Body */}
        {!done && Q ? (
          <div className="px-5 py-5">
            {Q.bert && (
              <div className="mb-3 flex items-start gap-2.5">
                <Bert pose="glasses" size={32} className="shrink-0" />
                <p className="pt-1 text-[12px] italic leading-snug text-muted">{Q.bert}</p>
              </div>
            )}
            <p className="text-lg font-bold leading-snug text-white">{Q.q}</p>
            <div className="mt-4 flex flex-col gap-2">
              {Q.opts.map((o, k) => (
                <button
                  key={k}
                  onClick={() => choose(k)}
                  aria-pressed={answers[i] === k}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                    answers[i] === k ? "border-accent bg-accent/10" : "border-line bg-panel hover:border-accent/50"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-100">{o.label}</span>
                    {o.sub && <span className="mt-0.5 block text-[11px] text-muted">{o.sub}</span>}
                  </span>
                  <span className={`shrink-0 text-[12px] tabular-nums ${answers[i] === k ? "font-bold text-accent" : "text-muted"}`}>
                    {o.amt === 0 ? "$0" : `+${fmtCurrency(o.amt)}`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-5 py-6 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Your {categoryLabel.toLowerCase()} budget</div>
            <div className="mt-1 text-4xl font-extrabold tracking-tight text-accent tabular-nums">
              {fmtCurrency(total)}<span className="text-base font-medium text-muted">/yr</span>
            </div>
            <div className="mt-1 text-[12px] text-muted">about <span className="font-semibold text-slate-200">{fmtCurrency(Math.round(total / 52))}</span> a week</div>
            <dl className="mx-auto mt-4 max-w-xs text-left text-[12px]">
              {questions.map((q, idx) => (
                <div key={q.key} className="flex justify-between border-b border-dashed border-line py-1.5 last:border-0">
                  <dt className="text-muted">{q.key}</dt>
                  <dd className="tabular-nums text-slate-200">{fmtCurrency(answers[idx] == null ? 0 : q.opts[answers[idx]!].amt)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* Nav */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5">
          <button
            onClick={() => (i === 0 ? onClose() : setI((n) => Math.max(0, n - 1)))}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted transition hover:text-white"
          >
            {i === 0 ? "Cancel" : "← Back"}
          </button>
          {done ? (
            <button onClick={() => onApply(total)} className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft">
              Use {fmtCurrency(total)}/yr →
            </button>
          ) : (
            <button
              onClick={() => setI((n) => n + 1)}
              disabled={answers[i] == null}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              {i === questions.length - 1 ? "Done →" : "Next →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
