"use client";

import { useState } from "react";
import Link from "next/link";
import { fmtCurrency } from "@/lib/au/format";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { agePension, deemedIncome } from "@/lib/au/agePension";
import type { Household } from "@/lib/au/types";

const AP = DEFAULT_CONFIG.agePension;
const DEEM = DEFAULT_CONFIG.deeming;
const FN = 26; // fortnights per year

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
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-2 w-full accent-emerald-500"
      />
      {hint && <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

/** One line of workings: a label + the arithmetic + a value on the right. */
function Row({ label, formula, value, strong, muted }: {
  label: string; formula?: string; value: string; strong?: boolean; muted?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <div className="min-w-0">
        <div className={`text-[11px] leading-snug ${strong ? "font-semibold text-slate-200" : muted ? "text-muted" : "text-slate-300"}`}>{label}</div>
        {formula && <div className="text-[11px] leading-snug text-muted">{formula}</div>}
      </div>
      <div className={`shrink-0 text-[11px] tabular-nums ${strong ? "font-bold text-white" : "text-slate-200"}`}>{value}</div>
    </div>
  );
}

const TERMS: { term: string; def: string }[] = [
  { term: "Assessable assets", def: "Almost everything you own except your family home — super, shares, bank accounts, managed funds, a car, home contents and personal effects, valued at what you'd get selling them." },
  { term: "Income test", def: "One of the two means tests. It reduces your pension by 50c for every $1 of assessable income above the income free area." },
  { term: "Assets test", def: "The other means test. It reduces your pension by $3 per fortnight for every $1,000 of assessable assets above the assets free area (≈ 7.8% a year)." },
  { term: "Deeming", def: "Rather than track your actual investment returns, the government 'deems' your financial assets to earn a set rate — a lower rate up to a threshold and a higher rate above it. That deemed amount is your assessable income from investments." },
  { term: "Deemed income", def: "The income figure produced by deeming — used in the income test, whether or not your investments actually earn that much." },
  { term: "Taper rate", def: "How fast the pension falls once you're over a free area: 50c per $1 of income, or $3/fortnight per $1,000 of assets." },
  { term: "Free area", def: "How much income or assets you can have before the pension starts to reduce. Below both free areas you get the maximum rate." },
  { term: "Pension supplement", def: "Extra amounts (the Pension Supplement and Energy Supplement) paid on top of the base rate. The maximum figures here already include them." },
  { term: "Homeowner", def: "Owning the home you live in. The home itself is exempt, but homeowners get a lower assets free area than non-homeowners (who are assumed to pay rent)." },
];

// A standalone, self-contained Age Pension estimator for /learn — the same means-test
// engine the planner uses (lib/au/agePension.ts), driven by a handful of inputs.
// General information only (2026 vintage rates), not personal financial advice.
export default function AgePensionCalculator() {
  const [household, setHousehold] = useState<Household>("single");
  const [tenure, setTenure] = useState<"own" | "rent">("own");
  const [assets, setAssets] = useState(400_000);
  const [otherIncome, setOtherIncome] = useState(0);

  const homeowner = tenure === "own";
  const cfg = household === "single" ? AP.single : AP.couple;
  const maxAnnual = cfg.maxAnnual;

  // Engine result (pays the LOWER of the two tests).
  const result = agePension(
    { household, homeowner, assessableAssets: assets, financialAssets: assets, otherIncome },
    DEFAULT_CONFIG,
  );

  // Re-derive the intermediate steps for the workings (same formulas as the engine).
  const deemThreshold = household === "single" ? DEEM.threshold.single : DEEM.threshold.couple;
  const deemLower = Math.min(assets, deemThreshold) * DEEM.lowerRate;
  const deemUpper = Math.max(0, assets - deemThreshold) * DEEM.upperRate;
  const deemed = deemedIncome(assets, household, DEFAULT_CONFIG); // = deemLower + deemUpper
  const totalIncome = deemed + otherIncome;
  const incomeOver = Math.max(0, totalIncome - cfg.incomeFreeAreaAnnual);
  const incomeReduction = incomeOver * AP.incomeTaperPerDollar;

  const assetsFreeArea = homeowner ? cfg.assetsFreeArea.homeowner : cfg.assetsFreeArea.nonHomeowner;
  const assetsOver = Math.max(0, assets - assetsFreeArea);
  const assetsReduction = assetsOver * AP.assetsTaperPerDollar;

  // Cut-off points (where each test drives the pension to zero).
  const assetsCutoff = assetsFreeArea + maxAnnual / AP.assetsTaperPerDollar;
  const incomeCutoff = cfg.incomeFreeAreaAnnual + maxAnnual / AP.incomeTaperPerDollar;

  const annual = result.annual;
  const status = annual >= maxAnnual - 1 ? "full" : annual <= 0 ? "none" : "part";
  const fortnight = annual / FN;

  const money = (x: number) => fmtCurrency(Math.round(x));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ── Inputs ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-line bg-panel p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-accent">Your situation</h3>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-200">Household</label>
            <div className="mt-2">
              <Segmented
                value={household}
                onChange={(v) => setHousehold(v)}
                options={[{ v: "single", l: "Single" }, { v: "couple", l: "Couple" }]}
              />
            </div>
            {household === "couple" && (
              <p className="mt-1.5 text-[11px] leading-snug text-muted">Enter your <span className="text-slate-300">combined</span> assets and income — couples are assessed together.</p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-200">Do you own your home?</label>
            <div className="mt-2">
              <Segmented
                value={tenure}
                onChange={(v) => setTenure(v)}
                options={[{ v: "own", l: "Homeowner" }, { v: "rent", l: "Non-homeowner" }]}
              />
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-muted">
              Your home is exempt either way. Homeowners get a lower assets free area ({money(cfg.assetsFreeArea.homeowner)}) than non-homeowners ({money(cfg.assetsFreeArea.nonHomeowner)}).
            </p>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="ap-assets" className="text-sm font-medium text-slate-200">Assessable assets (excluding your home)</label>
              <div className="flex items-baseline text-sm font-bold text-white">
                <span className="text-muted">$</span>
                <input
                  id="ap-assets"
                  type="text"
                  inputMode="numeric"
                  value={assets.toLocaleString("en-AU")}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[^\d]/g, ""));
                    if (!Number.isNaN(n)) setAssets(Math.min(n, 100_000_000));
                  }}
                  aria-label="Assessable assets (excluding your home)"
                  className="w-28 bg-transparent text-right tabular-nums text-white outline-none focus:border-b focus:border-accent"
                />
              </div>
            </div>
            <input
              type="range" min={0} max={3_000_000} step={5_000}
              value={Math.min(assets, 3_000_000)}
              onChange={(e) => setAssets(Number(e.target.value))}
              aria-label="Assessable assets slider"
              className="mt-2 w-full accent-emerald-500"
            />
            <p className="mt-1 text-[11px] leading-snug text-muted">
              Super, shares, bank accounts, managed funds, your car and home contents — valued at market/sale value. Type any amount; the slider covers up to $3m.
            </p>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-muted hover:text-slate-200">Advanced: other income</summary>
            <div className="mt-3">
              <MoneySlider
                label="Other income (per year)"
                value={otherIncome} min={0} max={100_000} step={1_000}
                onChange={setOtherIncome}
                hint="Income NOT from investments — e.g. wages, rent, or a defined-benefit/overseas pension. Your investments are counted via deeming below, so leave this at 0 if all your money is invested."
              />
            </div>
          </details>
        </div>
      </div>

      {/* ── Results ────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-accent/30 bg-accent/[0.06] p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Estimated Age Pension</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-bold tabular-nums text-white">{money(annual)}</span>
            <span className="text-sm text-muted">per year</span>
          </div>
          <div className="mt-1 text-sm text-slate-300">
            ≈ <span className="font-semibold tabular-nums text-white">${fortnight.toFixed(2)}</span> per fortnight
            {status === "full" && <span className="text-muted"> — the maximum rate</span>}
          </div>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-panel-2 px-3 py-1 text-[11px] font-medium">
            {status === "full" ? (
              <span className="text-emerald-300">● Full pension</span>
            ) : status === "part" ? (
              <span className="text-amber-300">● Part pension — reduced by the {result.bindingTest} test</span>
            ) : (
              <span className="text-rose-300">● Not eligible — above the {result.bindingTest === "assets" ? "assets" : "income"} cut-off</span>
            )}
          </div>
        </div>

        {/* Workings */}
        <div className="rounded-2xl border border-line bg-panel p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-accent">How this is worked out</div>
          <p className="mt-1 text-[11px] leading-snug text-muted">
            Two means tests run separately; you&apos;re paid the <span className="text-slate-300">lower</span> result. The maximum {household} rate
            (incl. supplements) is {money(maxAnnual)}/yr.
          </p>

          {/* Step 1 — deemed income */}
          <div className="mt-3 rounded-xl border border-line bg-panel-2 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">1 · Your income for the test</div>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              The income test doesn&apos;t use what your investments actually earn — it <span className="text-slate-300">&ldquo;deems&rdquo;</span> your {money(assets)} of assets to
              earn a set rate. That deemed figure is your income here{otherIncome > 0 ? ", plus the other income you entered" : ", even though you entered no other income"}.
            </p>
            <div className="mt-2">
              <Row label={`First ${money(deemThreshold)} of your assets`} formula={`${money(Math.min(assets, deemThreshold))} deemed at ${(DEEM.lowerRate * 100).toFixed(2)}%`} value={`${money(deemLower)}/yr`} />
              {assets > deemThreshold && (
                <Row label="Your remaining assets" formula={`${money(assets - deemThreshold)} deemed at ${(DEEM.upperRate * 100).toFixed(2)}%`} value={`${money(deemUpper)}/yr`} />
              )}
              {otherIncome > 0 && <Row label="Plus your other income" formula="wages, rent, DB/overseas pension — not deemed" value={`${money(otherIncome)}/yr`} />}
              <div className="mt-1 border-t border-line pt-1">
                <Row label="Total assessable income" value={`${money(totalIncome)}/yr`} strong />
              </div>
            </div>
          </div>

          {/* Step 2 — income test */}
          <div className="mt-2 rounded-xl border border-line bg-panel-2 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">2 · Income test</div>
              <div className="text-[11px] font-bold tabular-nums text-white">{money(result.incomeTestAnnual)}/yr</div>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              Your {money(totalIncome)} assessable income (from step 1) is {money(incomeOver)} over the {money(cfg.incomeFreeAreaAnnual)} free area. Reduce the max by 50c per $1:
              {" "}{money(maxAnnual)} − ({money(incomeOver)} × 50%) = <span className="font-semibold text-slate-200">{money(result.incomeTestAnnual)}</span>.
            </p>
          </div>

          {/* Step 3 — assets test */}
          <div className="mt-2 rounded-xl border border-line bg-panel-2 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">3 · Assets test</div>
              <div className="text-[11px] font-bold tabular-nums text-white">{money(result.assetsTestAnnual)}/yr</div>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              Assets over the {money(assetsFreeArea)} free area are {money(assetsOver)}. Reduce the max by $3/fortnight per $1,000 (${(AP.assetsTaperPerDollar).toFixed(3)}/yr per $1):
              {" "}{money(maxAnnual)} − ({money(assetsOver)} × {(AP.assetsTaperPerDollar * 100).toFixed(1)}%) = <span className="font-semibold text-slate-200">{money(result.assetsTestAnnual)}</span>.
            </p>
          </div>

          {/* Step 4 — the lower one wins */}
          <div className="mt-2 rounded-xl border border-accent/30 bg-accent/[0.06] p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-200">4 · You&apos;re paid the lower result</span>
              <span className="text-sm font-bold tabular-nums text-white">{money(annual)}/yr</span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              min({money(result.incomeTestAnnual)}, {money(result.assetsTestAnnual)}) = {money(annual)} — the{" "}
              <span className="text-slate-200">{result.bindingTest} test</span> binds here.
              {status !== "none" && (
                <> Your pension reaches $0 once {result.bindingTest === "assets"
                  ? <>assets exceed <span className="text-slate-200">{money(assetsCutoff)}</span></>
                  : <>income exceeds <span className="text-slate-200">{money(incomeCutoff)}</span></>}.</>
              )}
            </p>
          </div>

          {/* Jargon */}
          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] font-medium text-muted hover:text-slate-200">Jargon, explained</summary>
            <dl className="mt-2 space-y-1.5">
              {TERMS.map((t) => (
                <div key={t.term} className="rounded-lg border border-line bg-panel-2 px-3 py-2">
                  <dt className="text-[11px] font-semibold text-slate-200">{t.term}</dt>
                  <dd className="text-[11px] leading-snug text-muted">{t.def}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>

        <p className="text-[11px] leading-relaxed text-muted">
          General information only, using 1&nbsp;Jul&nbsp;2026 rates in today&apos;s dollars — not personal financial advice. Your actual
          entitlement depends on Services Australia&apos;s full assessment (including asset types, gifting and relationship rules) and your
          circumstances. Rates and thresholds are indexed periodically.
        </p>
      </div>
    </div>
  );
}
