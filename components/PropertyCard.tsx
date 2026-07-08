"use client";

import { useState } from "react";
import Field from "@/components/Field";
import InlineExplainer from "@/components/InlineExplainer";
import { fmtCurrency } from "@/lib/au/format";
import { incomeTestRent, netEquity, netRentCash } from "@/lib/au/property";
import type { PropertyDetail } from "@/lib/au/types";

// One editable investment property in the wizard. Shows the essentials up front
// (value, loan, yield, hold/sell) with the finer tuning behind an "Advanced" fold,
// so a portfolio of these stays scannable rather than a wall of inputs.
export default function PropertyCard({
  index,
  total,
  property: p,
  retirementAge,
  lifeExpectancy,
  expanded,
  onToggle,
  onChange,
  onRemove,
}: {
  index: number;
  total: number;
  property: PropertyDetail;
  retirementAge: number;
  lifeExpectancy: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<PropertyDetail>) => void;
  onRemove: () => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const netRent = netRentCash(p, p.value);
  const fallbackName = total > 1 ? `Property ${index + 1}` : "Your property";
  const displayName = p.name?.trim() || fallbackName;
  const summary = `${fmtCurrency(p.value)} · ${fmtCurrency(Math.round(netRent))}/yr net · ${p.strategy === "hold" ? "Hold" : `Sell at ${p.sellAtAge}`}`;

  const startRename = () => {
    setDraftName(p.name ?? "");
    setEditingName(true);
  };
  const commitName = () => {
    const next = draftName.trim();
    onChange({ name: next || undefined });
    setEditingName(false);
  };

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-panel-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse" : "Expand"}
            className="shrink-0 text-muted transition hover:text-white"
          >
            {expanded ? "▾" : "▸"}
          </button>
          {editingName ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") setEditingName(false);
              }}
              maxLength={40}
              placeholder={fallbackName}
              className="min-w-0 flex-1 rounded-md border border-accent bg-panel px-2 py-1 text-sm font-semibold text-white outline-none"
            />
          ) : (
            <>
              <button
                type="button"
                onClick={startRename}
                title="Click to rename"
                className="group flex shrink-0 items-center gap-1 text-sm font-semibold text-white"
              >
                <span className="max-w-[10rem] truncate">{displayName}</span>
                <span className="text-xs text-muted opacity-0 transition group-hover:opacity-100" aria-hidden>
                  ✎
                </span>
              </button>
              <button
                type="button"
                onClick={onToggle}
                className="min-w-0 flex-1 truncate text-left text-xs font-normal text-muted"
              >
                {summary}
              </button>
            </>
          )}
        </div>
        {total > 1 && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 text-xs font-medium text-red-400/80 transition hover:text-red-400"
          >
            Remove
          </button>
        )}
      </div>

      {expanded && (
        <>
      {/* Essentials */}
      <Field label="Current market value" value={p.value} onChange={(v) => onChange({ value: v })} min={0} max={5_000_000} step={10_000} prefix="$" />
      <Field
        label="Loan secured against it"
        value={p.loanBalance}
        onChange={(v) => onChange({ loanBalance: v })}
        min={0}
        max={5_000_000}
        step={5_000}
        prefix="$"
        hint="Only a loan against THIS property reduces its assessed value (interest-only)."
      />
      <Field
        label="Gross rental yield"
        value={p.grossYield}
        onChange={(v) => onChange({ grossYield: v })}
        min={0}
        max={12}
        step={0.1}
        suffix="%"
        hint={`about ${fmtCurrency(Math.round((p.value * p.grossYield) / 100))}/yr gross rent`}
      />

      <div>
        <div className="mb-2 text-sm font-semibold text-slate-200">In retirement, will you…</div>
        <div className="grid grid-cols-2 gap-2">
          {(["hold", "sell"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ strategy: s })}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                p.strategy === s
                  ? "border-accent bg-accent/10 font-semibold text-accent"
                  : "border-line bg-panel text-slate-200 hover:text-white"
              }`}
            >
              {s === "hold" ? "Hold for income" : "Sell it"}
            </button>
          ))}
        </div>
      </div>
      {p.strategy === "sell" && (
        <Field
          label="Sell at age"
          value={p.sellAtAge}
          onChange={(v) => onChange({ sellAtAge: v })}
          min={retirementAge}
          max={lifeExpectancy}
          step={1}
          suffix="yrs"
          hint="Triggers CGT (50% discount); net proceeds move into your outside-super savings."
        />
      )}

      {/* Advanced fold — sensible defaults otherwise */}
      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        className="text-xs font-medium text-muted transition hover:text-white"
      >
        {advanced ? "▾ Advanced" : "▸ Advanced — loan rate, running costs, growth, CGT cost base"}
      </button>
      {advanced && (
        <div className="space-y-4 border-t border-line pt-4">
          <Field label="Loan interest rate" value={p.loanRate} onChange={(v) => onChange({ loanRate: v })} min={0} max={12} step={0.1} suffix="%" />
          <Field label="Running costs & vacancy" value={p.costRatio} onChange={(v) => onChange({ costRatio: v })} min={0} max={60} step={1} suffix="% of rent" />
          <Field label="Capital growth (real, after inflation)" value={p.growthReal} onChange={(v) => onChange({ growthReal: v })} min={-2} max={6} step={0.5} suffix="% p.a." />
          <Field label="What you paid (cost base for CGT)" value={p.purchasePrice} onChange={(v) => onChange({ purchasePrice: v })} min={0} max={5_000_000} step={10_000} prefix="$" />
        </div>
      )}

      {/* Net rent + assessment summary */}
      <div className="rounded-xl border border-line bg-panel px-4 py-3 text-xs text-muted">
        <InlineExplainer
          label="Net rent (after costs & interest)"
          value={`${fmtCurrency(Math.round(netRent))}/yr`}
          valueClassName={netRent < 0 ? "text-amber-400" : "text-accent"}
        >
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span>Gross rent ({p.grossYield}% of {fmtCurrency(p.value)})</span>
              <span className="tabular-nums">{fmtCurrency(Math.round((p.value * p.grossYield) / 100))}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>− Running costs &amp; vacancy ({p.costRatio}% of rent)</span>
              <span className="tabular-nums">−{fmtCurrency(Math.round((p.value * p.grossYield * p.costRatio) / 10000))}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>− Loan interest ({p.loanRate}% of {fmtCurrency(p.loanBalance)})</span>
              <span className="tabular-nums">−{fmtCurrency(Math.round((p.loanBalance * p.loanRate) / 100))}</span>
            </div>
            <div className="flex justify-between gap-4 border-t border-line pt-1 font-semibold text-white">
              <span>Net rent</span>
              <span className="tabular-nums">{fmtCurrency(Math.round(netRent))}/yr</span>
            </div>
          </div>
          <p className="mt-2">
            Loan <em>principal</em> isn&apos;t subtracted — it&apos;s not a rental expense. This net
            figure is what the Age Pension income test assesses (your actual rent, not a deemed rate).
          </p>
        </InlineExplainer>
        <div className="mt-1 flex justify-between">
          <span>Assessable net equity</span>
          <span className="font-semibold tabular-nums text-slate-200">{fmtCurrency(netEquity(p, p.value))}</span>
        </div>
        <p className="mt-2">
          Counts as {fmtCurrency(Math.round(incomeTestRent(p, p.value)))}/yr of income (actual rent,
          not deemed) and {fmtCurrency(netEquity(p, p.value))} of assessable assets.
        </p>
      </div>
        </>
      )}
    </div>
  );
}
