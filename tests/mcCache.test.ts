import { describe, it, expect } from "vitest";
import { metricsKey, getMetrics, setMetrics } from "../lib/au/mcCache";

// The cache is what lets the dashboard skip re-running the (deterministic) confidence
// Monte Carlo + earliest-retirement solver when the model hasn't changed since last load.
describe("mcCache — content-keyed reuse of the deterministic heavy metrics", () => {
  it("keys are stable for the same content and differ when the model changes", () => {
    const plan = { a: 1, nested: { x: [1, 2, 3] } };
    const config = { r: 0.05 };
    expect(metricsKey(plan, config)).toBe(metricsKey(plan, config)); // same content → same key
    expect(metricsKey(plan, config)).not.toBe(metricsKey({ ...plan, a: 2 }, config)); // plan changed
    expect(metricsKey(plan, config)).not.toBe(metricsKey(plan, { r: 0.06 })); // config changed
  });

  it("round-trips a stored result on a hit and misses on an unknown key", () => {
    const key = metricsKey({ id: "roundtrip" }, {});
    expect(getMetrics(key)).toBeNull(); // cold
    setMetrics(key, { successRate: 0.9 }, { age: 61 });
    expect(getMetrics(key)).toEqual({ mc: { successRate: 0.9 }, earliest: { age: 61 } });
    expect(getMetrics(metricsKey({ id: "never-stored" }, {}))).toBeNull();
  });

  it("evicts the oldest entries beyond the cap so it stays small", () => {
    // Write far more than the cap; the earliest writes should fall out.
    const first = metricsKey({ id: "evict-0" }, {});
    for (let i = 0; i < 40; i++) setMetrics(metricsKey({ id: `evict-${i}` }, {}), { i }, { i });
    const last = metricsKey({ id: "evict-39" }, {});
    expect(getMetrics(last)).not.toBeNull(); // most recent survives
    expect(getMetrics(first)).toBeNull(); // oldest evicted
  });

  it("does not cache when the content can't be serialised (empty key)", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(metricsKey(circular, {})).toBe(""); // JSON.stringify throws → empty key
    setMetrics("", { x: 1 }, { y: 2 }); // no-op
    expect(getMetrics("")).toBeNull();
  });
});
