// Withdrawal-rate diagnostic — the share of the super balance drawn each year
// (super drawn ÷ start-of-year super balance). A read-out derived from the
// existing projection; it does not change the engine. The headline is the first
// year super is actually drawn (super is locked before preservation age, so an
// early retiree's rate only "starts" once it unlocks).

import type { SimResult, YearRow } from "./types";

export function rowWithdrawalRate(row: YearRow): number {
  return row.totalSuper > 0 ? row.superDrawn / row.totalSuper : 0;
}

export interface InitialWithdrawal {
  rate: number; // fraction, e.g. 0.052
  age: number;
  drawn: number; // $ drawn from super that year
  balance: number; // start-of-year super balance
}

/** The first drawdown year's rate — the standard "initial withdrawal rate". */
export function initialWithdrawal(result: SimResult): InitialWithdrawal | null {
  const row = result.rows.find((r) => r.phase !== "accumulation" && r.superDrawn > 0 && r.totalSuper > 0);
  if (!row) return null;
  return { rate: rowWithdrawalRate(row), age: row.age, drawn: row.superDrawn, balance: row.totalSuper };
}

export type WithdrawalBand = { label: string; tone: "accent" | "amber" | "red" };

/** Rough guidance bands (the classic 4% anchor). The Age Pension backstop means
 *  higher rates can still last — the Monte-Carlo likelihood is the real test. */
export function withdrawalBand(rate: number): WithdrawalBand {
  if (rate <= 0.04) return { label: "conservative", tone: "accent" };
  if (rate <= 0.06) return { label: "moderate", tone: "amber" };
  return { label: "high", tone: "red" };
}
