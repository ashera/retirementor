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
  // A home downsize / sell-and-rent injects its freed equity into the engine's
  // START-of-year balance (so the balance chart's step lands on the event age). Left
  // as-is, that makes this waterfall's opening exceed last year's closing by the
  // release. Back it out so opening == prior year's closing and the release shows as
  // the `proceeds` inflow below (property SALES aren't in the opening — they're added
  // mid-year — so only the home release, `homeProceeds`, is netted here).
  const opening = b.openingSuper + b.openingOutside - b.homeProceeds;
  const closing = b.closingSuper + b.closingOutside;
  const net = closing - opening;
  const retired = row.phase !== "accumulation";

  const growth = b.superGrowth + b.outsideGrowth;
  // contribNet now includes any extra TTR salary sacrifice; the tax-free TTR pension
  // that holds take-home is drawn back out of super below (net effect: taxSaved−15%).
  const contributions = b.contribNet;

  // Net effect of income & spending on the portfolio. While working, salary is
  // spent on living (not tracked) and only explicit `savings` is added. In
  // retirement, external income (pension, rent, part-time work, a still-working
  // partner's take-home) funds spending; whatever's left is saved, and any
  // shortfall is drawn from super/outside. A minimum-drawdown surplus is drawn
  // from super but reinvested outside, so it nets out of this term.
  const external = retired ? b.agePension + b.rentIncome + b.workIncome + b.takeHome : 0;
  // A retirement life-event expense is funded through the normal drawdown, so it's
  // part of the spend the funding term reconciles. (In accumulation it's a direct
  // draw on savings, itemised as its own line below.)
  const spending = retired ? b.livingSpend + b.rentCost + b.mortgageCost + (b.eventExpense ?? 0) + (b.agedCareTotal ?? 0) : 0;
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
    // TTR pension drawn (tax-free) from super to hold take-home while sacrificing more.
    // A working-years outflow; in retirement it's inside the funding term above.
    { key: "ttrPension", label: "Tax-free TTR pension drawn", amount: retired ? 0 : -(b.ttrPension ?? 0) },
    { key: "savings", label: "Savings added", amount: b.savings },
    {
      key: "funding",
      label: fundingNet >= 0 ? "Income kept in savings" : "Spending drawn from savings",
      amount: fundingNet,
    },
    { key: "proceeds", label: "Home / property sale", amount: proceeds },
    { key: "eventIncome", label: "Windfall / inheritance", amount: b.eventIncome ?? 0 },
    // In retirement the expense is already inside the funding term above; in
    // accumulation it's a direct draw on savings, named here so nothing lands in "other".
    { key: "eventExpense", label: "One-off expense", amount: retired ? 0 : -(b.eventExpense ?? 0) },
    // Aged care: the home sold to fund the room (+) and the refundable RAD deposit
    // paid out of savings (−). Their sum is the net balance-sheet effect of entry;
    // the recurring care cost is funded through the drawdown (in the funding term).
    { key: "agedCareHomeSale", label: "Home sold for aged care", amount: b.agedCareHomeSale ?? 0 },
    { key: "agedCareRad", label: "Aged-care RAD deposit", amount: -(b.radDrawn ?? 0) },
    { key: "loan", label: "Home loan cleared from super", amount: -b.mortgageCleared },
    { key: "lumpSum", label: "Lump sum withdrawn from super", amount: -(b.lumpSum ?? 0) },
    { key: "outsideTax", label: "Tax on savings (dividends + realised gains)", amount: -b.outsideTax },
    { key: "rentSaved", label: "Net rent reinvested", amount: b.rentSaved ?? 0 },
    { key: "careerBreak", label: "Living costs during your career break", amount: -(b.careerBreakDraw ?? 0) },
  ];

  const lines = candidate.filter((l) => Math.abs(l.amount) > EPS);
  // Guarantee the waterfall ties: absorb any un-named remainder.
  const other = net - lines.reduce((s, l) => s + l.amount, 0);
  if (Math.abs(other) > EPS) lines.push({ key: "other", label: "Other adjustments", amount: other });

  return { opening, closing, net, lines };
}
