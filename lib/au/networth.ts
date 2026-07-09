import type { YearRow } from "./types";

/**
 * Total net worth for a year as the What-If "Net worth" view plots it:
 * liquid super + outside savings, plus illiquid home equity and investment-
 * property equity. In a property's sale year the proceeds only reach the outside
 * OPENING balance the following year, so we add that year's `propertyProceeds` to
 * bridge the gap (matching the chart's property band). Shared by the headline
 * card, its sparkline and the chart's total + baseline ghost so they can't drift.
 */
export function rowNetWorth(r: YearRow): number {
  const home = Math.max(0, r.homeEquity ?? 0);
  const property = Math.max(0, (r.propertyEquity ?? 0) + (r.breakdown?.propertyProceeds ?? 0));
  return r.totalSuper + r.outside + home + property;
}
