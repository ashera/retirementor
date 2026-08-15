# Super Death‑Benefit Tax — v1 Spec (consumer-facing)

**Status:** proposed · **Primary user:** consumer (v1) · **Moat context:** leg 2 of the AU structural-depth trio (aged care ✓ → **super death-benefit tax** → lifetime-annuity concession). See memory `project-structural-depth-moat`.

Nothing in the app currently models super's taxable/tax-free component split, the death‑benefit tax, or an estate/bequest figure. This module adds all three — as general information — and turns the existing recontribution What‑If lever into a tangible "saves your heirs $X" story.

---

## 1. Goal & non-goals

**Goal.** Show a consumer, inside their projection, **what their beneficiaries actually inherit after the super death‑benefit tax**, and how much a **recontribution strategy** could reduce that tax. Introduce a first‑class **estate/bequest** number the app has never had.

**Non-goals (v1).**
- Not personal or estate‑planning advice. No "you should recontribute / cash out". The recontribution lever is a neutral, user‑driven scenario.
- Not a full estate model (no testamentary trusts, no binding‑nomination mechanics, no CGT on inherited non‑super assets).
- Not exact component accounting to the ATO's letter — v1 uses a defensible approximation of the taxable/tax-free split (see §6), documented.

---

## 2. Domain facts (AU, config-driven)

Every super balance splits into two **components**:
- **Tax‑free component** — from **non‑concessional** (after‑tax) contributions, the downsizer contribution, and certain amounts. Always tax‑free to any beneficiary.
- **Taxable component** — **concessional** contributions (SG + salary sacrifice) **plus all earnings**. Split into a *taxed element* (the norm) and an *untaxed element* (e.g. life insurance in super; some public‑sector funds).

**Death‑benefit tax** depends on **who receives it**:
| Beneficiary | Tax‑free comp | Taxable (taxed element) | Taxable (untaxed element) |
|---|---|---|---|
| **Tax dependant** (spouse/de facto, minor child, financial dependant) | 0% | **0%** | 0% |
| **Non‑dependant** (independent **adult child** — the common case) | 0% | **15% + Medicare ≈ 17%** | **30% + Medicare ≈ 32%** |

Key mechanics:
- A **spouse** is always a tax dependant → super rolls to them **tax‑free on the first death**. The tax bites on the **last‑survivor** death, when it passes to non‑dependant kids.
- In **accumulation**, the tax‑free component is a fixed dollar amount (cumulative NCCs); the taxable component grows with earnings.
- When an **account‑based pension** starts, the **tax‑free proportion is locked** at commencement and applies proportionally to every later withdrawal and to earnings.
- **Recontribution strategy** (60+, retired, under 75, within the NCC cap + total‑super‑balance limits): withdraw a lump sum (tax‑free to you), re‑contribute as non‑concessional → **converts taxable → tax‑free**.

*(Config-driven, verify at build: the 15% taxed‑element rate + Medicare, the 30% untaxed‑element rate, NCC cap + bring‑forward, TSB thresholds, preservation/age‑75 limits.)*

---

## 3. Scope

### In (v1)
- **Component tracking** through the whole projection: tax‑free vs taxable, per super pool, updated by contributions, earnings, withdrawals, recontribution, downsizer.
- A **beneficiary** input: who inherits your super — a **tax dependant** (spouse) or a **non‑dependant** (adult children).
- **Death‑benefit tax** computed on the taxable component remaining at the modelled **last‑survivor death** (life expectancy in v1).
- A first‑class **estate / bequest** figure: net wealth to beneficiaries = super (less death‑benefit tax) + outside savings + home equity + any refundable RAD.
- **Recontribution head‑to‑head**: extend the existing `plan.recontribute` lever to track the component conversion and show **"recontributing saves your beneficiaries ≈ $X in death‑benefit tax."**
- A `/learn` article + disclosures.

