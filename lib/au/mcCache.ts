import { APP_VERSION } from "@/lib/version";

// A tiny cache of the dashboard's two heavy metrics — the confidence Monte Carlo and the
// earliest-retirement solver — keyed by the exact (plan, config) they were computed from.
//
// Both are SEEDED and fully deterministic (mulberry32 with a fixed seed + a deterministic
// goal-seek), so for a given plan+config the result never changes: a cache hit is
// byte-identical to recomputing. This lets us skip the ~1s of work on every page load /
// SPA navigation when the model hasn't actually changed since we last ran it.
//
// Keyed by APP_VERSION as well, so any deploy — which is the only thing that can change
// the engine's output for the same inputs — drops the whole cache automatically. An
// in-memory Map is the fast path (survives SPA navigation); localStorage backs it so a
// full reload is a hit too. Capped small, so it stays tiny.

type Metrics = { mc: unknown; earliest: unknown };

const MEM = new Map<string, Metrics>();
const LS_KEY = "rw:mc-cache";
const MAX = 16; // a handful of recent scenarios — keeps localStorage well under a few KB

// djb2 (xor variant) — a cheap, stable string hash; the key only needs to be collision-
// resistant enough to tell distinct plans apart, not cryptographic.
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** A stable content key for a (plan, config) pair. Empty string → don't cache. */
export function metricsKey(plan: unknown, config: unknown): string {
  try {
    return hash(JSON.stringify({ plan, config }));
  } catch {
    return "";
  }
}

let hydrated = false;
function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { v?: string; e?: [string, Metrics][] };
    if (parsed.v !== APP_VERSION || !Array.isArray(parsed.e)) return; // stale build → ignore
    for (const [k, m] of parsed.e) MEM.set(k, m);
  } catch {
    /* corrupt entry → treat as empty */
  }
}

function persist(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ v: APP_VERSION, e: [...MEM.entries()].slice(-MAX) }));
  } catch {
    /* quota / disabled storage → in-memory only, no problem */
  }
}

/** The cached metrics for this key, or null on a miss. Touches the entry (approx-LRU). */
export function getMetrics(key: string): Metrics | null {
  if (!key) return null;
  hydrate();
  const hit = MEM.get(key);
  if (hit) {
    MEM.delete(key);
    MEM.set(key, hit); // move to newest so it survives eviction
  }
  return hit ?? null;
}

/** Store the metrics for this key, evicting the oldest beyond MAX. */
export function setMetrics(key: string, mc: unknown, earliest: unknown): void {
  if (!key) return;
  hydrate();
  MEM.set(key, { mc, earliest });
  while (MEM.size > MAX) {
    const oldest = MEM.keys().next().value;
    if (oldest === undefined) break;
    MEM.delete(oldest);
  }
  persist();
}
