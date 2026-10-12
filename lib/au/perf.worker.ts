// Off-main-thread compute for the dashboard's heaviest metrics — the confidence Monte
// Carlo (~350ms) and the earliest-retirement solver (~700ms). Running these on the main
// thread during render blocks first paint (badly on iOS/Safari); here they run in a
// Web Worker so the page stays responsive. All imports are pure engine code (no DOM).
import type { RetirementPlan } from "./types";
import type { EngineConfig } from "./config";
import { runMonteCarlo } from "./montecarlo";
import { earliestRetirement } from "./goalseek";

interface Req {
  id: number;
  plan: RetirementPlan;
  config: EngineConfig;
}

// `self` typed loosely to avoid clashing with the app's DOM lib types at build time.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<Req>) => void) | null;
  postMessage: (m: unknown) => void;
};

ctx.onmessage = (e) => {
  const { id, plan, config } = e.data;
  try {
    // Post the Monte Carlo as soon as it's done so the confidence dial + fan chart paint
    // WITHOUT waiting on the earliest-retirement solver (a binary search that runs its own
    // Monte Carlo per candidate — roughly as costly again). On a slow device the solver was
    // adding seconds to the dial's refresh for a number the dial doesn't even use.
    const mc = runMonteCarlo(plan, config);
    ctx.postMessage({ id, mc });
    const earliest = earliestRetirement(plan, config);
    ctx.postMessage({ id, earliest });
  } catch (err) {
    ctx.postMessage({ id, error: String(err) });
  }
};
