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
    const mc = runMonteCarlo(plan, config);
    const earliest = earliestRetirement(plan, config);
    ctx.postMessage({ id, mc, earliest });
  } catch (err) {
    ctx.postMessage({ id, error: String(err) });
  }
};
