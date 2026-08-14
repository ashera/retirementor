# Aged Care Module — v1 Spec (consumer-facing)

**Status:** proposed · **Primary user:** consumer (v1) · **Moat context:** first leg of the AU structural-depth trio (aged care → super death-benefit tax → lifetime-annuity concession). See memory `project-structural-depth-moat`.

Aged care is currently an **explicit exclusion** in the app's disclosures (`app/compliance/page.tsx`, `components/Disclosures.tsx`). This module flips it into a modelled — but firmly general-information — late-life cost.

---

## 1. Goal & non-goals

**Goal.** Let a consumer see, inside their existing projection, what aged care *could* cost them, how they'd fund it (lump sum vs ongoing), and how it flows through their balance, income, "money lasts to", Age Pension, and bequest. Meaningfully more accurate than a flat expense, without building a full second means-test engine in v1.

**Non-goals (v1).**
- Not personal advice. No "sell the home / choose a RAD to maximise your pension" prompts (that is regulated aged-care advice).
- Not a to-the-dollar fee calculator. Provider prices, care assessments (AN-ACC), and personal circumstances vary — everything is a labelled estimate.
- Not the full statutory means test with every disclosed/undisclosed threshold. v1 uses a **banded approximation** driven by the assessable position the engine already computes.

---

## 2. Domain facts (AU, vintage **2026** — all config-driven, verify at build)

Residential care, entrants from **1 Nov 2025** (new Aged Care Act):

| Component | Amount (2026) | Means-tested? | Cap |
|---|---|---|---|
| Basic daily fee | **$65.55/day** (85% single pension) | No | — |
| Hotelling contribution (everyday living) | up to **$22.15/day** | Yes — max when assets ≳ **$290,453** | **No** annual/lifetime cap |
| Non-Clinical Care Contribution (NCCC) | up to **$107.32/day** | Yes | **$137,917** lifetime **or 4 years**, whichever first |
| Clinical care | fully government-funded | — | — |
| Accommodation | **RAD** (national avg **> $570k**) or **DAP** = RAD × **MPIR** ÷ 365 | (asset/income tested for support) | RAD retention up to **2%/yr for 5 yrs** (new) |

- **MPIR** (DAP interest rate): **7.96%** (Apr–Jun 2026 vintage).
- **Former home in the aged-care means test:** capped at **$214,884** (20 Mar 2026) unless a **protected person** (spouse / dependent child / long-term carer) still lives there → then exempt.
- **Combined lifetime contribution cap** (home care + residential): ≈ **$135,318** (indexed twice yearly). *(Sources report both this and the NCCC-specific $137,917 — config both, reconcile at build.)*

Home care → **Support at Home** (from 1 Jul 2025):
- Clinical care: **free**. Independence services: moderate means-tested contribution. Everyday-living services: highest contribution rate. Combined lifetime cap ≈ $135,318.
- From **1 Oct 2026**: government fully funds **personal care** (no out-of-pocket).

**Planning base rates** (for the probabilistic mode, config-driven): ~**1 in 3** enter permanent residential care; median entry age ≈ **84–85**; median length of stay ≈ **~2.5–3 years**. (Verify against AIHW GEN data at build.)

---

## 3. Scope

### In (v1)
- **One person** entering care (single, or one member of a couple with the partner as protected person). Both-partners-in-care → v2.
- Care type: **residential** (primary) and a **simplified home-care** option.
- Two framings: **Assume** (model a definite care phase) and **Probabilistic** (probability-weighted expected cost), user-toggleable.
- Cost model: basic daily fee + banded hotelling + banded NCCC (with its cap) + accommodation (**RAD / DAP / combo**).
- Funding: RAD from **home sale / super / outside / auto**; DAP from cashflow.
- Interactions: **former-home Age-Pension treatment change**, **RAD as refundable (preserved) estate value**, **protected-person exemption** for couples.
- Surfacing: chart overlay + a dedicated **Aged care** result card/modal + explainer + disclosures update.

### Out (→ v2/v3)
- Full statutory means test with exact hotelling/NCCC tapers and income+asset interaction.
- Both partners in care; couple RAD splitting nuances.
- AN-ACC care-level classification; provider price shopping.
- Home-care package levels/quarterly budgets in detail (v1 uses a single banded home-care contribution).
- Death-benefit tax + annuity concession (the other two moat legs — separate specs).

---

## 4. Data model