### Out (→ v2/v3)
- Survival‑weighted expected death‑tax (tie to the mortality overlay) — v1 applies it deterministically at the planning horizon.
- Full pension‑phase proportional‑lock accounting — v1 approximates (see §6).
- Untaxed‑element / insurance‑in‑super modelling (assume all taxable = taxed element in v1; config carries the 32% rate for later).
- Estate CGT on inherited non‑super assets; testamentary‑trust strategies; binding‑nomination edge cases.
- Couple first‑death rollover detail (v1 taxes only the last‑survivor event).

---

## 4. Data model

```ts
// lib/au/types.ts
// Who inherits your super — drives the death-benefit tax. Default "non-dependant"
// (adult children), the taxed and planning-relevant case.
superBeneficiary?: "dependant" | "non-dependant";   // on RetirementPlan
```

`plan.recontribute` already exists — no shape change; the engine just starts tracking its component effect.

Config additions (`config.superDeathBenefit`, surfaced on `/admin/parameters`; `withDefaults` backfills):
```ts
superDeathBenefit: {
  taxedElementRatePct: 15,     // + Medicare
  untaxedElementRatePct: 30,   // + Medicare (insurance / some public-sector)
  medicareLevyPct: 2,
}
```

New `YearBreakdown` fields (per year, for the ledger + estate view):
```ts
superTaxFree?: number;      // tax-free component of super this year
superTaxable?: number;      // taxable component
deathBenefitTax?: number;   // modelled tax if death occurred this year & beneficiary is non-dependant
estateValue?: number;       // net wealth to beneficiaries if death this year
```
Plus on `SimResult`: `estateAtHorizon`, `deathBenefitTaxAtHorizon`, `deathBenefitTaxSaved` (vs a no‑recontribution baseline).

---

## 5. Engine integration (`lib/au/simulate.ts`)

**Component tracking (the core new work).** Alongside each super pool, carry a running **`taxFree$`** (the taxable is `balance − taxFree$`):
- **Concessional** contributions (SG + salary sacrifice, net of 15%) → **taxable** (taxFree$ unchanged).
- **Non‑concessional** voluntary contributions, **recontribution**, **downsizer** → **taxFree$ +=**.
- **Earnings** → **taxable** (taxFree$ unchanged) — the accumulation rule.
- **Withdrawals** (drawdown, lump sum, min drawdown, RAD funding from super) → reduce **taxFree$ pro‑rata**: `taxFree$ -= withdrawal × taxFree$ / balance`.
- **Recontribution** already withdraws from savings and adds to super; now it also bumps `taxFree$` by the recontributed amount → the taxable→tax‑free conversion falls straight out.
- **v1 simplification** (documented): use the accumulation rule throughout (tax‑free = cumulative net NCCs, drawn down pro‑rata) rather than locking the pension‑phase proportion at commencement. The two diverge only modestly for typical drawdown paths; note it and refine in v2.

**Death‑benefit tax + estate (each year, and at the horizon).**
```
deathBenefitTax = beneficiary === "non-dependant" ? taxable$ × (taxedElementRate + medicare)/100 : 0
estateValue     = (superTaxFree + superTaxable − deathBenefitTax) + outside + homeEquity + radHeld
```
Report `estateAtHorizon` / `deathBenefitTaxAtHorizon` at the last‑survivor life expectancy. For the recontribution head‑to‑head, run the composed plan once **with** and once **without** `recontribute` and diff the death‑benefit tax (mirrors the aged‑care no‑care re‑sim).

**Couples (v1):** the tax applies on the **last‑survivor** death (spouse rollover is tax‑free), so compute it on the combined super at the household horizon with `superBeneficiary` = the ultimate (non‑dependant) beneficiary.

---

## 6. UI / UX

