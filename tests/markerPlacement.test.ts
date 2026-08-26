import { describe, it, expect } from "vitest";
import { placeMarkers, clusterPins, type PinItem } from "../components/markerPlacement";

describe("placeMarkers (label lane solver)", () => {
  it("puts well-separated labels on a single row", () => {
    const { placed, rows } = placeMarkers([
      { key: "a", x: 60, color: "#000", name: "You retire" },
      { key: "b", x: 90, color: "#000", name: "Money runs out" },
    ]);
    expect(rows).toBe(1);
    expect(placed.every((p) => p.row === 0)).toBe(true);
  });

  it("steps overlapping labels down to separate rows", () => {
    const { placed, rows } = placeMarkers([
      { key: "you", x: 67, color: "#000", name: "You Age Pension" },
      { key: "ptnr", x: 68, color: "#000", name: "Partner Age Pension" },
    ]);
    expect(rows).toBe(2);
    expect(new Set(placed.map((p) => p.row)).size).toBe(2);
  });

  it("packs minimally — reuses row 0 when there's room", () => {
    const { placed } = placeMarkers([
      { key: "a", x: 60, color: "#000", name: "Aaa" },
      { key: "b", x: 82, color: "#000", name: "Bbb" }, // far from a → back to row 0
      { key: "c", x: 83, color: "#000", name: "Ccc" }, // overlaps b → row 1
    ]);
    const row = Object.fromEntries(placed.map((p) => [p.key, p.row]));
    expect(row.a).toBe(0);
    expect(row.b).toBe(0);
    expect(row.c).toBe(1);
  });

  it("is independent of input order (sorts by x)", () => {
    const a = placeMarkers([
      { key: "1", x: 62, color: "#000", name: "You retire" },
      { key: "2", x: 64, color: "#000", name: "Partner retires" },
    ]);
    const b = placeMarkers([
      { key: "2", x: 64, color: "#000", name: "Partner retires" },
      { key: "1", x: 62, color: "#000", name: "You retire" },
    ]);
    const rowOf = (r: typeof a, k: string) => r.placed.find((p) => p.key === k)!.row;
    expect(rowOf(a, "1")).toBe(rowOf(b, "1"));
    expect(rowOf(a, "2")).toBe(rowOf(b, "2"));
  });
});

describe("clusterPins (axis pin clustering)", () => {
  const pin = (key: string, age: number): PinItem => ({ key, age, icon: "•", label: key, color: "#000" });

  it("gives every cluster a finite pixel x", () => {
    const xOf = (age: number) => age * 10; // simple linear age→pixel
    const clusters = clusterPins([pin("a", 60), pin("b", 75)], xOf, 20);
    expect(clusters).toHaveLength(2);
    expect(clusters.every((c) => Number.isFinite(c.x))).toBe(true);
  });

  it("merges pins whose pixels fall within minPx", () => {
    const xOf = (age: number) => age * 10;
    const clusters = clusterPins([pin("a", 60), pin("b", 61)], xOf, 20); // 10px apart < 20
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toHaveLength(2);
  });

  // Regression: a categorical axis over fractional row ages (50.8, 51.8, …) returns
  // undefined for an integer pin age like 60. Such pins must be dropped, never emitted
  // with an undefined/NaN x (which crashed the chart via c.x.toFixed).
  it("skips pins whose age has no pixel on the axis (never yields a non-finite x)", () => {
    const rowAges = new Set([50.8, 51.8, 52.8, 60.8, 74.8, 75.8]);
    const scale = (age: number) => (rowAges.has(age) ? age * 10 : undefined);
    const xOf = (age: number) => scale(age) as number; // mimics the old direct-scale path
    const clusters = clusterPins([pin("in", 60.8), pin("off", 60)], xOf, 20);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members.map((m) => m.key)).toEqual(["in"]);
    expect(clusters.every((c) => Number.isFinite(c.x))).toBe(true);
  });
});
