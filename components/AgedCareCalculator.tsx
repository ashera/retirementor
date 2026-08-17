"use client";

import { useState } from "react";
import Link from "next/link";
import { fmtCurrency } from "@/lib/au/format";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { meansScore, residentialAnnualCost, homeCareAnnualCost, radRetention, radRefund } from "@/lib/au/agedCare";

const AC = DEFAULT_CONFIG.agedCare;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

type CareType = "residential" | "home";
type Accom = "rad" | "dap" | "mix";

function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { v: T; l: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-line bg-panel-2 p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`rounded-md px-3 py-1.5 font-medium transition ${value === o.v ? "bg-accent/20 text-accent" : "text-muted hover:text-white"}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function MoneySlider({ label, value, min, max, step, onChange, hint }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-sm font-medium text-slate-200">{label}</label>
        <span className="text-sm font-bold tabular-nums text-white">{fmtCurrency(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-2 w-full accent-emerald-500"
      />
      {hint && <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

function FeeRow({ label, formula, value, muted }: { label: string; formula?: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 py-2 last:border-0">
      <div className="min-w-0">
        <div className={`text-sm ${muted ? "text-muted" : "text-slate-200"}`}>{label}</div>
        {formula && <div className="text-[11px] text-muted">{formula}</div>}
      </div>
      <div className={`shrink-0 tabular-nums ${muted ? "text-muted" : "text-slate-100"}`}>{fmtCurrency(Math.round(value))}</div>
    </div>
  );
}

// A standalone, self-contained aged-care fee estimator for /learn — the same pure cost
// model the planner uses (lib/au/agedCare.ts), driven by a handful of inputs. General
// information only (2026 vintage), not personal financial advice.
export default function AgedCareCalculator() {
  const [careType, setCareType] = useState<CareType>("residential");
  const [assets, setAssets] = useState(500_000);
  const [homeowner, setHomeowner] = useState(true);
  const [homeValue, setHomeValue] = useState(800_000);
  const [homeAction, setHomeAction] = useState<"keep" | "sell">("keep");
  const [income, setIncome] = useState(0);
  const [accom, setAccom] = useState<Accom>("dap");
  const [room, setRoom] = useState(AC.radNationalAvg);
  const [radSharePct, setRadSharePct] = useState(50);
  const [years, setYears] = useState(3);

  const residential = careType === "residential";

  // Accommodation: how much of the room is pre-paid as a (refundable, assets-test-exempt)
  // RAD lump vs charged daily (DAP).
  const radLump = residential ? (accom === "rad" ? room : accom === "mix" ? room * (radSharePct / 100) : 0) : 0;
  const radUnpaid = residential ? Math.max(0, room - radLump) : 0;

  // Assessable assets for the means test: your savings + super + investments, plus the
  // former home (capped if kept; full value if sold), LESS any RAD lump (which is exempt).
  const homeInTest = residential && homeowner
    ? homeAction === "keep"
      ? Math.min(homeValue, AC.homeValueCapMeansTest)
      : homeValue
    : 0; // in home care you still live at home — the residence is exempt
  const assessable = Math.max(0, assets + homeInTest - radLump);
  const means = { assets: assessable, income };
  const score = meansScore(means, AC);

  const resid = residentialAnnualCost({ means, radUnpaid }, AC);
  const homeAnnual = homeCareAnnualCost(means, AC);
  const annualFees = residential ? resid.total : homeAnnual;

  const retention = residential ? radRetention(radLump, years, AC) : 0;
  const refund = residential ? radRefund(radLump, years, AC) : 0;
  const totalOverStay = annualFees * years + retention;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ── Inputs ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-line bg-panel p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-accent">Your situation</h3>

        <div className="mt-4 space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-200">Type of care</label>
            <Segmented
              value={careType}
              options={[{ v: "residential", l: "Residential (a care home)" }, { v: "home", l: "Support at Home" }]}
              onChange={setCareType}
            />
          </div>

          <MoneySlider
            label="Savings, super & investments at entry"
            value={assets} min={0} max={3_000_000} step={10_000} onChange={(n) => setAssets(n)}
            hint="Your assessable assets (everything except your home) at the time you ENTER care — that's when aged care means-tests you. If care is years away, use what you expect to have left then, not today's balance."
          />

          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-slate-200">Do you own your home?</label>
              <Segmented value={homeowner ? "y" : "n"} options={[{ v: "y", l: "Yes" }, { v: "n", l: "No" }]} onChange={(v) => setHomeowner(v === "y")} />
            </div>
            {homeowner && (
              <div className="mt-3 space-y-3 border-l-2 border-line pl-3">
                <MoneySlider label="Home value" value={homeValue} min={0} max={3_000_000} step={25_000} onChange={setHomeValue} />
                {residential && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-300">In residential care you&apos;d…</span>
                    <Segmented value={homeAction} options={[{ v: "keep", l: "Keep it" }, { v: "sell", l: "Sell it" }]} onChange={setHomeAction} />
                  </div>
                )}
                {residential && homeAction === "keep" && (
                  <p className="text-[11px] leading-snug text-muted">
                    A kept former home is counted in the means test only up to {fmtCurrency(AC.homeValueCapMeansTest)} (and is
                    exempt for the first 2 years if a partner still lives there).
                  </p>
                )}
              </div>
            )}
          </div>

          {residential && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-200">Pay for the room as…</label>
                <Segmented
                  value={accom}
                  options={[{ v: "rad", l: "Lump sum (RAD)" }, { v: "dap", l: "Daily (DAP)" }, { v: "mix", l: "A mix" }]}
                  onChange={setAccom}
                />
                {accom === "mix" && (
                  <div className="mt-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-slate-300">Paid as a lump sum</span>
                      <span className="text-sm font-bold tabular-nums text-white">{radSharePct}%</span>
                    </div>
                    <input type="range" min={0} max={100} step={5} value={radSharePct} onChange={(e) => setRadSharePct(Number(e.target.value))} aria-label="Lump-sum share" className="mt-1 w-full accent-emerald-500" />
                  </div>
                )}
              </div>

              {accom !== "dap" && (
                <MoneySlider
                  label="Room price"
                  value={room} min={0} max={1_500_000} step={10_000} onChange={setRoom}
                  hint={`The advertised room price. The national average is about ${fmtCurrency(AC.radNationalAvg)}.`}
                />
              )}

              <div>
                <div className="flex items-baseline justify-between">
                  <label className="text-sm font-medium text-slate-200">Expected time in care</label>
                  <span className="text-sm font-bold tabular-nums text-white">{years} {years === 1 ? "year" : "years"}</span>
                </div>
                <input type="range" min={1} max={12} step={1} value={years} onChange={(e) => setYears(Number(e.target.value))} aria-label="Years in care" className="mt-2 w-full accent-emerald-500" />
                <p className="mt-1 text-[11px] text-muted">The typical stay is around {AC.medianDurationYears} years.</p>
              </div>
            </>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer text-muted hover:text-slate-200">Advanced: assessable income</summary>
            <div className="mt-3">
              <MoneySlider label="Assessable income (per year)" value={income} min={0} max={200_000} step={5_000} onChange={setIncome} hint="Usually the assets test binds; leave at 0 if unsure." />
            </div>
          </details>
        </div>
      </div>

      {/* ── Results ────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-accent/30 bg-accent/[0.06] p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Estimated {residential ? "care" : "Support at Home"} cost</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-bold tabular-nums text-white">{fmtCurrency(Math.round(annualFees))}</span>
            <span className="text-sm text-muted">per year</span>
          </div>
          <div className="mt-1 text-sm text-slate-300">
            ≈ <span className="font-semibold tabular-nums text-white">{fmtCurrency(Math.round(totalOverStay))}</span> over {years} {years === 1 ? "year" : "years"}
            {residential && retention > 0 && <span className="text-muted"> (incl. the deposit retention)</span>}.
          </div>

          {/* Means score */}
          <div className="mt-4 rounded-xl border border-line bg-panel-2 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-muted">Your means-tested share</span>
              <span className="text-sm font-bold tabular-nums text-white">{Math.round(score * 100)}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-panel">
              <div className="h-full rounded-full bg-accent" style={{ width: `${clamp(score * 100, 0, 100)}%` }} />
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted">
              You&apos;d pay {score >= 0.999 ? "the maximum" : `${Math.round(score * 100)}% of the maximum`} means-tested fees.
              Below {fmtCurrency(AC.careAssetFreeArea)} in assessable assets you pay none; at/above {fmtCurrency(AC.careAssetFullArea)} you pay the most.
            </p>
          </div>
        </div>

        {/* Breakdown */}
        <div className="rounded-2xl border border-line bg-panel p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-accent">What makes up the {fmtCurrency(Math.round(annualFees))}/yr</div>
          <div className="mt-2">
            {residential ? (
              <>
                <FeeRow label="Basic daily fee" formula="flat — everyone pays this" value={resid.basic} />
                <FeeRow label="Hotelling (meals, cleaning, laundry)" formula="means-tested, no cap" value={resid.hotelling} />
                <FeeRow label="Care contribution (NCCC)" formula={`means-tested, capped at ${fmtCurrency(AC.ncccLifetimeCap)} / ${AC.ncccMaxYears} yrs`} value={resid.nccc} />
                {radUnpaid > 0 && <FeeRow label="Daily room payment (DAP)" formula={`${fmtCurrency(Math.round(radUnpaid))} unpaid × ${(AC.mpir * 100).toFixed(2)}% MPIR`} value={resid.dap} />}
              </>
            ) : (
              <>
                <FeeRow label="Support at Home contribution" formula="scales with your means; clinical care is free" value={homeAnnual} />
                <p className="mt-2 text-[11px] leading-snug text-muted">
                  A simplified estimate. The real program has 8 care levels with quarterly budgets and a service-type split — this is a rough guide only.
                </p>
              </>
            )}
          </div>

          {residential && radLump > 0 && (
            <div className="mt-4 rounded-xl border border-line bg-panel-2 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-muted">Plus a one-off deposit (RAD)</span>
                <span className="text-base font-bold tabular-nums text-white">{fmtCurrency(Math.round(radLump))}</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-muted">
                Refundable and exempt from the assets test. The provider keeps a retention of {Math.round(AC.radRetentionPctPerYear * 100)}%/yr
                for up to {AC.radRetentionMaxYears} years — about <span className="text-slate-200">{fmtCurrency(Math.round(retention))}</span> over your stay —
                and <span className="text-slate-200">{fmtCurrency(Math.round(refund))}</span> returns to your estate.
              </p>
            </div>
          )}
        </div>

        <p className="text-[11px] leading-relaxed text-muted">
          General information only, a 2026-vintage estimate in today&apos;s dollars — not personal financial advice. Clinical
          care is fully government-funded and not charged here. Your actual fees depend on the full statutory means test,
          your provider&apos;s room price, and current rates.
        </p>
      </div>
    </div>
  );
}
