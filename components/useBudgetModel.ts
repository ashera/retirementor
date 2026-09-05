import { useEffect, useMemo, useState } from "react";
import { simulate } from "@/lib/au/simulate";
import { runMonteCarlo } from "@/lib/au/montecarlo";
import { maxSustainableSpend } from "@/lib/au/strategies";
import { budgetTotal, budgetSplit, budgetToStages, presetCategories } from "@/lib/au/budget";
import { budgetTier, sustainabilityVerdict, computeBadges, bertLine } from "@/lib/au/budgetQuest";
import type { EngineConfig } from "@/lib/au/config";
import type { RetirementPlan, RetirementBudget } from "@/lib/au/types";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * The single source of truth shared by the classic BudgetBuilder skin and the Budget
 * Quest play mode. Owns the category state and derives everything both skins render —
 * the total, the essential/discretionary split, the spending-smile stages, the lifestyle
 * tier, and the live sustainability signals from the real engine. The `budgetUpdate`
 * patch it emits is byte-identical to the one BudgetBuilder produces, so the two skins
 * can never disagree and either can drive the existing onApply/onProgress path.
 */
export function useBudgetModel(basePlan: RetirementPlan, config: EngineConfig) {
  const household = basePlan.household;
  const lifestyle = basePlan.budget?.lifestyle ?? "comfortable";
  const tenure = basePlan.budget?.tenure ?? (basePlan.homeowner ? "own" : "rent");

  const [categories, setCategories] = useState<Record<string, number>>(
    () => basePlan.budget?.categories ?? presetCategories(config, household, basePlan.homeowner, lifestyle),
  );

  const total = budgetTotal(categories);
  const split = budgetSplit(categories);
  const stages = useMemo(() => budgetToStages(config, categories), [config, categories]);
  const tierInfo = budgetTier(total, household, config);

  const budgetUpdate: Partial<RetirementPlan> = {
    targetSpending: total,
    spendingMode: "stages",
    spendingStages: stages,
    budget: { tenure, lifestyle, categories, applyPhases: true } as RetirementBudget,
  };

  const workingPlan = useMemo<RetirementPlan>(
    () => ({ ...basePlan, targetSpending: total, spendingMode: "stages", spendingStages: stages, budget: { tenure, lifestyle, categories, applyPhases: true } }),
    [basePlan, total, stages, tenure, lifestyle, categories],
  );

  // Live, cheap: the central deterministic run answers "does it last?" instantly.
  const sim = useMemo(() => simulate(workingPlan, config), [workingPlan, config]);
  const lastsToLE = sim.lastsToLifeExpectancy;
  const depletedAge = sim.depletedAge;

  // Heavy, debounced: Monte-Carlo confidence + the sustainable-spend headroom.
  const debounced = useDebounced(workingPlan, 350);
  const confidence = useMemo(
    () => runMonteCarlo(debounced, config, { iterations: 400, seed: 12345 }).successRate,
    [debounced, config],
  );
  const maxSpend = useMemo(() => maxSustainableSpend(debounced, config), [debounced, config]);
  const headroom = maxSpend - total;

  const verdict = sustainabilityVerdict(lastsToLE, confidence);
  const badges = computeBadges({ tierIndex: tierInfo.index, lastsToLE, confidence });
  const bert = bertLine({ status: verdict.status, tier: tierInfo.tier, headroom });

  const setCat = (key: string, annual: number) =>
    setCategories((prev) => ({ ...prev, [key]: Math.max(0, Math.round(annual)) }));

  return {
    categories, setCategories, setCat,
    total, split, stages, tierInfo,
    lastsToLE, depletedAge, confidence, maxSpend, headroom,
    verdict, badges, bert,
    budgetUpdate, workingPlan,
    household, lifestyle, tenure,
  };
}
