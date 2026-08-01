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
  const W = 720, H = 344, top = 56, bottom = 22, gap = 16;
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

function WayBar({ label, sub, tax, taxColor, segs }: {
  label: string; sub: string; tax: string; taxColor: string; segs: { w: number; fill: string; text: string }[];
}) {
  const total = segs.reduce((s, x) => s + x.w, 0) || 1;
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-white">
          {label}
          <span className="block text-[11px] font-normal text-muted">{sub}</span>
        </div>
        <div className="shrink-0 text-sm font-bold tabular-nums" style={{ color: taxColor }}>{tax}</div>
      </div>
      <div className="mt-2.5 flex h-7 overflow-hidden rounded-lg border border-line">
        {segs.map((s, i) => (
          <div key={i} className="flex items-center whitespace-nowrap px-2 text-[11px] font-semibold text-black/85"
            style={{ flexGrow: s.w, flexBasis: 0, background: s.fill }}>
            {(s.w / total) * 100 > 17 ? s.text : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Reusable modal explaining the flow of funds + tax advantage of a TTR year. */
export default function TtrFlowModal({ flow, age, onClose }: { flow: TtrFlow; age?: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const f = flow;
  const asSalaryKeep = f.slice - f.taxSaved; // in-pocket if taken as salary (= the pension amount)
  const [mode, setMode] = useState<"with" | "without">("with");
  const taxWithout = f.incomeTax + f.taxSaved;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Transition to Retirement</div>
            <h2 className="mt-0.5 text-lg font-bold text-white">
              Same take-home. More super. Less tax.{age ? <span className="text-sm font-normal text-muted"> · age {age}</span> : null}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-xl leading-none text-muted transition hover:text-white" aria-label="Close">×</button>
        </div>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          {/* outcome chips */}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { k: "Take-home", v: cur(f.takeHome), s: "unchanged", c: C.cash },
              { k: "Extra super", v: "+" + cur(f.superKept), s: "at no cost to pay", c: C.super },
              { k: "Income tax saved", v: cur(f.taxSaved), s: `on the slice`, c: C.tax },
            ].map((o) => (
              <div key={o.k} className="relative overflow-hidden rounded-xl border border-line bg-panel-2 px-3 py-2.5">
                <span className="absolute inset-y-0 left-0 w-1" style={{ background: o.c }} />
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{o.k}</div>
                <div className="mt-1 text-lg font-extrabold tabular-nums text-white">{o.v}</div>
                <div className="text-[11px] text-muted">{o.s}</div>
              </div>
            ))}
          </div>

          {/* flow */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Where the money goes</h3>
              <div className="flex gap-1 rounded-lg border border-line bg-panel-2 p-1 text-xs">
                {([["without", "Without TTR"], ["with", "With TTR"]] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setMode(v)}
                    aria-pressed={mode === v}
                    className={`rounded-md px-2.5 py-1 font-semibold transition ${
                      mode === v ? "bg-accent text-ink" : "text-muted hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-line bg-panel-2 p-2">
              <FlowDiagram f={f} mode={mode} />
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted">
              {mode === "without" ? (
                <>Without TTR the whole {cur(f.salary)} is taxable — {cur(taxWithout)} goes to tax. Switch to <b className="text-white">With TTR</b> to see {cur(f.taxSaved - f.contribTax)} of it redirected into super instead.</>
              ) : (
                <>The {cur(f.slice)} slice is taxed at 15% and mostly returns as a tax-free pension — so tax drops by {cur(taxWithout - (f.incomeTax + f.contribTax))} and that lands in super, take-home unchanged.</>
              )}
            </p>
          </div>

          {/* two ways */}
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">The {cur(f.slice)} slice, two ways</h3>
              <span className="text-[11px] text-muted">your {f.marginalPct}% rate vs super's 15%</span>
            </div>
            <div className="space-y-2.5">
              <WayBar label="If you took it as salary" sub={`Taxed at your ${f.marginalPct}% marginal rate`}
                tax={`${cur(f.taxSaved)} tax`} taxColor={C.tax}
                segs={[{ w: f.taxSaved, fill: C.tax, text: `tax ${cur(f.taxSaved)}` }, { w: asSalaryKeep, fill: C.cash, text: `${cur(asSalaryKeep)} in pocket` }]} />
              <WayBar label="Sacrificed via TTR" sub="Taxed at super's flat 15%"
                tax={`${cur(f.contribTax)} tax`} taxColor={C.super}
                segs={[{ w: f.contribTax, fill: C.tax, text: `tax ${cur(f.contribTax)}` }, { w: f.netToSuper, fill: C.super, text: `${cur(f.netToSuper)} into super` }]} />
            </div>
            <p className="mt-3 rounded-xl border px-4 py-3 text-sm text-slate-200"
              style={{ borderColor: "#34d39955", background: "#34d39914" }}>
              Same <b style={{ color: C.cash }}>{cur(f.slice)}</b> either way — but the tax drops from {cur(f.taxSaved)} to {cur(f.contribTax)}.
              That <b style={{ color: C.super }}>{cur(f.taxSaved - f.contribTax)}</b> gap is exactly the extra that stays in super, while a
              {" "}{cur(f.pension)} tax-free pension keeps your take-home whole.
            </p>
          </div>

          <p className="text-[11px] leading-snug text-muted">
            The sacrificed slice raises your concessional super contribution (taxed 15%) and lowers your assessable income, so income tax and
            the 2% Medicare levy fall. A tax-free TTR pension equal to the slice's after-tax value is drawn from super to hold your take-home,
            leaving the tax saved (net of the 15%) as extra super. Today's dollars; general information, not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
