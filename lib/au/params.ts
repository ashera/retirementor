// Descriptors that turn the nested EngineConfig into a flat, editable, auditable
// list of parameters for the admin backoffice. Each descriptor knows its label,
// category, unit, authoritative source, and how to read/write its value in the
// config object (by dot/index path).

import { DEFAULT_CONFIG, type EngineConfig } from "./config";
import { categoryMeta } from "./budget";

export type Unit = "percent" | "aud" | "age" | "ratio";

export interface ParamDescriptor {
  key: string;
  label: string;
  category: string;
  path: string; // e.g. "agePension.single.maxAnnual" or "minDrawdownBands.2.rate"
  unit: Unit;
  sourceKey: string; // references a first-class source (see lib/au/sources.ts)
}

const BUDGET_BREAKDOWN_CATEGORY = "ASFA budget breakdown";

/** One editable/verifiable param per category × tier × household. */
function budgetBreakdownDescriptors(): ParamDescriptor[] {
  const rows: ParamDescriptor[] = [];
  DEFAULT_CONFIG.asfa.breakdown.categories.forEach((c, i) => {
    const label = categoryMeta(c.key)?.label ?? c.key;
    const base = `asfa.breakdown.categories.${i}`;
    for (const tier of ["comfortable", "modest"] as const) {
      for (const hh of ["single", "couple"] as const) {
        rows.push({
          key: `asfa_bd_${c.key}_${tier}_${hh}`,
          label: `${label} — ${tier}, ${hh}`,
          category: BUDGET_BREAKDOWN_CATEGORY,
          path: `${base}.${tier}.${hh}`,
          unit: "aud",
          sourceKey: "asfa-standard",
        });
      }
    }
  });
  return rows;
}

