// Waterfall decomposition of a single year's change in total savings
// (super + outside). Each line is a signed dollar amount, and the lines SUM
// EXACTLY to closing − opening — so the year-breakdown modal can show a
// reconciling "Opening → … → Closing" waterfall. A final "other" line absorbs
// any rare one-off the explicit terms don't name (e.g. property CGT timing), so
// the waterfall always ties out.

import type { YearRow } from "./types";

export interface FlowLine {
  key: string;
  label: string;
  amount: number; // signed; positive grows your savings, negative shrinks it
}

export interface YearFlow {
  opening: number;
  closing: number;
  net: number; // closing − opening
  lines: FlowLine[]; // nonzero drivers, in display order; sum === net
}

const EPS = 0.5;

export function yearFlow(row: YearRow): YearFlow {
  const b = row.breakdown;
  const opening = b.openingSuper + b.openingOutside;
  const closing = b.closingSuper + b.closingOutside;
  const net = closing - opening;
  const retired = row.phase !== "accumulation";

  const growth = b.superGrowth + b.outsideGrowth;
  const contributions = b.contribNet + b.ttrBenefit;

  // Net effect of income & spending on the portfolio. While working, salary is
  // spent on living (not tracked) and only explicit `savings` is added. In
  // retirement, external income (pension, rent, part-time work, a still-working
  // partner's take-home) funds spending; whatever's left is saved, and any
  // shortfall is drawn from super/outside. A minimum-drawdown surplus is drawn
  // from super but reinvested outside, so it nets out of this term.
  const external = retired ? b.agePension + b.rentIncome + b.workIncome + b.takeHome : 0;
  const spending = retired ? b.livingSpend + b.rentCost + b.mortgageCost : 0;
  const privateNeed = Math.max(0, spending - external);
  const superSurplus = Math.max(0, row.superDrawn - privateNeed); // min-drawdown reinvested
  const savedIncome = Math.max(0, external - spending);
  const fundingNet = retired
    ? savedIncome + superSurplus - row.superDrawn - row.outsideDrawn
    : 0;

  const proceeds = b.homeProceeds + b.propertyProceeds;

  const candidate: FlowLine[] = [
    { key: "growth", label: "Investment growth", amount: growth },
    { key: "fees", label: "Super fees", amount: -b.fees },
    { key: "contrib", label: "Super contributions", amount: contributions },
    { key: "savings", label: "Savings added", amount: b.savings },
    {
      key: "funding",
      label: fundingNet >= 0 ? "Income kept in savings" : "Spending drawn from savings",
      amount: fundingNet,
    },
    { key: "proceeds", label: "Home / property sale", amount: proceeds },
    { key: "loan", label: "Home loan cleared from super", amount: -b.mortgageCleared },
    { key: "lumpSum", label: "Lump sum withdrawn from super", amount: -(b.lumpSum ?? 0) },
    { key: "outsideTax", label: "Tax on savings (dividends + realised gains)", amount: -b.outsideTax },
    { key: "rentSaved", label: "Net rent reinvested", amount: b.rentSaved ?? 0 },
  ];

  const lines = candidate.filter((l) => Math.abs(l.amount) > EPS);
  // Guarantee the waterfall ties: absorb any un-named remainder.
  const other = net - lines.reduce((s, l) => s + l.amount, 0);
  if (Math.abs(other) > EPS) lines.push({ key: "other", label: "Other adjustments", amount: other });

  return { opening, closing, net, lines };
}
