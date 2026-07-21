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
