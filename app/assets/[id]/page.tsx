import { notFound, redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveConfig } from "@/lib/refdata";
import { simulate } from "@/lib/au/simulate";
import { DEFAULT_PLAN, getIncomeStreams, getInvestmentProperties, type RetirementPlan } from "@/lib/au/types";
import { propertyValueAt } from "@/lib/au/property";
import { retirementYearIncome } from "@/lib/au/yearIncome";
import AssetsView, { type AgePoint } from "@/components/AssetsView";

export const metadata = { title: "Financial summary", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AssetsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const r = await query<{ name: string; data: RetirementPlan }>(
    "select name, data from plans where id = $1 and user_id = $2",
    [id, user.id],
  );
  const saved = r.rows[0];
  if (!saved) notFound();

  const plan = { ...DEFAULT_PLAN, ...saved.data };
  const config = await getActiveConfig();
  const result = simulate(plan, config);

  // Per-property value + loan at each age, so the balance sheet can show the property
  // as a gross asset with its loan as a separate liability. Mirrors the engine: value
  // grows at growthReal; the interest-only loan is the nominal balance deflated to
  // today's dollars; a "sell" property drops out once sold (proceeds go to savings).
  const oldestCur = Math.max(...plan.people.map((pp) => pp.currentAge));
  const invProps = getInvestmentProperties(plan);
  const planStreams = getIncomeStreams(plan);
  const numP = plan.people.length;
  const inflPow = (t: number) => Math.pow(1 + plan.inflation / 100, t);

  const points: AgePoint[] = result.rows.map((row) => {
    const t = row.age - oldestCur;
    const properties = invProps.map((pr) => {
      const sold = pr.strategy === "sell" && row.age >= pr.sellAtAge;
      return sold ? { value: 0, loan: 0 } : { value: propertyValueAt(pr, t), loan: pr.loanBalance / inflPow(t) };
    });
    const b = row.breakdown;
    const inc = retirementYearIncome(row);
    // Per-person split of the attributable income (take-home is per person; net rent
    // and Age Pension split equally; income streams follow their owner; part-time work
    // is the primary's). Pooled super/savings drawdowns stay household-level.
    const thp = b.takeHomePer ?? [];
    const netRentVal = (row.rentIncome ?? 0) - (b.rentTax ?? 0);
    const netStreamTot = row.incomeStream ?? 0;
    const grossPer = new Array(numP).fill(0);
    let grossTot = 0;
    for (const s of planStreams) {
      if (row.age < s.fromAge || row.age >= s.untilAge) continue;
      const real = s.indexed ? s.perYear : s.perYear / inflPow(t);
      grossTot += real;
      if (s.owner >= 0 && s.owner < numP) grossPer[s.owner] += real;
      else for (let k = 0; k < numP; k++) grossPer[k] += real / numP;
    }
    const perPerson = plan.people.map((_, i) => ({
      takeHome: thp[i] ?? 0,
      netRent: netRentVal / numP,
      partTime: i === 0 ? (row.workIncome ?? 0) : 0,
      incomeStream: grossTot > 0 ? netStreamTot * (grossPer[i] / grossTot) : netStreamTot / numP,
      pension: (row.agePension ?? 0) / numP,
    }));
    return {
      age: row.age,
      superTotal: row.totalSuper,
      savings: row.outside,
      homeValue: row.homeValue,
      homeEquity: row.homeEquity,
      propertyEquity: row.propertyEquity,
      drLoan: b.investmentLoan ?? 0,
      working: row.phase === "accumulation",
      // Freed equity routed to OUTSIDE super this year — from a home downsize and from a
      // property sale — so the savings row can name where a jump came from.
      homeToOutside: Math.max(0, (b.homeProceeds ?? 0) - (b.homeProceedsToSuper ?? 0)),
      propToOutside: b.propertyProceeds ?? 0,
      properties,
      // Cash flow this year.
      retired: row.phase !== "accumulation",
      pension: inc.pension,
      netRent: (row.rentIncome ?? 0) - (b.rentTax ?? 0),
      takeHome: b.takeHome ?? 0,
      partTimeWork: inc.partTimeWork,
      incomeStream: row.incomeStream ?? 0,
      fromSuper: inc.fromSuper,
      fromOutside: inc.fromOutside,
      living: b.livingSpend ?? 0,
      homeLoanCost: b.mortgageCost ?? 0,
      rentCost: b.rentCost ?? 0,
      oneOffExpense: b.eventExpense ?? 0,
      perPerson,
    };
  });

  return <AssetsView name={saved.name} plan={plan} points={points} />;
}
