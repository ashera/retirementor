// Age Pension means testing. Services Australia applies BOTH an income test and an
// assets test, and pays the LOWER of the two results. All rates/thresholds come from
// the supplied EngineConfig (the active DB version), not hardcoded constants.

import type { EngineConfig } from "./config";
import type { Household } from "./types";

/** Income "deemed" to be earned by financial assets, regardless of actual returns. */
export function deemedIncome(
  financialAssets: number,
  household: Household,
  config: EngineConfig,
): number {
  const { lowerRate, upperRate, threshold } = config.deeming;
  const t = household === "single" ? threshold.single : threshold.couple;
  const lower = Math.min(financialAssets, t) * lowerRate;
  const upper = Math.max(0, financialAssets - t) * upperRate;
  return lower + upper;
}

export interface AgePensionInput {
  household: Household;
  homeowner: boolean;
  assessableAssets: number; // excludes the principal home
  financialAssets: number; // subset used for deeming (≈ assessableAssets here)
  otherIncome?: number; // non-deemed income (e.g. employment); usually 0 in retirement
}

export interface AgePensionResult {
  annual: number;
  bindingTest: "income" | "assets";
  incomeTestAnnual: number;
  assetsTestAnnual: number;
}

export function agePension(
  input: AgePensionInput,
  config: EngineConfig,
): AgePensionResult {
  const ap = config.agePension;
  const cfg = input.household === "single" ? ap.single : ap.couple;
  const maxAnnual = cfg.maxAnnual;

  // Income test
  const income =
    deemedIncome(input.financialAssets, input.household, config) +
    (input.otherIncome ?? 0);
  const incomeOver = Math.max(0, income - cfg.incomeFreeAreaAnnual);
  const incomeTestAnnual = Math.max(
    0,
    maxAnnual - incomeOver * ap.incomeTaperPerDollar,
  );

  // Assets test
  const freeArea = input.homeowner
    ? cfg.assetsFreeArea.homeowner
    : cfg.assetsFreeArea.nonHomeowner;
  const assetsOver = Math.max(0, input.assessableAssets - freeArea);
  const assetsTestAnnual = Math.max(
    0,
    maxAnnual - assetsOver * ap.assetsTaperPerDollar,
  );

  const annual = Math.min(incomeTestAnnual, assetsTestAnnual);
  return {
    annual,
    bindingTest: assetsTestAnnual <= incomeTestAnnual ? "assets" : "income",
    incomeTestAnnual,
    assetsTestAnnual,
  };
}