- **Estate/bequest surface.** Introduce an **"Estate — what you leave behind"** view: net wealth to beneficiaries, with the **super death‑benefit tax broken out** ("≈ $X of your super's taxable component would be taxed at ~17% before your kids receive it"). Natural homes: a card near the mortality overlay on the stress‑test page (death‑linked), and/or a line in the report. Reuses the estate math above.
- **Beneficiary input** in the plan wizard's Assumptions (or a small What‑If control): "Who inherits your super? — Spouse (tax‑free) / Adult children (taxed)."
- **Recontribution head‑to‑head.** On the existing recontribution What‑If card, add: **"Recontributing converts ~$X of taxable super to tax‑free — saving your beneficiaries ≈ $Y in death‑benefit tax."** Paired with its existing effect on the living plan, so it reads as a genuine trade‑off (money moved now vs tax saved later).
- **Workings explainer** (like the aged‑care one): the component split, the 15%+Medicare rate, and the recontribution conversion — with this plan's real numbers.

---

## 7. Compliance (RG 276 / not-advice)

- The **most advice‑adjacent** of the three legs. Frame strictly as **general information**: how the death‑benefit tax works and what a recontribution strategy *could* do — **no** "you should recontribute / cash out before death".
- Recontribution and cash‑out are presented as neutral scenarios the user drives, each showing its modelled effect; the tool never recommends one.
- Death‑benefit and estate planning are heavily personal (nominations, family circumstances, timing) — strong "estimate, not advice, see a licensed adviser" framing. Route through the compliance‑audit process before release. The full strategy value is where the **licensed adviser** is the intended user.

---

## 8. Oracle & tests

- **Independent oracle** in `lib/au/scenarios/reference.ts`: re‑derive the taxable/tax‑free split + death‑benefit tax for a persona ("Bequest Barbara": retires 67, adult‑children beneficiaries) and a recontribution variant.
- **vitest**: concessional → taxable, NCC/recontribution/downsizer → tax‑free; withdrawals draw components pro‑rata; death‑benefit tax = taxable × rate for a non‑dependant and 0 for a dependant; recontribution reduces the taxable component and the death‑benefit tax; estate = super−tax + outside + home + RAD; couples taxed at last‑survivor.
- **e2e**: toggle recontribution / beneficiary → estate + death‑tax numbers move; scenario save/share round‑trips `superBeneficiary`.
- Gates as usual: tsc + full vitest + build + scenario e2e.

---

## 9. Build phases

1. **Component tracking + config + types** — carry taxFree$/taxable$ through accumulation, pension, withdrawals, recontribution, downsizer; `superDeathBenefit` config; breakdown fields; oracle + unit tests. No UI.
2. **Death‑benefit tax + estate + beneficiary + recontribution head‑to‑head** — the tax at last‑survivor horizon, the estate figure, the no‑recontribution diff, the beneficiary input. Tests.
3. **UI** — the estate/bequest surface + death‑tax breakout, the recontribution "saves your heirs $X" line, the workings explainer, a `/learn` article, disclosures, e2e.

Rough size: the **component tracking (Phase 1) is the real lift** — it threads through every super inflow/outflow. Phases 2–3 are comparable to the aged‑care equivalents.

---

## 10. Open decisions (need sign-off before Phase 1)

1. **Beneficiary default** — **non‑dependant / adult children** (the taxed, planning‑relevant case), recommended, with a spouse (tax‑free) toggle.
2. **When the tax applies** — deterministically at **life expectancy / last‑survivor** (recommended v1) vs survival‑weighted via the mortality overlay (v2).
3. **Component fidelity** — the **accumulation‑rule approximation** (recommended v1) vs full pension‑phase proportional‑lock (v2).
4. **Estate surface location** — near the **mortality overlay** on the stress‑test page (recommended, death‑linked) vs a dashboard card vs report‑only.
5. **Untaxed element** — ignore in v1 (all taxable = taxed element), config‑carry the 32% rate for v2? (recommended).

---

## Sources (verify vintage at build)
- ATO — Super death benefits; taxation of the taxable/tax‑free components; components of a super interest.
- Adviser tech references (BT, Macquarie, CFS FirstTech) for the recontribution strategy, NCC caps + bring‑forward, and TSB limits.
- Rates/caps are indexed — pull current values into config at build.