New optional field on the plan (backward-compatible; absent = today's behaviour):

```ts
// lib/au/types.ts
export interface AgedCarePlan {
  enabled: boolean;
  framing: "assume" | "probabilistic"; // probabilistic weights cost by entry probability
  careType: "residential" | "home";
  person?: number;                      // index; default oldest. Couples: the other is the protected person
  entryAge: number;                     // default from config median
  durationYears: number;                // default from config median
  // Residential accommodation:
  accommodation: "rad" | "dap" | "combo";
  radAmount?: number;                   // default = config national average
  radSharePct?: number;                 // combo: % paid as RAD, remainder as DAP
  radFundedFrom: "home" | "super" | "outside" | "auto";
  homeAction?: "sell" | "keep-rent" | "keep-vacant"; // residential only
}
// plan.agedCare?: AgedCarePlan
```

Config block (`lib/au/config.ts`, surfaced on `/admin/parameters`; `withDefaults` backfills):

```ts
agedCare: {
  vintage: "2026",
  basicDailyFee: 65.55,
  hotellingMaxDaily: 22.15,
  hotellingAssetThreshold: 290_453,      // assets at/above → max hotelling
  ncccMaxDaily: 107.32,
  ncccLifetimeCap: 137_917,
  ncccMaxYears: 4,
  mpir: 0.0796,
  homeValueCapMeansTest: 214_884,
  radRetentionPctPerYear: 0.02,
  radRetentionMaxYears: 5,
  radNationalAvg: 570_000,
  entryProbabilityByAge: { /* cumulative entry prob → residential */ },
  medianEntryAge: 85,
  medianDurationYears: 2.6,
  homeCare: { /* banded contribution rates by service tier */ },
}
```

---

## 5. Engine integration (`lib/au/simulate.ts`)

Aged care is a **late-life overlay** applied inside the retirement year loop. Sequence per year once `age >= entryAge` and within `durationYears`:

1. **At entry (one-off):**
   - If residential + `homeAction = "sell"`: realise the home, route proceeds to fund the RAD (rest to the outside pool; CGT — main residence is exempt, so no CGT). If `keep-rent`/`keep-vacant`: home stays, but its **Age-Pension** treatment flips (see 3 below).
   - Pay the **RAD** lump sum from `radFundedFrom` (auto order: home → outside → super). Record it as a **preserved refundable asset** (`radHeld`), *not* consumed — it returns to the estate at death (less retention). It is **exempt from the Age-Pension assets test** while held.
2. **Each care year (recurring cost):**
   - `basicDailyFee × 365` (flat).
   - **Hotelling**: banded — `assets ≥ hotellingAssetThreshold ? max : taper(assets)`. No cap.
   - **NCCC**: banded up to `ncccMaxDaily`, accumulate against `ncccLifetimeCap` / `ncccMaxYears`; **stop charging once capped**.
   - **DAP** (if accommodation includes it): `radUnpaid × mpir ÷ 365 × days` from cashflow.
   - Sum → an **aged-care expense** that raises the year's net draw (flows through chart/MC/stress/failsafe exactly like a spending increase).
3. **Age-Pension feedback:** switch the former home's assessment from entry age:
   - Single, `sell` → home gone (proceeds now assessable/RAD-exempt).
   - Single, `keep` → home becomes **assessable** for the Age Pension (capped at `homeValueCapMeansTest` for the aged-care test; for the *pension* it becomes assessable after the 2-year window / if rented). Rent (if `keep-rent`) adds assessable income.
   - Couple, partner stays → **protected person** → home stays exempt; household means test splits.
4. **Probabilistic framing:** multiply the year's aged-care net cost by the **conditional entry probability** for that age (so a plan isn't clobbered by a certain big cost). Assume framing uses probability = 1. RAD/home handling in probabilistic mode: scale the drawdown, keep the estate line consistent.

**Banded means-test approximation (v1).** Rather than the full statutory test, place the person on entry using the assessable **assets + income the engine already tracks** into `full / partial / minimal` contributor bands → sets the hotelling/NCCC levels. Documented as an approximation; v2 replaces it with the real taper.

**New breakdown fields** on `YearRow.breakdown` for the ledger/year modal: `agedCareBasic`, `agedCareHotelling`, `agedCareNCCC`, `agedCareDAP`, `agedCareTotal`, `radDrawn`, `radHeld`.

---

## 6. UI / UX

