"use client";

import { useEffect, useState } from "react";
import type { TtrFlow } from "@/lib/au/ttrFlow";
import { fmtCurrency } from "@/lib/au/format";

const C = {
  slice: "#fbbf24", // amber — extra sacrificed
  rest: "#64748b", // slate — the rest of pay
  cash: "#f5c451", // gold — take-home
  super: "#34d399", // emerald — into / kept in super
  tax: "#fb7185", // rose — tax
  mint: "#5eead4", // teal — the tax-free TTR pension "return"
};
const cur = (n: number) => fmtCurrency(Math.round(n));

type Span = { l0: number; l1: number; r0: number; r1: number };

/** The Sankey — salary splits into the sacrificed slice + taxable pay; the slice
 *  mostly returns as a tax-free TTR pension (mint) to take-home, a little stays in
 *  super (green), a sliver is tax (rose); the rest of pay funds tax + take-home. */
function FlowDiagram({ f, mode }: { f: TtrFlow; mode: "with" | "without" }) {
  const W = 720, H = 262, top = 44, bottom = 14, gap = 13;
  const usable = H - top - bottom;
  const scale = (usable - 2 * gap) / f.salary; // same scale both modes → take-home node stays put
  const LX = 132, LW = 15, RX = 566, RW = 15;
  const mx = (LX + LW + RX) / 2;

  const path = (s: Span) =>
    `M${LX + LW},${s.l0} C${mx},${s.l0} ${mx},${s.r0} ${RX},${s.r0} L${RX},${s.r1} C${mx},${s.r1} ${mx},${s.l1} ${LX + LW},${s.l1} Z`;
  const ribbon = (s: Span, fill: string, op: number, key: string) => (
    <path key={key} d={path(s)} fill={fill} fillOpacity={op} />
  );
  const bar = (x: number, y0: number, y1: number, fill: string, key: string) => (
    <rect key={key} x={x} y={y0} width={LW} height={Math.max(1, y1 - y0)} rx={3} fill={fill} />
  );
  const lab = (x: number, y: number, t: string, o: { size?: number; w?: number; fill?: string; anchor?: string } = {}) => (
    <text key={`l${x}-${y}-${t}`} x={x} y={y} fontSize={o.size ?? 12.5} fontWeight={o.w ?? 700}
      fill={o.fill ?? "#e2e8f0"} textAnchor={o.anchor ?? "start"} style={{ letterSpacing: "-0.01em" }}>{t}</text>
  );
  const rLab = (yTop: number, h: number, big: string, small: string, fill: string) => [
    lab(RX + RW + 9, yTop + h / 2 - 1, big, { size: 13, w: 800, fill }),
    lab(RX + RW + 9, yTop + h / 2 + 13, small, { size: 10.5, w: 600, fill: "#94a3b8" }),
  ];
  const salaryHeader = [
    lab(LX + LW / 2, top - 26, "YOUR SALARY", { size: 10.5, w: 700, fill: "#94a3b8", anchor: "middle" }),
    lab(LX + LW / 2, top - 11, cur(f.salary), { size: 14, w: 800, anchor: "middle" }),
  ];
  const svgProps = { viewBox: `0 0 ${W} ${H}`, className: "h-auto w-full", style: { minWidth: 480 }, role: "img" as const };

  // ── WITHOUT TTR: the whole salary is taxable — it splits into tax + take-home. ──
  if (mode === "without") {
    const taxWithout = f.incomeTax + f.taxSaved;
    const salH = f.salary * scale, thH = f.takeHome * scale, txH = taxWithout * scale;
    const thTop = top, txTop = thTop + thH + gap;
    let ly = top;
    const th: Span = { l0: ly, l1: (ly += thH), r0: thTop, r1: thTop + thH };
    const tx: Span = { l0: ly, l1: (ly += txH), r0: txTop, r1: txTop + txH };
    return (
      <svg {...svgProps} aria-label={`Without TTR: ${cur(f.salary)} salary → ${cur(f.takeHome)} take-home, ${cur(taxWithout)} tax`}>
        {ribbon(th, C.cash, 0.5, "r-th")}
        {ribbon(tx, C.tax, 0.5, "r-tx")}
        {bar(LX, top, top + salH, C.rest, "b-sal")}
        {bar(RX, thTop, thTop + thH, C.cash, "b-th")}
        {bar(RX, txTop, txTop + txH, C.tax, "b-tx")}
        {salaryHeader}
        {lab(LX - 8, top + salH / 2 - 1, cur(f.salary), { anchor: "end", size: 12 })}
        {lab(LX - 8, top + salH / 2 + 12, "all taxable", { anchor: "end", size: 10, w: 600, fill: "#94a3b8" })}
        {rLab(thTop, thH, cur(f.takeHome), "take-home", C.cash)}
        {rLab(txTop, txH, cur(taxWithout), "tax paid", C.tax)}
      </svg>
    );
  }

  // ── WITH TTR ──
  const sliceH = f.slice * scale, restH = f.taxablePay * scale;
  const sliceTop = top, restTop = top + sliceH;
  const thH = f.takeHome * scale, spH = Math.max(2, f.superKept * scale), txH = (f.incomeTax + f.contribTax) * scale;
  const thTop = top, spTop = thTop + thH + gap, txTop = spTop + spH + gap;

  // left source cursors (slice segment, then rest segment), then right sink cursors
  let lyS = sliceTop, lyR = restTop;
  const pen: Span = { l0: lyS, l1: (lyS += f.pension * scale), r0: 0, r1: 0 };
  const kept: Span = { l0: lyS, l1: (lyS += f.superKept * scale), r0: 0, r1: 0 };
  const ctax: Span = { l0: lyS, l1: (lyS += f.contribTax * scale), r0: 0, r1: 0 };
  const th: Span = { l0: lyR, l1: (lyR += f.salaryTakeHome * scale), r0: 0, r1: 0 };
  const itax: Span = { l0: lyR, l1: (lyR += f.incomeTax * scale), r0: 0, r1: 0 };
  let ryTh = thTop, ryTx = txTop;
  th.r0 = ryTh; th.r1 = ryTh += f.salaryTakeHome * scale;
  pen.r0 = ryTh; pen.r1 = ryTh += f.pension * scale;
  kept.r0 = spTop; kept.r1 = spTop + spH;
  itax.r0 = ryTx; itax.r1 = ryTx += f.incomeTax * scale;
  ctax.r0 = ryTx; ctax.r1 = ryTx += f.contribTax * scale;
  const penMidY = (pen.l0 + pen.l1 + pen.r0 + pen.r1) / 4;

  return (
    <svg {...svgProps}
      aria-label={`Flow of ${cur(f.salary)} salary: ${cur(f.takeHome)} take-home, ${cur(f.superKept)} extra super, ${cur(f.incomeTax + f.contribTax)} tax`}>
      {/* ribbons first, nodes + labels on top */}
      {ribbon(th, C.cash, 0.5, "r-th")}
      {ribbon(itax, C.tax, 0.5, "r-it")}
      {ribbon(ctax, C.tax, 0.5, "r-ct")}
      {ribbon(kept, C.super, 0.62, "r-kt")}
      {ribbon(pen, C.mint, 0.66, "r-pn")}
      {bar(LX, sliceTop, sliceTop + sliceH, C.slice, "b-sl")}
      {bar(LX, restTop, restTop + restH, C.rest, "b-rs")}
      {bar(RX, thTop, thTop + thH, C.cash, "b-th")}
      {bar(RX, spTop, spTop + spH, C.super, "b-sp")}
      {bar(RX, txTop, txTop + txH, C.tax, "b-tx")}

      {/* salary header */}
      {lab(LX + LW / 2, top - 26, "YOUR SALARY", { size: 10.5, w: 700, fill: "#94a3b8", anchor: "middle" })}
      {lab(LX + LW / 2, top - 11, cur(f.salary), { size: 14, w: 800, anchor: "middle" })}
      {/* left labels */}
      {lab(LX - 8, sliceTop + sliceH / 2 - 1, cur(f.slice), { anchor: "end", size: 12 })}
      {lab(LX - 8, sliceTop + sliceH / 2 + 12, "extra to super", { anchor: "end", size: 10, w: 600, fill: "#94a3b8" })}
      {lab(LX - 8, restTop + restH / 2 - 1, cur(f.taxablePay), { anchor: "end", size: 12 })}
      {lab(LX - 8, restTop + restH / 2 + 12, "taxable pay", { anchor: "end", size: 10, w: 600, fill: "#94a3b8" })}
      {/* right labels */}
      {lab(RX + RW + 9, thTop + thH / 2 - 1, cur(f.takeHome), { size: 13, w: 800, fill: C.cash })}
      {lab(RX + RW + 9, thTop + thH / 2 + 13, "take-home · unchanged", { size: 10.5, w: 600, fill: "#94a3b8" })}
      {lab(RX + RW + 9, spTop + spH / 2 - 1, "+" + cur(f.superKept), { size: 13, w: 800, fill: C.super })}
      {lab(RX + RW + 9, spTop + spH / 2 + 13, "extra kept in super", { size: 10.5, w: 600, fill: "#94a3b8" })}
      {lab(RX + RW + 9, txTop + txH / 2 - 1, cur(f.incomeTax + f.contribTax), { size: 13, w: 800, fill: C.tax })}
      {lab(RX + RW + 9, txTop + txH / 2 + 13, "tax paid", { size: 10.5, w: 600, fill: "#94a3b8" })}
      {/* pension callout */}
      <text x={mx} y={penMidY - 3} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={C.mint}>tax-free TTR pension</text>
      <text x={mx} y={penMidY + 11} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={C.mint}>{cur(f.pension)} → back to you</text>
    </svg>
  );
}

