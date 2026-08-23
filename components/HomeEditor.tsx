"use client";

import Field from "@/components/Field";
import { fmtCurrency } from "@/lib/au/format";
import { mortgageAnnualCost, suggestPayoffAge } from "@/lib/au/mortgage";
import type { HomeDetail, HomeTenure, MortgageDetail } from "@/lib/au/types";

// The family home editor — tenure (optional), the home as an exempt asset (value +
// growth), and the mortgage (with the clear-vs-carry decision). Extracted so the Plan
// Wizard and the Budget Builder edit the SAME plan fields (homeowner / home / mortgage)
// from one shared component instead of two divergent copies.

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-line bg-panel-2 p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 font-medium transition ${
            value === o.value ? "bg-accent/20 text-accent" : "text-muted hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StrategyCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border px-4 py-3 text-left transition ${
        active ? "border-accent bg-accent/10 ring-1 ring-accent/40" : "border-line bg-panel-2 hover:border-accent/40"
      }`}
    >
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-0.5 text-xs text-muted">{desc}</div>
    </button>
  );
}

export interface HomeEditorProps {
  showTenure?: boolean; // render the own/mortgage/rent toggle (Plan Wizard); off inside the budget
  tenure: HomeTenure;
  onTenure: (t: HomeTenure) => void;
  home: HomeDetail;
  onHome: (patch: Partial<HomeDetail>) => void;
  mortgage: MortgageDetail;
  onMortgage: (patch: Partial<MortgageDetail>) => void;
  oldestAtRetire: number;
  lifeExpectancy: number;
  // Optional clear-vs-carry outlook (from the caller's sims) → adds a pension-uplift note.
  strategyCompare?: { carryLasts: number | null; clearLasts: number | null; pensionUplift: number } | null;
}

export default function HomeEditor({
  showTenure = false,
  tenure,
  onTenure,
  home,
  onHome,
  mortgage,
  onMortgage,
  oldestAtRetire,
  lifeExpectancy,
  strategyCompare = null,
}: HomeEditorProps) {
  const isPI = mortgage.type === "principal_interest";
  const cost = mortgageAnnualCost(mortgage);
  const equity = Math.max(0, home.value - (tenure === "mortgage" ? mortgage.balance : 0));
  const suggested = suggestPayoffAge(mortgage.balance, mortgage.interestRate, mortgage.annualRepayment, oldestAtRetire);

  return (
    <div className="space-y-4">
      {showTenure && (
        <div>
          <div className="mb-2 text-sm font-semibold text-slate-200">Do you own your home?</div>
          <Segmented
            value={tenure}
            options={[
              { value: "own", label: "Own outright" },
              { value: "mortgage", label: "With a mortgage" },
              { value: "rent", label: "Renting" },
            ]}
            onChange={(v) => onTenure(v as HomeTenure)}
          />
          <p className="mt-2 text-xs text-muted">
            {tenure === "rent"
              ? "Renters get higher Age Pension asset thresholds, and we use ASFA’s renter budget figures."
              : tenure === "mortgage"
                ? "Your home is exempt from the Age Pension assets test; the loan below is a cost you carry into retirement."
                : "Your home is exempt from the Age Pension assets test — no matter what it’s worth."}
          </p>
        </div>
      )}

      {tenure === "rent" ? (
        showTenure ? (
          <div className="rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-xs text-muted">
            Renting — nothing more to set here. You’ll set your rent as part of your spending budget.
          </div>
        ) : null
      ) : (
        <>
          {/* The home as an (exempt) asset. */}
          <div className="space-y-4 rounded-2xl border border-line bg-panel-2 p-4">
            <div className="flex items-center justify-between gap-3 text-sm font-semibold text-white">
              <span>🏠 Your home</span>
              <span className="text-xs font-normal text-muted">
                {fmtCurrency(home.value)} · {fmtCurrency(equity)} equity
              </span>
            </div>
            <Field
              label="Current market value"
              value={home.value}
              onChange={(v) => onHome({ value: v })}
              min={0}
              max={10_000_000}
              step={25_000}
              prefix="$"
              hint="Exempt from the Age Pension — for your net-worth picture."
            />
            <Field
              label="Capital growth (real, after inflation)"
              value={home.growthReal}
              onChange={(v) => onHome({ growthReal: v })}
              min={-2}
              max={6}
              step={0.5}
              suffix="% p.a."
            />
            {tenure === "own" && (
              <div className="rounded-lg border border-line bg-panel px-3 py-2.5 text-xs text-muted">
                Owned outright — no loan to carry into retirement.
              </div>
            )}
          </div>

          {tenure === "mortgage" && (
            <div className="space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">🏦 Your home loan</div>

              <Segmented
                value={mortgage.type}
                options={[
                  { value: "principal_interest", label: "Principal & interest" },
                  { value: "interest_only", label: "Interest-only" },
                ]}
                onChange={(v) => onMortgage({ type: v as MortgageDetail["type"] })}
              />

              <Field
                label="Balance owing"
                value={mortgage.balance}
                onChange={(v) => onMortgage({ balance: v })}
                min={0}
                max={1_000_000}
                step={5_000}
                prefix="$"
                hint="Roughly what you’ll still owe when you retire (today’s dollars)."
              />

              <Field
                label="Interest rate"
                value={mortgage.interestRate}
                onChange={(v) => onMortgage({ interestRate: v })}
                min={1}
                max={12}
                step={0.1}
                suffix="%"
              />

              {isPI ? (
                <>
                  <Field
                    label="Repayments"
                    value={mortgage.annualRepayment}
                    onChange={(v) => onMortgage({ annualRepayment: v })}
                    min={0}
                    max={120_000}
                    step={600}
                    prefix="$"
                    suffix="/yr"
                    hint={`about ${fmtCurrency(Math.round(mortgage.annualRepayment / 12))} a month`}
                  />
                  <div>
                    <Field
                      label="Paid off by age"
                      value={mortgage.payoffAge ?? suggested ?? oldestAtRetire + 10}
                      onChange={(v) => onMortgage({ payoffAge: v })}
                      min={oldestAtRetire}
                      max={lifeExpectancy}
                      step={1}
                      suffix="yrs"
                    />
                    {suggested != null && suggested !== mortgage.payoffAge && (
                      <button
                        type="button"
                        onClick={() => onMortgage({ payoffAge: suggested })}
                        className="mt-1 text-xs text-accent underline-offset-2 hover:underline"
                      >
                        Work it out from balance & rate → age {suggested}
                      </button>
                    )}
                    {suggested == null && (
                      <p className="mt-1 text-xs text-amber-300">
                        These repayments barely cover the interest — the loan hardly shrinks.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-line bg-panel px-3 py-2.5 text-xs text-muted">
                  Interest-only: about{" "}
                  <span className="font-semibold text-white">{fmtCurrency(Math.round(cost))}/yr</span> in interest, and the{" "}
                  <span className="font-semibold text-white">{fmtCurrency(mortgage.balance)}</span> balance never shrinks — it’s
                  cleared by downsizing, selling, or from your estate. Some people model clearing it with super at retirement
                  (below); whether that suits you is a personal decision.
                </div>
              )}

              <div>
                <div className="mb-1.5 text-sm font-semibold text-slate-200">What will you do with it?</div>
                <div className="space-y-2">
                  <StrategyCard
                    active={mortgage.strategy === "carry"}
                    onClick={() => onMortgage({ strategy: "carry" })}
                    title="Keep repaying"
                    desc={`Adds ${fmtCurrency(Math.round(cost / 12))}/mo to your budget ${
                      isPI && mortgage.payoffAge ? `until age ${mortgage.payoffAge}` : "for life"
                    }.`}
                  />
                  <StrategyCard
                    active={mortgage.strategy === "clear_at_retirement"}
                    onClick={() => onMortgage({ strategy: "clear_at_retirement" })}
                    title="Clear it at retirement with super"
                    desc={`Pay the ${fmtCurrency(mortgage.balance)} off from super (tax-free from 60).${
                      strategyCompare && strategyCompare.pensionUplift > 0
                        ? ` Could lift your Age Pension ~${fmtCurrency(strategyCompare.pensionUplift)}/yr.`
                        : ""
                    }`}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
