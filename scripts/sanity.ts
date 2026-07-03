import { simulate } from "../lib/au/simulate";
import { agePension, deemedIncome } from "../lib/au/agePension";
import { DEFAULT_CONFIG } from "../lib/au/config";
import { DEFAULT_PLAN, DEFAULT_PARTNER, type RetirementPlan } from "../lib/au/types";

function fmt(n: number) {
  return "$" + Math.round(n).toLocaleString("en-AU");
}

console.log("=== Age Pension spot checks (single, homeowner) ===");
for (const assets of [200_000, 400_000, 700_000, 1_000_000]) {
  const ap = agePension(
    {
      household: "single",
      homeowner: true,
      assessableAssets: assets,
      financialAssets: assets,
    },
    DEFAULT_CONFIG,
  );
  console.log(
    `assets ${fmt(assets)} → pension ${fmt(ap.annual)}/yr (binding: ${ap.bindingTest}, deemed income ${fmt(deemedIncome(assets, "single", DEFAULT_CONFIG))})`,
  );
}

function report(label: string, plan: RetirementPlan) {
  const r = simulate(plan, DEFAULT_CONFIG);
  console.log(`\n=== ${label} ===`);
  console.log(`super at retirement (age ${r.retirementAge}): ${fmt(r.superAtRetirement)}`);
  console.log(`total investable at retirement: ${fmt(r.totalAtRetirement)}`);
  console.log(`first Age Pension at age: ${r.firstAgePensionAge ?? "never"}`);
  console.log(
    `lasts to life expectancy: ${r.lastsToLifeExpectancy}${r.depletedAge ? ` (depletes at ${r.depletedAge})` : ""}`,
  );
  // sample a few rows
  for (const age of [plan.retirementAge, 67, 75, 90]) {
    const row = r.rows.find((x) => x.age === age);
    if (row)
      console.log(
        `  age ${age} [${row.phase}] spend ${fmt(row.spending)} | total ${fmt(row.total)} | super ${fmt(row.totalSuper)} outside ${fmt(row.outside)} | pension ${fmt(row.agePension)} superDraw ${fmt(row.superDrawn)} outsideDraw ${fmt(row.outsideDrawn)} funded=${row.funded}`,
      );
  }
}

report("Single, retire at 60, $55k target", DEFAULT_PLAN);

report("Single, retire EARLY at 50 (bridge test)", {
  ...DEFAULT_PLAN,
  retirementAge: 50,
  outsideSuper: 400_000,
  annualOutsideSavings: 20_000,
});

report("Couple, retire at 60, $77k target", {
  ...DEFAULT_PLAN,
  household: "couple",
  people: [DEFAULT_PLAN.people[0], DEFAULT_PARTNER],
  targetSpending: 77_000,
  outsideSuper: 80_000,
});

report("Single, retire 60, STAGED (go-go 70k / slow-go 60k @75 / no-go 50k @85)", {
  ...DEFAULT_PLAN,
  retirementAge: 60,
  outsideSuper: 200_000,
  spendingMode: "stages",
  spendingStages: { goGo: 70_000, slowGo: 60_000, noGo: 50_000, slowGoAge: 75, noGoAge: 85 },
});
