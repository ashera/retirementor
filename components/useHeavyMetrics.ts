import { useEffect, useRef, useState } from "react";
import { runMonteCarlo } from "@/lib/au/montecarlo";
import { earliestRetirement } from "@/lib/au/goalseek";
import { metricsKey, getMetrics, setMetrics } from "@/lib/au/mcCache";
import type { RetirementPlan } from "@/lib/au/types";
import type { EngineConfig } from "@/lib/au/config";

type MC = ReturnType<typeof runMonteCarlo>;
type Earliest = ReturnType<typeof earliestRetirement>;

// Runs the dashboard's two heaviest computations — the confidence Monte Carlo and the
// earliest-retirement solver — OFF the main thread in a Web Worker, computed AFTER first
// paint. The page shell renders immediately; `pending` is true until the first result.
// The last result is kept while a new one computes (no flicker on a plan change). Falls
// back to a deferred main-thread compute where Worker isn't available.
export function useHeavyMetrics(
  plan: RetirementPlan,
  config: EngineConfig,
  enabled: boolean,
): { mc: MC | null; earliest: Earliest | null; pending: boolean } {
  const [mc, setMc] = useState<MC | null>(null);
  const [earliest, setEarliest] = useState<Earliest | null>(null);
  const [pending, setPending] = useState(true);
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    // These two metrics are deterministic in (plan, config), so if we've already computed
    // them for this exact model — this session or a prior one (localStorage) — reuse the
    // result instead of re-running ~1s of work on every load when nothing has changed.
    const key = metricsKey(plan, config);
    const cached = getMetrics(key);
    if (cached) {
      setMc(cached.mc as MC);
      setEarliest(cached.earliest as Earliest);
      setPending(false);
      return;
    }

    setPending(true);
    const id = ++reqId.current;

    if (!workerRef.current && typeof Worker !== "undefined") {
      try {
        workerRef.current = new Worker(new URL("../lib/au/perf.worker.ts", import.meta.url));
      } catch {
        workerRef.current = null;
      }
    }
    const w = workerRef.current;

    if (w) {
      const onMsg = (e: MessageEvent) => {
        if (e.data?.id !== id) return; // ignore stale results (a newer plan is in flight)
        if (e.data.mc) setMc(e.data.mc as MC);
        if (e.data.earliest) setEarliest(e.data.earliest as Earliest);
        if (e.data.mc && e.data.earliest) setMetrics(key, e.data.mc, e.data.earliest);
        setPending(false);
        w.removeEventListener("message", onMsg);
      };
      w.addEventListener("message", onMsg);
      w.postMessage({ id, plan, config });
      return () => w.removeEventListener("message", onMsg);
    }

    // No Worker (SSR / very old browser): still defer past first paint.
    const t = setTimeout(() => {
      if (id !== reqId.current) return;
      const freshMc = runMonteCarlo(plan, config);
      const freshEarliest = earliestRetirement(plan, config);
      setMc(freshMc);
      setEarliest(freshEarliest);
      setMetrics(key, freshMc, freshEarliest);
      setPending(false);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, config, enabled]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  return { mc, earliest, pending };
}
