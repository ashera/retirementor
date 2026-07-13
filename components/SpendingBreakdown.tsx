import { fmtCurrency } from "@/lib/au/format";

/** Splits an annual spend into Essentials (fixed floor), Discretionary (the part
 *  that flexes — e.g. under guardrails) and any Home loan (fixed): a stacked bar
 *  plus a legend. Ties directly to what a flexible-spending strategy can move. */
export default function SpendingBreakdown({
  essential,
  discretionary,
  loan,
  estimated,
}: {
  essential: number;
  discretionary: number;
  loan: number;
  estimated: boolean;
}) {
  const total = essential + discretionary + loan;
  const pct = (x: number) => (total > 0 ? (x / total) * 100 : 0);
  const rows: { color: string; label: string; value: number; note?: string }[] = [
    { color: "#94a3b8", label: "Essentials", value: essential, note: estimated ? "est." : undefined },
    { color: "#34d399", label: "Discretionary", value: discretionary, note: "flexes" },
    ...(loan > 0 ? [{ color: "#f59e0b", label: "Home loan", value: loan }] : []),
  ];
  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-panel">
        {rows.map((r) => (
          <div key={r.label} title={`${r.label} ${fmtCurrency(r.value)}`} style={{ width: `${pct(r.value)}%`, backgroundColor: r.color }} />
        ))}
      </div>
      <div className="space-y-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: r.color }} />
              {r.label}
              {r.note && <span className="text-[9px] uppercase tracking-wide text-muted/70">{r.note}</span>}
            </span>
            <span className="tabular-nums text-slate-300">{fmtCurrency(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
