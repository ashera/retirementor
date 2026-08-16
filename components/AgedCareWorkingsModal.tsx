"use client";

import Link from "next/link";
import { fmtCurrency } from "@/lib/au/format";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan, YearBreakdown } from "@/lib/au/types";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
// Show real precision without trailing zeros: 0.0796 → "7.96%", 0.33 → "33%".
const pct = (x: number) => `${(x * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

const CARE_LABEL = { residential: "Residential", home: "At home" } as const;
const ACC_LABEL = { rad: "Lump sum (RAD)", dap: "Daily (DAP)", combo: "A mix of lump sum and daily payment" } as const;
const HOME_LABEL = { sell: "Sell the home", "keep-vacant": "Keep the home", "keep-rent": "Keep & rent" } as const;

function Chip({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${accent ? "bg-accent/20 text-accent" : "bg-panel-2 text-slate-300"}`}>
      {children}
    </span>
  );
}

function Row({ label, formula, note, value, muted }: { label: string; formula: string; note?: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 py-2 last:border-0">
      <div className="min-w-0">
        <div className={`text-sm ${muted ? "text-muted" : "text-slate-200"}`}>{label}</div>
        <div className="text-[11px] text-muted">{formula}</div>
        {note && <div className="mt-0.5 text-[11px] leading-relaxed text-muted/75">{note}</div>}
      </div>
      <div className={`shrink-0 tabular-nums ${muted ? "text-muted" : "text-slate-100"}`}>{value}</div>
    </div>
  );
}

const TERMS: { term: string; def: string }[] = [
  { term: "Basic daily fee", def: "A flat everyday-living charge everyone in residential care pays — 85% of the single Age Pension. Not means-tested." },
  { term: "Hotelling", def: "A means-tested charge for 'hotel' services (meals, cleaning, laundry, heating). No cap." },
  { term: "NCCC", def: "Non-Clinical Care Contribution — a means-tested charge toward non-clinical personal care (bathing, dressing, mobility). Capped at a lifetime dollar amount or 4 years, whichever first." },
  { term: "RAD", def: "Refundable Accommodation Deposit — a lump sum for your room. Refundable to your estate, and exempt from the Age Pension assets test." },
  { term: "DAP", def: "Daily Accommodation Payment — paying for the room daily instead, as interest on the room price at the MPIR." },
  { term: "MPIR", def: "Maximum Permissible Interest Rate — the government rate that turns a room price into a DAP." },
  { term: "Means score", def: "A 0–1 measure of how much you contribute, from your assessable assets and income. 1 = the maximum means-tested charges (this version uses assets; income is added later)." },
];

