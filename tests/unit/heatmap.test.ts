import { describe, expect, it } from "vitest";
import { aggregateHeatCells } from "@/lib/analytics/heatmap";

const RING = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe("aggregateHeatCells", () => {
  it("bins points into cells and tracks the max", () => {
    const h = aggregateHeatCells(
      [
        { x: 5, y: 5 },
        { x: 7, y: 9 },
        { x: 50, y: 50 },
      ],
      RING,
      15,
    );
    expect(h.cells).toHaveLength(2);
    expect(h.max).toBe(2);
    expect(h.cells.find((c) => c.col === 0 && c.row === 0)?.count).toBe(2);
    expect(h.minX).toBe(0);
    expect(h.maxX).toBe(100);
  });

  it("drops samples far outside the lot bounds", () => {
    const h = aggregateHeatCells([{ x: 5000, y: 5000 }], RING, 15);
    expect(h.cells).toHaveLength(0);
    expect(h.max).toBe(0);
    // Bounds stay the ring's — a bad fix never stretches the map.
    expect(h.maxX).toBe(100);
  });

  it("handles no data at all", () => {
    const h = aggregateHeatCells([], [], 15);
    expect(h.cells).toHaveLength(0);
    expect(h.max).toBe(0);
  });
});