export const PARAM_DESCRIPTORS: ParamDescriptor[] = [
  // Superannuation
  { key: "sg_rate", label: "Super Guarantee rate", category: "Superannuation", path: "sgRate", unit: "percent", sourceKey: "ato-rates" },
  { key: "concessional_cap", label: "Concessional cap", category: "Superannuation", path: "concessionalCap", unit: "aud", sourceKey: "ato-rates" },
  { key: "non_concessional_cap", label: "Non-concessional cap", category: "Superannuation", path: "nonConcessionalCap", unit: "aud", sourceKey: "ato-rates" },
  { key: "contributions_tax", label: "Contributions tax", category: "Superannuation", path: "contributionsTax", unit: "percent", sourceKey: "ms-tax" },
  { key: "super_earnings_tax_accum", label: "Earnings tax (accumulation)", category: "Superannuation", path: "superEarningsTaxAccumulation", unit: "percent", sourceKey: "ms-tax" },
  { key: "transfer_balance_cap", label: "Transfer balance cap", category: "Superannuation", path: "transferBalanceCap", unit: "aud", sourceKey: "ato-rates" },
  { key: "tsb_ncc_threshold", label: "TSB threshold (NCC nil)", category: "Superannuation", path: "totalSuperBalanceNccThreshold", unit: "aud", sourceKey: "ato-rates" },

  // Ages
  { key: "preservation_age", label: "Preservation age", category: "Ages", path: "preservationAge", unit: "age", sourceKey: "ms-preserve" },
  { key: "age_pension_age", label: "Age Pension age", category: "Ages", path: "agePensionAge", unit: "age", sourceKey: "sa-rates" },

  // Age Pension — rates
  { key: "ap_single_max", label: "Max pension — single", category: "Age Pension · rates", path: "agePension.single.maxAnnual", unit: "aud", sourceKey: "sa-rates" },
  { key: "ap_couple_max", label: "Max pension — couple (combined)", category: "Age Pension · rates", path: "agePension.couple.maxAnnual", unit: "aud", sourceKey: "sa-rates" },

  // Age Pension — income test
  { key: "ap_single_income_free", label: "Income free area — single", category: "Age Pension · income test", path: "agePension.single.incomeFreeAreaAnnual", unit: "aud", sourceKey: "sa-income" },
  { key: "ap_couple_income_free", label: "Income free area — couple", category: "Age Pension · income test", path: "agePension.couple.incomeFreeAreaAnnual", unit: "aud", sourceKey: "sa-income" },
  { key: "ap_income_taper", label: "Income taper (per $)", category: "Age Pension · income test", path: "agePension.incomeTaperPerDollar", unit: "ratio", sourceKey: "sa-income" },

  // Age Pension — assets test
  { key: "ap_single_assets_home", label: "Assets free — single homeowner", category: "Age Pension · assets test", path: "agePension.single.assetsFreeArea.homeowner", unit: "aud", sourceKey: "sa-assets" },
  { key: "ap_single_assets_nonhome", label: "Assets free — single renter", category: "Age Pension · assets test", path: "agePension.single.assetsFreeArea.nonHomeowner", unit: "aud", sourceKey: "sa-assets" },
  { key: "ap_couple_assets_home", label: "Assets free — couple homeowner", category: "Age Pension · assets test", path: "agePension.couple.assetsFreeArea.homeowner", unit: "aud", sourceKey: "sa-assets" },
  { key: "ap_couple_assets_nonhome", label: "Assets free — couple renter", category: "Age Pension · assets test", path: "agePension.couple.assetsFreeArea.nonHomeowner", unit: "aud", sourceKey: "sa-assets" },
  { key: "ap_assets_taper", label: "Assets taper (per $)", category: "Age Pension · assets test", path: "agePension.assetsTaperPerDollar", unit: "ratio", sourceKey: "sa-assets" },

  // Deeming
  { key: "deeming_lower", label: "Deeming rate (lower)", category: "Deeming", path: "deeming.lowerRate", unit: "percent", sourceKey: "sa-income" },
  { key: "deeming_upper", label: "Deeming rate (upper)", category: "Deeming", path: "deeming.upperRate", unit: "percent", sourceKey: "sa-income" },
  { key: "deeming_threshold_single", label: "Deeming threshold — single", category: "Deeming", path: "deeming.threshold.single", unit: "aud", sourceKey: "sa-income" },
  { key: "deeming_threshold_couple", label: "Deeming threshold — couple", category: "Deeming", path: "deeming.threshold.couple", unit: "aud", sourceKey: "sa-income" },

  // Minimum drawdown (age bands)
  { key: "min_drawdown_u65", label: "Min drawdown — under 65", category: "Minimum drawdown", path: "minDrawdownBands.0.rate", unit: "percent", sourceKey: "ato-rates" },
  { key: "min_drawdown_65", label: "Min drawdown — 65–74", category: "Minimum drawdown", path: "minDrawdownBands.1.rate", unit: "percent", sourceKey: "ato-rates" },
  { key: "min_drawdown_75", label: "Min drawdown — 75–79", category: "Minimum drawdown", path: "minDrawdownBands.2.rate", unit: "percent", sourceKey: "ato-rates" },
  { key: "min_drawdown_80", label: "Min drawdown — 80–84", category: "Minimum drawdown", path: "minDrawdownBands.3.rate", unit: "percent", sourceKey: "ato-rates" },
  { key: "min_drawdown_85", label: "Min drawdown — 85–89", category: "Minimum drawdown", path: "minDrawdownBands.4.rate", unit: "percent", sourceKey: "ato-rates" },
  { key: "min_drawdown_90", label: "Min drawdown — 90–94", category: "Minimum drawdown", path: "minDrawdownBands.5.rate", unit: "percent", sourceKey: "ato-rates" },
  { key: "min_drawdown_95", label: "Min drawdown — 95+", category: "Minimum drawdown", path: "minDrawdownBands.6.rate", unit: "percent", sourceKey: "ato-rates" },

  // ASFA benchmarks (reference only)
  { key: "asfa_comf_single", label: "Comfortable budget — single", category: "ASFA benchmarks", path: "asfa.comfortable.single", unit: "aud", sourceKey: "asfa-standard" },
  { key: "asfa_comf_couple", label: "Comfortable budget — couple", category: "ASFA benchmarks", path: "asfa.comfortable.couple", unit: "aud", sourceKey: "asfa-standard" },
  { key: "asfa_modest_single", label: "Modest budget — single", category: "ASFA benchmarks", path: "asfa.modest.single", unit: "aud", sourceKey: "asfa-standard" },
  { key: "asfa_modest_couple", label: "Modest budget — couple", category: "ASFA benchmarks", path: "asfa.modest.couple", unit: "aud", sourceKey: "asfa-standard" },
  { key: "asfa_ls_comf_single", label: "Lump sum (comfortable) — single", category: "ASFA benchmarks", path: "asfa.lumpSum.comfortable.single", unit: "aud", sourceKey: "asfa-standard" },
  { key: "asfa_ls_comf_couple", label: "Lump sum (comfortable) — couple", category: "ASFA benchmarks", path: "asfa.lumpSum.comfortable.couple", unit: "aud", sourceKey: "asfa-standard" },

  // ASFA per-category budget breakdown (pre-fills the guided budget builder) —
  // generated above from the config so paths/keys can't drift.
  ...budgetBreakdownDescriptors(),
];

export const PARAM_CATEGORIES: string[] = [
  "Superannuation",
  "Ages",
  "Age Pension · rates",
  "Age Pension · income test",
  "Age Pension · assets test",
  "Deeming",
  "Minimum drawdown",
  "ASFA benchmarks",
  "ASFA budget breakdown",
];

// --- Path-based read/write over the config object ---

type Json = Record<string, unknown> | unknown[];

export function getByPath(obj: unknown, path: string): number {
  let cur: unknown = obj;
  for (const seg of path.split(".")) {
    if (cur == null) return NaN;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "number" ? cur : NaN;
}

/** Immutably set a numeric value at a dot/index path, returning a new object. */
export function setByPath<T>(obj: T, path: string, value: number): T {
  const segs = path.split(".");
  const clone: Json = Array.isArray(obj)
    ? [...(obj as unknown[])]
    : { ...(obj as Record<string, unknown>) };
  let cur: Json = clone;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    const child = (cur as Record<string, unknown>)[seg];
    const childClone: Json = Array.isArray(child)
      ? [...(child as unknown[])]
      : { ...(child as Record<string, unknown>) };
    (cur as Record<string, unknown>)[seg] = childClone;
    cur = childClone;
  }
  (cur as Record<string, unknown>)[segs[segs.length - 1]] = value;
  return clone as T;
}

export interface ParamRow extends ParamDescriptor {
  value: number;
}

export function configToRows(config: EngineConfig): ParamRow[] {
  return PARAM_DESCRIPTORS.map((d) => ({ ...d, value: getByPath(config, d.path) }));
}