// Full "how the cost is worked out" explainer for the aged-care card — the means
// score, the per-line fee arithmetic (with this scenario's real numbers), any
// probabilistic weighting, and a glossary. General information, not advice.
export default function AgedCareWorkingsModal({
  plan, breakdown, config, careAge, onClose, onEdit,
}: {
  plan: RetirementPlan;
  breakdown: YearBreakdown;
  config: EngineConfig;
  careAge: number;
  onClose: () => void;
  onEdit?: () => void; // open the "Model aged care" dialog directly
}) {
  const ac = plan.agedCare!;
  const AC = config.agedCare;
  const residential = ac.careType === "residential";

  // Reconstruct the v1 means indicator exactly as the engine did.
  const superOpen = Math.max(0, breakdown.openingSuper);
  const outsideOpen = Math.max(0, breakdown.openingOutside);
  const cappedHome = Math.min(Math.max(0, breakdown.homeValue), AC.homeValueCapMeansTest);
  const assets = superOpen + outsideOpen + cappedHome;
  const score = clamp01((assets - AC.careAssetFreeArea) / Math.max(1, AC.careAssetFullArea - AC.careAssetFreeArea));

  const full = breakdown.agedCareFull ?? breakdown.agedCareTotal ?? 0;

  const room = ac.radAmount ?? AC.radNationalAvg;
  const mode = residential ? (ac.accommodation ?? "dap") : "dap";
  const isLump = mode !== "dap";
  const lumpShare = mode === "rad" ? 1 : mode === "combo" ? clamp01((ac.radSharePct ?? 50) / 100) : 0;
  const chosenLump = room * lumpShare; // the RAD the provider is owed
  const fundedLump = breakdown.radHeld ?? 0; // paid as a refundable deposit
  const homeSale = breakdown.agedCareHomeSale ?? 0; // former-home equity that helped fund it
  const partialRad = fundedLump > 0 && chosenLump - fundedLump > 1;

  const livingSaved = breakdown.agedCareLivingSaved ?? 0;
  const livingNow = Math.max(0, breakdown.livingSpend); // personal living the model still funds
  const livingFull = livingNow + livingSaved; // the pre-care lifestyle spend
  const isCouple = plan.household === "couple";
  // Per-partner split of the household living during care (couple only).
  const perShare = livingFull / Math.max(1, plan.people.length);
  const careShare = perShare * AC.residentialLivingRetainedPct; // partner in care keeps a personal share
  const homeShare = perShare; // partner at home keeps their full share
  const homeAction = ac.homeAction ?? "keep-vacant";
  const entryPension = breakdown.agePension ?? 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-panel p-5 shadow-2xl md:max-w-3xl">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-white">How the Aged Care numbers work</h4>
          <button onClick={onClose} aria-label="Close" className="text-muted transition hover:text-white">✕</button>
        </div>
        <p className="mt-1 text-xs text-muted">
          At age {careAge}. Figures are 2026-vintage estimates in today&apos;s dollars.
        </p>

        {/* Your choices — echoes the Model aged care dialog so the working below is
            traceable to what the user picked. */}
        <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-line bg-panel-2/60 p-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-muted">Your choices (from the &ldquo;Model aged care&rdquo; dialog)</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip accent>{CARE_LABEL[ac.careType]}</Chip>
              {residential && <Chip accent>{ACC_LABEL[ac.accommodation ?? "dap"]}</Chip>}
              {residential && <Chip accent>{HOME_LABEL[ac.homeAction ?? "keep-vacant"]}</Chip>}
              <Chip accent>From {ac.entryAge} · {ac.durationYears} yr{ac.durationYears === 1 ? "" : "s"}</Chip>
            </div>
            {onEdit ? (
              <button
                type="button"
                onClick={() => onEdit()} // opens the dialog ON TOP; closing it returns here
                className="mt-2 text-[11px] font-medium text-accent hover:underline"
              >
                Edit the aged-care model →
              </button>
            ) : (
              <p className="mt-2 text-[11px] text-muted">Change any of these in the dialog and this working updates.</p>
            )}
          </div>
          <span className="hidden shrink-0 select-none text-4xl leading-none md:block" aria-hidden>🏥</span>
        </div>

        {/* Steps 1–4 flow into two columns on desktop, one on mobile. */}
        <div className="mt-4 grid gap-4 md:grid-cols-2 md:gap-x-5 md:[&>div]:mt-0">
        {/* Step 1 — the means test */}
        <div className="mt-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">1 · Your means score</div>
          <p className="mt-1 text-xs text-muted">
            The means-tested charges scale with your assessable position. This version uses assets (income is added in a
            later version).
          </p>
          <div className="mt-2 rounded-xl border border-line bg-panel-2 p-3">
            <Row label="Super (opening)" formula="assessed from Age-Pension age" value={fmtCurrency(Math.round(superOpen))} />
            <Row label="Savings outside super" formula="opening balance" value={fmtCurrency(Math.round(outsideOpen))} />
            {cappedHome > 0 && (
              <Row label="Former home (capped)" formula={`min(home value, ${fmtCurrency(AC.homeValueCapMeansTest)})`} value={fmtCurrency(Math.round(cappedHome))} />
            )}
            <Row label="Assessable assets" formula="sum of the above" value={fmtCurrency(Math.round(assets))} />
            <Row
              label="Means score"
              formula={`(assets − ${fmtCurrency(AC.careAssetFreeArea)}) ÷ (${fmtCurrency(AC.careAssetFullArea)} − ${fmtCurrency(AC.careAssetFreeArea)}), capped 0–1`}
              note={`${fmtCurrency(AC.careAssetFreeArea)} and ${fmtCurrency(AC.careAssetFullArea)} are the government aged-care asset thresholds: below the first you pay nothing means-tested, at/above the second you pay the maximum. A score of ${score.toFixed(2)} means ${score >= 0.999 ? "the maximum" : `${Math.round(score * 100)}% of the maximum`} charges.`}
              value={score.toFixed(2)}
            />
          </div>

          {/* Desktop-only factoid — fills the column beside the taller fees list. */}
          <div className="mt-3 hidden rounded-xl border border-line bg-panel-2/50 p-3 md:block">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <span aria-hidden>💡</span> Aged care in context
            </div>
            <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted">
              <li>About <span className="text-slate-200">1 in {Math.max(2, Math.round(1 / AC.entryProbability))}</span> people use permanent residential aged care at some point.</li>
              <li>Most enter around <span className="text-slate-200">age {AC.medianEntryAge}</span>, typically for <span className="text-slate-200">~{AC.medianDurationYears} years</span>.</li>
              <li>Clinical care (nursing, medical) is <span className="text-slate-200">fully government-funded</span> — you contribute to the rest, scaled by your means.</li>
            </ul>
          </div>
        </div>

        {/* Step 2 — the fees */}
        <div className="mt-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">2 · The annual fees</div>
          <div className="mt-2 rounded-xl border border-line bg-panel-2 p-3">
            {residential ? (
              <>
                <Row
                  label="Basic daily fee"
                  formula={`$${AC.basicDailyFee.toFixed(2)}/day × 365 (flat)`}
                  note={`$${AC.basicDailyFee.toFixed(2)} is the government basic daily fee — set at 85% of the single Age Pension. Everyone in residential care pays it, whatever their means.`}
                  value={fmtCurrency(Math.round(breakdown.agedCareBasic ?? 0))}
                />
                <Row
                  label="Hotelling"
                  formula={`$${AC.hotellingMaxDaily.toFixed(2)}/day × ${score.toFixed(2)} × 365`}
                  note={`$${AC.hotellingMaxDaily.toFixed(2)} is the government maximum daily hotelling charge (meals, cleaning, laundry, heating); you pay it in proportion to your means score (${score.toFixed(2)}). No cap.`}
                  value={fmtCurrency(Math.round(breakdown.agedCareHotelling ?? 0))}
                />
                <Row
                  label="Care (NCCC)"
                  formula={`$${AC.ncccMaxDaily.toFixed(2)}/day × ${score.toFixed(2)} × 365`}
                  note={`$${AC.ncccMaxDaily.toFixed(2)} is the government maximum daily non-clinical care charge, scaled by your means score and capped at ${fmtCurrency(AC.ncccLifetimeCap)} over ${AC.ncccMaxYears} years. Clinical care (nursing, medical) is free.`}
                  value={fmtCurrency(Math.round(breakdown.agedCareNCCC ?? 0))}
                />
                {(breakdown.agedCareDAP ?? 0) > 0 ? (
                  <Row
                    label="Accommodation (DAP)"
                    formula={`${fmtCurrency(Math.round((breakdown.agedCareDAP ?? 0) / AC.mpir))} unpaid room × MPIR ${pct(AC.mpir)}`}
                    note={isLump
                      ? `You chose a lump sum, but your savings couldn't cover all of the ${fmtCurrency(room)} room — the unpaid part is charged daily at the MPIR (${pct(AC.mpir)}).`
                      : `${fmtCurrency(room)} is the room price you set${ac.radAmount == null ? " (defaulting to the ~national average)" : ""}. The MPIR (${pct(AC.mpir)}) is the government rate that turns an unpaid room price into a daily payment — the cost of not paying a lump-sum RAD.`}
                    value={fmtCurrency(Math.round(breakdown.agedCareDAP ?? 0))}
                  />
                ) : (
                  <Row
                    label="Accommodation (RAD)"
                    formula={`${fmtCurrency(room)} lump sum — refundable, no daily charge`}
                    note={`${fmtCurrency(room)} is the room price you set${ac.radAmount == null ? " (defaulting to the ~national average)" : ""}. You chose to pay it as a refundable lump-sum RAD, so nothing is charged here each year.`}
                    value="$0"
                    muted
                  />
                )}
                {(breakdown.agedCareHomeRent ?? 0) > 0 && (
                  <Row
                    label="Less: rent from your home"
                    formula={`${fmtCurrency(Math.round(breakdown.homeValue))} × ${pct(AC.formerHomeRentYieldNet)} net`}
                    note={`You chose to rent the former home. ${pct(AC.formerHomeRentYieldNet)} is an assumed net rental yield; the rent both helps pay the fees and counts as assessable income.`}
                    value={`−${fmtCurrency(Math.round(breakdown.agedCareHomeRent ?? 0))}`}
                  />
                )}
              </>
            ) : (
              <Row
                label="Support at Home contribution"
                formula={`≈ ${fmtCurrency(AC.homeCareAnnualEstimate)}/yr (rough placeholder) × ${score.toFixed(2)} means score`}
                note={`Home care isn't modelled in detail yet — ${fmtCurrency(AC.homeCareAnnualEstimate)}/yr is a rough placeholder for a self-funded retiree's out-of-pocket, scaled by your means score (${score.toFixed(2)}). The real Support at Home cost varies widely by your assessed care level and service mix; clinical care is government-funded.`}
                value={fmtCurrency(Math.round(full))}
              />
            )}
            <div className="mt-1 flex items-center justify-between border-t border-line pt-2">
              <span className="text-sm font-semibold text-white">{residential ? "Cost if you need care" : "Total"}</span>
              <span className="tabular-nums font-bold text-rose-300">{fmtCurrency(Math.round(full))}/yr</span>
            </div>
          </div>
          {residential && (
            <p className="mt-1.5 text-[11px] text-muted">
              Accommodation follows your <span className="text-slate-300">{ACC_LABEL[ac.accommodation ?? "dap"]}</span> choice
              {isLump && (breakdown.agedCareDAP ?? 0) > 0
                ? " — your savings couldn't cover the full lump sum, so the unpaid part is charged daily (DAP)."
                : isLump
                  ? " — a lump-sum room is refundable, so there's no daily charge here."
                  : " — paid daily at the MPIR."}
            </p>
          )}

          {/* Home care has no accommodation/RAD, so fill the column with program context. */}
          {!residential && (
            <div className="mt-3 rounded-xl border border-line bg-panel-2/50 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <span aria-hidden>🏠</span> Support at Home in context
              </div>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted">
                <li>Support at Home replaced Home Care Packages in 2025 — care delivered while you stay in your own home.</li>
                <li><span className="text-slate-200">Clinical care</span> (nursing, physio, allied health) is fully government-funded — no contribution.</li>
                <li>You contribute to <span className="text-slate-200">everyday-living</span> services (cleaning, gardening, meals — the highest rate) and <span className="text-slate-200">independence</span> services (personal care, transport — a moderate rate), scaled by your means.</li>
                <li>A combined <span className="text-slate-200">lifetime cap</span> (~$135k across home and residential care) limits what you contribute.</li>
                <li>Because you stay home, you keep your <span className="text-slate-200">normal living costs</span> — the fees are on top, not instead.</li>
                <li className="text-muted/70">Our figure is a <span className="text-slate-300">rough placeholder</span> — home care isn&apos;t modelled in detail yet (a proper care-level model is planned).</li>
              </ul>
            </div>
          )}
        </div>

        {/* Step 3 — the lump sum owed to the provider */}
        {residential && (
          <div className="mt-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">3 · The lump sum (RAD) to pay the provider</div>
            <div className="mt-2 rounded-xl border border-line bg-panel-2 p-3 text-[11px] leading-relaxed text-muted">
              {chosenLump > 0 ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold text-slate-200">Refundable deposit (RAD)</span>
                    <span className="text-sm font-bold tabular-nums text-rose-200">{fmtCurrency(Math.round(chosenLump))}</span>
                  </div>
                  <p className="mt-1">
                    A one-off lump sum paid to the provider for the room —{" "}
                    {homeSale > 0
                      ? `funded here from the ${fmtCurrency(Math.round(homeSale))} home sale, `
                      : "drawn from your savings, "}
                    refundable to your estate and exempt from the Age Pension assets test.
                    {partialRad
                      ? ` Your savings covered ${fmtCurrency(Math.round(fundedLump))}; the remaining ${fmtCurrency(Math.round(chosenLump - fundedLump))} is paid daily (DAP), shown in the fees above.`
                      : ""}
                  </p>
                </>
              ) : (
                <p>
                  You chose to pay the room <span className="text-slate-200">daily (DAP)</span>, so there&apos;s no lump sum to
                  pay upfront — the accommodation cost is the DAP line in the fees above.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step 4 — what happens to living costs & the Age Pension */}
        <div className="mt-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">4 · Living costs &amp; the Age Pension</div>
          <div className="mt-2 rounded-xl border border-line bg-panel-2 p-3 text-[11px] leading-relaxed text-muted">
            {residential && livingSaved > 0 ? (
              <p>
                <span className="font-semibold text-slate-200">Living costs.</span> In residential care the fees cover housing,
                meals, cleaning and heating, so the model now funds only{" "}
                <span className="text-slate-200">{fmtCurrency(Math.round(livingNow))}/yr</span> of personal living costs (health,
                personal items, outings) — down from {fmtCurrency(Math.round(livingFull))}/yr, with the fees covering the
                ~{fmtCurrency(Math.round(livingSaved))} difference.
                {isCouple ? " Only the partner in care's share is replaced — the at-home partner keeps theirs:" : ""}
              </p>
            ) : (
              <p>
                <span className="font-semibold text-slate-200">Living costs.</span> At-home care keeps your normal living costs
                (~{fmtCurrency(Math.round(livingNow))}/yr) — you&apos;re still living at home.
              </p>
            )}
            {isCouple && residential && livingSaved > 0 && (
              <ul className="mt-1.5 space-y-1">
                <li className="flex items-baseline justify-between gap-3">
                  <span>• Partner in care <span className="text-muted/70">(personal expenses)</span></span>
                  <span className="tabular-nums text-slate-200">~{fmtCurrency(Math.round(careShare))}/yr</span>
                </li>
                <li className="flex items-baseline justify-between gap-3">
                  <span>• Partner at home <span className="text-muted/70">(full living costs)</span></span>
                  <span className="tabular-nums text-slate-200">~{fmtCurrency(Math.round(homeShare))}/yr</span>
                </li>
              </ul>
            )}
            <p className="mt-2">
              <span className="font-semibold text-slate-200">Age Pension.</span>{" "}
              {isCouple ? (
                <>
                  With one partner in residential care you become an <span className="text-slate-200">illness-separated couple</span> —
                  assessed on your combined assets, but each paid the higher <span className="text-slate-200">single</span> rate,
                  which usually increases your pension. The family home stays exempt while your partner lives there (a &ldquo;protected person&rdquo;).
                </>
              ) : homeAction === "sell" ? (
                <>
                  Selling the home makes the leftover proceeds assessable, but the RAD you pay is <span className="text-slate-200">exempt</span> from
                  the assets test — so your pension can actually rise as you draw down.
                </>
              ) : homeAction === "keep-rent" ? (
                <>
                  Your former home is exempt for 2 years, then assessed for the pension (you&apos;re treated as a non-homeowner);
                  the rent it earns is assessable income.
                </>
              ) : (
                <>
                  Your former home is exempt for 2 years, then assessed for the pension at its market value (you&apos;re treated as a
                  non-homeowner), which can reduce it.
                </>
              )}
              {entryPension > 0 ? ` This year the modelled Age Pension is ${fmtCurrency(Math.round(entryPension))}.` : ""}
            </p>
          </div>
        </div>

        </div>

        {/* Terminology */}
        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">Terminology</div>
          <dl className="mt-2 space-y-1.5 md:grid md:grid-cols-2 md:gap-2 md:space-y-0">
            {TERMS.filter((t) => residential || ["Means score", "NCCC"].includes(t.term) || t.term === "Basic daily fee").map((t) => (
              <div key={t.term} className="rounded-lg border border-line bg-panel-2 px-3 py-2">
                <dt className="text-xs font-semibold text-slate-200">{t.term}</dt>
                <dd className="text-[11px] leading-relaxed text-muted">{t.def}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-muted">
          Estimates only, from a 2026 vintage of indexed rates — they don&apos;t reflect a care assessment or your circumstances.
          General information, not advice. See{" "}
          <Link href="/learn/aged-care-costs" className="text-accent hover:underline" target="_blank">What aged care costs</Link> and{" "}
          <Link href="/learn/aged-care-funding" className="text-accent hover:underline" target="_blank">Paying for aged care</Link>.
        </p>

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accent-soft">Done</button>
        </div>
      </div>
    </div>
  );
}
