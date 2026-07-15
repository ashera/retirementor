// Contiguous career-break ("gap year") spans, in chart-age terms, extracted from a
// simulation's rows. Charts overlay a shaded, labelled band over each span so a
// multi-year break reads as its true length — a plain gap in a stepped income band
// sits half a column off its ticks and can look a year short.

import type { YearRow } from "./types";

export interface BreakSpan {
  from: number; // first break age (inclusive)
  to: number; // last break age (inclusive)
}

export function breakSpans(rows: YearRow[]): BreakSpan[] {
  const spans: BreakSpan[] = [];
  let cur: BreakSpan | null = null;
  for (const r of rows) {
    if (r.breakdown?.onBreak) {
      if (cur && r.age === cur.to + 1) cur.to = r.age;
      else {
        cur = { from: r.age, to: r.age };
        spans.push(cur);
      }
    } else {
      cur = null;
    }
  }
  return spans;
}

/** Human label for a span, e.g. "Gap years 50–51" or "Gap year 50". */
export function breakSpanLabel(s: BreakSpan): string {
  return s.from === s.to ? `Gap year ${s.from}` : `Gap years ${s.from}–${s.to}`;
}