**Home = What-If board** (consistent with the Life Events precedent — it's exploratory + probabilistic, not a core wizard fact). An **"Aged care"** panel:
- Toggle on; choose **Assume vs "What if I need care?"** (probabilistic).
- Care type, entry age, duration (sensible defaults pre-filled from config).
- Accommodation: RAD / DAP / combo; RAD amount (default national avg); "fund from" selector.
- Home: sell / keep & rent / keep vacant (residential) — presented **neutrally**, each showing its modelled effect, no "recommended" flag.

**Result card / modal ("Your aged-care exposure"):**
- Estimated **annual cost** in care + total over the modelled stay.
- **RAD vs DAP** side-by-side (lump sum + refundable-to-estate vs ongoing daily from cashflow).
- Effect on **"money projected to last to"**, on the **Age Pension**, and on the **bequest/estate** (RAD refund preserved).
- Probabilistic view: "~X% modelled chance of entering residential care; if you do, here's the cost" — tie to the existing **mortality/survival overlay** (`components/SurvivalOverlay.tsx`) for an *expected* (probability-weighted) number alongside the *assumed* one.

**Chart:** a late-life aged-care cost band + an entry marker on the balance/income charts (reuse the Life Events lane solver so labels don't collide with Retire / Age Pension / Depletes).

---

## 7. Compliance (RG 276 / not-advice)

- Flip the disclosures: aged care moves from "not included" to "modelled as an estimate", with strong caveats — **excludes** care-needs assessment, provider price variation, personal circumstances; figures are **estimates, not guarantees**; **point to Services Australia / My Aged Care / a specialist** for actual assessment.
- **General information only:** show mechanisms and modelled exposure; **no** directive to sell the home or pick RAD/DAP to optimise the pension. The sell/keep and RAD/DAP options are presented as neutral scenarios the user drives, each with its modelled effect — the tool never recommends one.
- Route through the existing compliance-audit process before release; this is exactly the kind of outward-facing copy that wants AFS-licensee / compliance sign-off.

---

## 8. Oracle & tests

- **Independent oracle** in `lib/au/scenarios/reference.ts`: re-derive the aged-care annual cost + RAD/home/pension effect for a new persona ("Care-needing Carol", single, home-owner; and a couple variant with a protected person).
- **vitest** cases: basic fee flat; hotelling band at/below/above the asset threshold; **NCCC cap enforced** (stops at lifetime $ and at 4 years); DAP = RAD × MPIR/365; RAD-from-home vs from-outside drawdown paths; single keep-home → pension drops; couple protected-person → home stays exempt; probabilistic weighting = assumed × prob; RAD preserved in net worth/estate.
- **e2e**: toggle aged care in What-If → chart shows the late-life band, "lasts to" moves, card renders; scenario save/share round-trips `plan.agedCare`.
- Gates as usual: `tsc` + full vitest + `npm run build` + scenario e2e.

---

## 9. Build phases

1. **Types + config + engine core** — `AgedCarePlan`, `config.agedCare`, residential cost model (basic/hotelling/NCCC + caps), RAD/DAP, entry lump sum, breakdown fields, banded means approximation. Oracle + unit tests. *(No UI yet — validated by tests.)*
2. **Home + Age-Pension interaction + probabilistic framing** — home sell/keep/rent treatment, protected-person exemption, survival-weighted expected cost. Tests for pension feedback.
3. **UI** — What-If "Aged care" panel + result card/modal + chart band/marker; disclosures update; explainer; scenario save/share/compare wiring; e2e.

Rough size: bigger than a typical What-If lever, smaller than the CGT-regime overhaul — a **multi-day** build across the three phases.

---

## 10. Open decisions (need sign-off before Phase 1)

1. **Default framing** — probabilistic ("what if you need care", gentler) vs assume-a-care-phase. *Recommend: default probabilistic, offer the assume toggle.*
2. **Couples depth in v1** — one-enters-with-protected-partner (recommended) vs attempt both.
3. **Home decision exposure** — expose sell/keep-rent/keep-vacant as neutral scenarios (recommended) vs auto-pick a single treatment.
4. **Input location** — What-If board (recommended, matches Life Events) vs PlanWizard core fact.
5. **RAD treatment** — preserved refundable estate value, not consumed (recommended) — confirm.

---

## Sources (verify vintage at build)
- Dept. of Health/Ageing — residential care means-tested fees; Support at Home; My Aged Care means assessments.
- Adviser tech references (BT, Macquarie, CFS FirstTech) for RAD/DAP/MPIR and former-home cap.
- Figures as at 2026 vintage; MPIR, thresholds, and caps are indexed — pull the current values into config at build.
