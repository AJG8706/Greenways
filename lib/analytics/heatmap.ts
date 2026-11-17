// Walk-heatmap aggregation: position samples (local tangent feet, HUD spec
// §2) binned into square cells. Pure, so the page and tests share one truth.

export type HeatCell = { col: number; row: number; count: number };

export type Heatmap = {
  cells: HeatCell[];
  max: number;
  cellFt: number;
  /** Bounds in local feet (cells and ring both fit inside). */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export function aggregateHeatCells(
  points: readonly { x: number; y: number }[],
  ring: readonly { x: number; y: number }[],
  cellFt = 15,
): Heatmap {
  // Bounds come from the lot ring (the thing being walked), so a bad GPS
  // fix miles away can never stretch the map; ringless input falls back
  // to the samples themselves.
  const frame = ring.length >= 3 ? ring : points;
  if (frame.length === 0) {
    return { cells: [], max: 0, cellFt, minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  const minX = Math.min(...frame.map((p) => p.x));
  const minY = Math.min(...frame.map((p) => p.y));
  const maxX = Math.max(...frame.map((p) => p.x));
  const maxY = Math.max(...frame.map((p) => p.y));

  const counts = new Map<string, HeatCell>();
  for (const p of points) {
    // Samples far outside the lot (bad fixes, the drive in) stay off the
    // map; a walker a few steps over the line still shows.
    const margin = cellFt * 3;
    if (
      p.x < minX - margin ||
      p.x > maxX + margin ||
      p.y < minY - margin ||
      p.y > maxY + margin
    ) {
      continue;
    }
    const col = Math.floor((p.x - minX) / cellFt);
    const row = Math.floor((p.y - minY) / cellFt);
    const key = `${col}:${row}`;
    const cell = counts.get(key);
    if (cell) cell.count += 1;
    else counts.set(key, { col, row, count: 1 });
  }
  const cells = [...counts.values()];
  return {
    cells,
    max: cells.reduce((m, c) => Math.max(m, c.count), 0),
    cellFt,
    minX,
    minY,
    maxX,
    maxY,
  };
}
