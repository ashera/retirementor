// Withdrawal-rate diagnostic — how hard your retirement capital is working. The
// classic "4% rule" is a WHOLE-PORTFOLIO rule, so the headline we surface is the
// net call on all investable assets (super + outside savings), not just super.
// Measuring super alone understates the draw whenever a side pool of savings
// quietly funds part of the spend — and makes the rate appear to jump the moment
// that pool empties, even though nothing about sustainability changed (money just
// moved from one pocket to another). A read-out derived from the existing
// projection; it does not change the engine. The headline is the first year super
// is actually drawn (super is locked before preservation age, so an early
// retiree's rate only "starts" once it unlocks).

import type { SimResult, YearRow } from "./types";

export function rowWithdrawalRate(row: YearRow): number {
  return row.totalSuper > 0 ? row.superDrawn / row.totalSuper : 0;
}

/** The net call on the whole portfolio that year — spend after the Age Pension and
 *  net rent, i.e. what your own investable assets (super + outside) must fund. */
function rowNetSpend(row: YearRow): number {
  const b = row.breakdown;
  return Math.max(0, b.livingSpend + b.mortgageCost - b.agePension - Math.max(0, b.rentIncome));
}

/** Net spend ÷ (super + outside) — the whole-portfolio withdrawal rate, the true
 *  4%-rule analog. Smooth across the outside-savings runout (money shuffled from
 *  savings into super nets out), unlike the super-only rate. */
function rowPortfolioRate(row: YearRow): number {
  const portfolio = row.totalSuper + row.outside;
  return portfolio > 0 ? rowNetSpend(row) / portfolio : 0;
}

export interface InitialWithdrawal {
  // Whole-portfolio headline (the sustainability number the 4% band applies to):
  portfolioRate: number; // net spend ÷ (super + outside), fraction
  portfolio: number; // super + outside balance at the headline age
  netSpend: number; // spend the portfolio must fund (goal less Age Pension & rent)
  // Super-specific view (kept for the reconciliation & explainer):
  rate: number; // super-only rate: super drawn ÷ super balance, fraction
  age: number;
  drawn: number; // $ drawn from super that year
  balance: number; // start-of-year super balance
  // Funding context — why the super draw differs from the headline spend:
  spend: number; // total spending that year
  agePension: number; // Age Pension funding part of the spend
  rent: number; // net investment-property rent funding part (≥ 0)
  outsideDrawn: number; // drawn from outside-super savings
  minDriven: boolean; // true when the ATO minimum forces a draw above the spending need
  // When a MATERIAL outside-super buffer funds part of the early spend and then
  // runs dry mid-retirement, the age it empties and the (higher) whole-portfolio
  // rate by then — so we can name the climb instead of letting it look like a jump.
  bufferRunout: { age: number; rate: number } | null;
}

/** The first drawdown year's rate — the standard "initial withdrawal rate".
 *  We wait until the household is FULLY retired (no partner still earning a
 *  salary). During a staggered-retirement gap a working partner's pay funds most
 *  of the spend, so super barely moves — measuring there would understate the
 *  rate and leave the goal→super-draw reconciliation not adding up. `salaryIncome`
 *  on a retirement row is exactly that still-working partner's salary. */
export function initialWithdrawal(result: SimResult): InitialWithdrawal | null {
  const drawsFromSuper = (r: YearRow) =>
    r.phase !== "accumulation" && r.superDrawn > 0 && r.totalSuper > 0;
  const row =
    result.rows.find((r) => drawsFromSuper(r) && (r.salaryIncome ?? 0) <= 1) ??
    // Fallback (shouldn't happen): a plan that never reaches full retirement.
    result.rows.find(drawsFromSuper);
  if (!row) return null;
  const b = row.breakdown;
  const spend = b.livingSpend + b.mortgageCost;
  const agePension = b.agePension;
  const rent = Math.max(0, b.rentIncome);
  const need = Math.max(0, spend - agePension - rent); // the slice super must fund
  const portfolio = row.totalSuper + row.outside;

  return {
    portfolioRate: rowPortfolioRate(row),
    portfolio,
    netSpend: need,
    rate: rowWithdrawalRate(row),
    age: row.age,
    drawn: row.superDrawn,
    balance: row.totalSuper,
    spend,
    agePension,
    rent,
    outsideDrawn: row.outsideDrawn,
    minDriven: row.superDrawn > need + 1,
    bufferRunout: bufferRunout(result, row),
  };
}

/** Detect a material outside-super buffer that funds early spend and then empties
 *  mid-retirement. Returns the age it runs dry and the whole-portfolio rate by
 *  then (higher, because super now carries the full load) — but only when it's a
 *  genuine step worth naming: the buffer was material at the headline year, it
 *  empties before the final couple of years, and the rate has climbed noticeably. */
function bufferRunout(result: SimResult, headline: YearRow): { age: number; rate: number } | null {
  const startPortfolio = headline.totalSuper + headline.outside;
  const materialAtStart = headline.outside > Math.max(10_000, 0.05 * startPortfolio);
  if (!materialAtStart) return null;

  const retRows = result.rows.filter((r) => r.phase !== "accumulation");
  const lastAge = retRows.length ? retRows[retRows.length - 1].age : headline.age;
  // First retirement year at/after the headline where the buffer is essentially
  // gone (had savings before, ~$0 now) while spending continues.
  const runout = retRows.find(
    (r) => r.age > headline.age && r.age <= lastAge - 2 && r.outside < 1_000 && rowNetSpend(r) > 1,
  );
  if (!runout) return null;

  const rate = rowPortfolioRate(runout);
  // Only surface it if it's a meaningful climb above the headline (else the smooth
  // rise already tells the story and a callout would just be noise).
  if (rate <= rowPortfolioRate(headline) + 0.005) return null;
  return { age: runout.age, rate };
}

export type WithdrawalBand = { label: string; tone: "accent" | "amber" | "red" };

/** Rough guidance bands (the classic 4% anchor). The Age Pension backstop means
 *  higher rates can still last — the Monte-Carlo likelihood is the real test. */
export function withdrawalBand(rate: number): WithdrawalBand {
  if (rate <= 0.04) return { label: "conservative", tone: "accent" };
  if (rate <= 0.06) return { label: "moderate", tone: "amber" };
  return { label: "high", tone: "red" };
}
