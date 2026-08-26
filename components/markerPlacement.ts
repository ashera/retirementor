// Marker label placement solver (pure — no JSX, so it's unit-testable).
// Life-event labels overlap when their markers fall close together on the axis.
// Rather than a fixed stagger, pack labels into as few rows as possible: sweep
// left-to-right and drop each label into the lowest row whose previous label has
// already ended (its estimated right edge is left of this one's left edge). Labels
// far apart share row 0; only genuinely-overlapping ones step down a row.

export interface MarkerInput {
  key: string;
  x: number; // axis position (age)
  color: string;
  name: string;
  dash?: string;
}
export interface PlacedMarker extends MarkerInput {
  row: number;
}

// Estimated label half-width in AXIS (age) units. `charAges` ≈ years-per-character
// for the typical chart width (~700px over ~40yrs → ~0.34); a heuristic, since the
// true pixel width isn't known until Recharts lays the chart out.
export function placeMarkers(markers: MarkerInput[], charAges = 0.34): { placed: PlacedMarker[]; rows: number } {
  const halfW = (m: MarkerInput) => (m.name.length * charAges) / 2 + 0.4;
  const sorted = [...markers].sort((a, b) => a.x - b.x);
  const rowRight: number[] = []; // right edge (age) of the last label placed in each row
  const placed = sorted.map((m) => {
    const left = m.x - halfW(m);
    let row = 0;
    while (row < rowRight.length && rowRight[row] > left) row++;
    rowRight[row] = m.x + halfW(m);
    return { ...m, row };
  });
  return { placed, rows: rowRight.length };
}

// ── Axis pins ────────────────────────────────────────────────────────────────
// The bottom-axis "pin" markers (What-If strategy moments + life events) carry no
// in-plot text, so instead of stacking rows we CLUSTER any whose glyphs would touch
// into one chip (with a count). Clustering runs in PIXEL space — a min-gap in age
// units would over- or under-merge depending on the chart's width — so it takes the
// live age→pixel scale from the chart layout.
export interface PinItem {
  key: string;
  age: number;
  icon: string;
  label: string;
  detail?: string;
  color: string;
}
export interface PinCluster {
  x: number; // pixel x of the chip (the first member's position)
  members: PinItem[];
}

/** Group pins whose pixel positions fall within `minPx` of the previous chip, so no
 *  two chips ever visually overlap. The cluster renders at its first member's x. */
export function clusterPins(pins: PinItem[], xOf: (age: number) => number, minPx = 20): PinCluster[] {
  const sorted = [...pins].sort((a, b) => a.age - b.age);
  const clusters: PinCluster[] = [];
  for (const p of sorted) {
    const px = xOf(p.age);
    if (!Number.isFinite(px)) continue; // age with no pixel (off the axis' domain) → skip
    const last = clusters[clusters.length - 1];
    const lastPx = last ? xOf(last.members[last.members.length - 1].age) : -Infinity;
    if (last && px - lastPx < minPx) last.members.push(p);
    else clusters.push({ x: px, members: [p] });
  }
  return clusters;
}