function WayBar({ label, tax, taxColor, segs, active = true }: {
  label: string; tax: string; taxColor: string; active?: boolean;
  segs: { w: number; fill: string; text: string; short?: string }[];
}) {
  const total = segs.reduce((s, x) => s + x.w, 0) || 1;
  return (
    <div className={`rounded-xl border bg-panel px-4 py-1.5 transition ${active ? "border-accent/50 ring-1 ring-accent/25" : "border-line opacity-45"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-white">{label}</div>
        <div className="shrink-0 text-sm font-bold tabular-nums" style={{ color: taxColor }}>{tax}</div>
      </div>
      <div className="mt-1 flex h-6 overflow-hidden rounded-lg border border-line">
        {segs.map((s, i) => {
          const pct = (s.w / total) * 100;
          // Use the full label only when the segment is wide enough to fit it; fall
          // back to a short label (or nothing) so text never clips.
          const shown = pct <= 12 ? "" : s.short && pct < 21 ? s.short : s.text;
          return (
            <div key={i} className="flex items-center overflow-hidden whitespace-nowrap px-1.5 text-[10px] font-semibold text-black/85"
              style={{ flexGrow: s.w, flexBasis: 0, background: s.fill }}>
              {shown}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Reusable modal explaining the flow of funds + tax advantage of a TTR year. Given
 *  a list of TTR-active years, the user can step ← / → between them (like the income
 *  and balance year modals). */
export default function TtrFlowModal({
  flows,
  initialAge,
  onClose,
}: {
  flows: { age?: number; flow: TtrFlow }[];
  initialAge?: number;
  onClose: () => void;
}) {
  const [i, setI] = useState(() => {
    const idx = flows.findIndex((x) => x.age === initialAge);
    return idx >= 0 ? idx : 0;
  });
  const idx = Math.min(i, flows.length - 1);
  const f = flows[idx].flow;
  const age = flows[idx].age;
  const canPrev = idx > 0;
  const canNext = idx < flows.length - 1;
  const go = (d: number) => setI((n) => Math.max(0, Math.min(flows.length - 1, n + d)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && canPrev) go(-1);
      else if (e.key === "ArrowRight" && canNext) go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, canPrev, canNext]);

  const asSalaryKeep = f.slice - f.taxSaved; // in-pocket if taken as salary (= the pension amount)
  const [mode, setMode] = useState<"with" | "without">("with");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Transition to Retirement</div>
            <h2 className="mt-0.5 text-lg font-bold text-white">
              Same take-home. More super. Less tax.{age != null ? <span className="text-sm font-normal text-muted"> · age {age}</span> : null}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {flows.length > 1 && (
              <>
                <button onClick={() => go(-1)} disabled={!canPrev} title="Previous year" aria-label="Previous TTR year"
                  className="rounded-lg px-2 py-1 text-muted transition hover:text-white disabled:opacity-30">←</button>
                <button onClick={() => go(1)} disabled={!canNext} title="Next year" aria-label="Next TTR year"
                  className="rounded-lg px-2 py-1 text-muted transition hover:text-white disabled:opacity-30">→</button>
              </>
            )}
            <button onClick={onClose} className="rounded-lg px-2 py-1 text-xl leading-none text-muted transition hover:text-white" aria-label="Close">×</button>
          </div>
        </div>

        <div className="space-y-3 overflow-y-auto px-6 py-3.5">
          {/* outcome chips — aligned to the selected mode */}
          <div className="grid grid-cols-3 gap-2">
            {(mode === "with"
              ? [
                  { k: "Take-home", v: cur(f.takeHome), s: "unchanged", c: C.cash },
                  { k: "Extra super", v: "+" + cur(f.superKept), s: "at no cost to pay", c: C.super },
                  { k: "Net tax saved", v: cur(f.taxSaved - f.contribTax), s: `${cur(f.taxSaved)} without TTR - ${cur(f.contribTax)} with TTR`, c: C.tax },
                ]
              : [
                  { k: "Take-home", v: cur(f.takeHome), s: "your pay", c: C.cash },
                  { k: "Extra super", v: "$0", s: "nothing extra without TTR", c: C.super },
                  { k: "Tax on the slice", v: cur(f.taxSaved), s: `at your ${f.marginalPct}% marginal rate`, c: C.tax },
                ]
            ).map((o) => (
              <div key={o.k} className="relative overflow-hidden rounded-xl border border-line bg-panel-2 py-1.5 pl-3.5 pr-3">
                <span className="absolute inset-y-0 left-0 w-1" style={{ background: o.c }} />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{o.k}</span>
                  <span className="text-[17px] font-extrabold leading-none tabular-nums text-white">{o.v}</span>
                </div>
                <div className="mt-0.5 text-[10px] leading-tight text-muted">{o.s}</div>
              </div>
            ))}
          </div>

          {/* flow */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Where the money goes</h3>
            </div>
            {/* Prominent compare toggle — both options styled as real buttons so it's
                obvious you can switch the flow between with / without TTR. */}
            <div className="mb-1.5 flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/[0.06] p-1">
              <span className="hidden pl-1 pr-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent sm:inline">Compare</span>
              {([["without", "Without TTR"], ["with", "With TTR"]] as const).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setMode(v)}
                  aria-pressed={mode === v}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-bold transition ${
                    mode === v
                      ? "bg-accent text-ink shadow"
                      : "border border-line bg-panel-2 text-slate-200 hover:border-accent/60 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto rounded-xl border border-line bg-panel-2 p-1.5">
              <FlowDiagram f={f} mode={mode} />
            </div>
          </div>

          {/* two ways */}
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">The {cur(f.slice)} slice, two ways</h3>
              <span className="text-[11px] text-muted">your {f.marginalPct}% rate vs super's 15%</span>
            </div>
            <div className="space-y-2">
              <WayBar label="If you took it as salary"
                active={mode === "without"}
                tax={`${cur(f.taxSaved)} tax`} taxColor={C.tax}
                segs={[{ w: f.taxSaved, fill: C.tax, text: `${cur(f.taxSaved)} tax` }, { w: asSalaryKeep, fill: C.cash, text: `${cur(asSalaryKeep)} in pocket` }]} />
              <WayBar label="Sacrificed via TTR"
                active={mode === "with"}
                tax={`${cur(f.contribTax)} tax`} taxColor={C.tax}
                segs={[
                  { w: f.contribTax, fill: C.tax, text: `${cur(f.contribTax)} tax` },
                  { w: f.pension, fill: C.cash, text: `${cur(f.pension)} in pocket from TTR pension`, short: `${cur(f.pension)} in pocket` },
                  { w: f.superKept, fill: C.super, text: `${cur(f.superKept)} stays in super`, short: `${cur(f.superKept)} super` },
                ]} />
            </div>
            <p className="mt-2 rounded-xl border px-4 py-2 text-[12.5px] leading-snug text-slate-200"
              style={{ borderColor: "#34d39955", background: "#34d39914" }}>
              Same <b style={{ color: C.cash }}>{cur(f.slice)}</b> either way — tax drops from {cur(f.taxSaved)} to {cur(f.contribTax)}; that{" "}
              <b style={{ color: C.super }}>{cur(f.taxSaved - f.contribTax)}</b> stays in super and a {cur(f.pension)} tax-free pension holds your take-home.
              <span className="text-muted"> Today&apos;s dollars; general info, not advice.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
