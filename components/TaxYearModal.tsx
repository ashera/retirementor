"use client";

import { useEffect } from "react";
import { fmtCurrency } from "@/lib/au/format";
import type { PersonTaxDetail, RetirementPlan, YearRow } from "@/lib/au/types";

const round = (n: number) => Math.round(n);
const cur = (n: number) => (n < 0 ? `−${fmtCurrency(round(-n))}` : fmtCurrency(round(n)));

function Line({ label, value, sub, tone = "text-slate-200", strong = false, indent = false }: {
  label: string; value: string; sub?: string; tone?: string; strong?: boolean; indent?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1 ${indent ? "pl-3" : ""}`}>
      <span className={`text-sm ${strong ? "font-semibold text-white" : "text-slate-300"}`}>
        {label}
        {sub && <span className="mt-0.5 block text-[11px] text-muted">{sub}</span>}
      </span>
      <span className={`shrink-0 text-sm tabular-nums ${strong ? "font-bold text-white" : tone}`}>{value}</span>
    </div>
  );
}

function PersonBlock({ d, showName }: { d: PersonTaxDetail; showName: boolean }) {
  const rentPos = Math.max(0, d.rent);
  const rentNeg = Math.max(0, -d.rent);
  const ordinary = d.salary + d.work + d.rent + d.dividends;
  const anyOrdinary = Math.abs(ordinary) > 0.5 || d.gross > 0.5;
  if (!anyOrdinary && d.cgt < 0.5) return null;
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-2">
      {showName && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">{d.label}</div>}
      {d.salary > 0.5 && <Line label="Salary (taxable)" value={cur(d.salary)} />}
      {d.work > 0.5 && <Line label="Part-time work" value={cur(d.work)} />}
      {rentPos > 0.5 && <Line label="Net rent" value={cur(rentPos)} />}
      {rentNeg > 0.5 && <Line label="Net rental loss" value={cur(-rentNeg)} sub="negative gearing — reduces taxable income" />}
      {d.dividends > 0.5 && <Line label="Dividends / distributions" value={cur(d.dividends)} />}
      {anyOrdinary && (
        <div className="border-t border-line">
          <Line label="Assessable income" value={cur(ordinary)} strong />
          <Line label="Income tax (marginal rates)" value={cur(d.gross)} tone="text-slate-300" />
          {d.lito > 0.5 && <Line label="less Low Income Tax Offset (LITO)" value={`−${cur(d.lito)}`} tone="text-emerald-400" indent />}
          {d.sapto > 0.5 && <Line label="less Seniors offset (SAPTO)" value={`−${cur(d.sapto)}`} tone="text-emerald-400" indent />}
          <Line label="Income tax payable" value={cur(d.incomeTax)} strong />
        </div>
      )}
      {d.medicare > 0.5 && <Line label="Medicare levy (2%)" value={cur(d.medicare)} tone="text-pink-300" />}
      {d.cgt > 0.5 && (
        <Line label="Capital gains tax" value={cur(d.cgt)} tone="text-sky-300" sub={`on ${cur(d.gain)} of realised gains`} />
      )}
    </div>
  );
}

export default function TaxYearModal({
  row, plan, onClose, onPrev, onNext, canPrev, canNext,
}: {
  row: YearRow;
  plan: RetirementPlan;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && canPrev) onPrev();
      else if (e.key === "ArrowRight" && canNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext, canPrev, canNext]);

  const b = row.breakdown;
  const detail = b.taxDetail ?? [];
  const contrib = b.contribTax ?? 0;
  const earnings = Math.max(0, b.earningsTax ?? 0);
  const propertyCgt = b.propertyCgt ?? 0;
  const total = (b.incomeTax ?? 0) + (b.medicare ?? 0) + contrib + earnings + (b.capitalGains ?? 0);
  const isCouple = plan.people.length > 1;
  const phaseLabel =
    row.phase === "accumulation" ? "still working"
      : row.phase === "bridge" ? "retired — before super unlocks"
      : row.phase === "drawdown" ? "retired — before the Age Pension"
      : "retired — Age Pension age";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Tax breakdown</div>
            <h2 className="mt-0.5 text-lg font-bold text-white">
              Age {row.age} <span className="text-sm font-normal text-muted">· {phaseLabel}</span>
            </h2>
            <div className="mt-0.5 text-sm tabular-nums text-slate-300">
              Total tax this year <span className="font-semibold text-white">{cur(total)}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onPrev} disabled={!canPrev} className="rounded-lg px-2 py-1 text-muted transition hover:text-white disabled:opacity-30" aria-label="Previous year">←</button>
            <button onClick={onNext} disabled={!canNext} className="rounded-lg px-2 py-1 text-muted transition hover:text-white disabled:opacity-30" aria-label="Next year">→</button>
            <button onClick={onClose} className="rounded-lg px-2 py-1 text-xl leading-none text-muted transition hover:text-white" aria-label="Close">×</button>
          </div>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          {total < 1 ? (
            <p className="text-center text-sm text-muted">
              No tax this year. Super pension drawdowns and the Age Pension are tax-free from age 60, and any capital
              growth outside super isn&apos;t taxed until you sell.
            </p>
          ) : (
            <>
              {detail.some((d) => Math.abs(d.salary + d.work + d.rent + d.dividends) > 0.5 || d.gross > 0.5 || d.cgt > 0.5) && (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    Personal income {isCouple ? "(each partner taxed separately)" : "tax"}
                  </h3>
                  <div className="space-y-2">
                    {detail.map((d, i) => (
                      <PersonBlock key={i} d={d} showName={isCouple} />
                    ))}
                  </div>
                </section>
              )}

              {(contrib > 0.5 || earnings > 0.5) && (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Super tax</h3>
                  <div className="rounded-xl border border-line bg-panel px-4 py-1">
                    {contrib > 0.5 && <Line label="Contributions tax (15%)" value={cur(contrib)} sub="on concessional (pre-tax) contributions" tone="text-emerald-300" />}
                    {earnings > 0.5 && <Line label="Earnings tax (15%)" value={cur(earnings)} sub="on super still in accumulation phase" tone="text-violet-300" />}
                  </div>
                </section>
              )}

              {propertyCgt > 0.5 && (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Property</h3>
                  <div className="rounded-xl border border-line bg-panel px-4 py-1">
                    <Line label="Capital gains tax (property sale)" value={cur(propertyCgt)} tone="text-sky-300" />
                  </div>
                </section>
              )}

              <div className="flex items-baseline justify-between gap-4 rounded-xl border border-accent/30 bg-accent/5 px-4 py-2.5">
                <span className="text-sm font-semibold text-white">Total tax</span>
                <span className="text-lg font-bold tabular-nums text-white">{cur(total)}</span>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-line px-6 py-3 text-[11px] leading-snug text-muted">
          All ordinary income is taxed together on one marginal scale, with LITO (and SAPTO from Age Pension age)
          applied once. Super pension drawdowns and the Age Pension are tax-free. Today&apos;s dollars.
        </div>
      </div>
    </div>
  );
}
