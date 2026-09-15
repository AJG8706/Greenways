import { describe, expect, it } from "vitest";
import { bearingDeg, angularDelta } from "@/lib/geo/bearing";
import {
  areaAcres,
  defaultEntrance,
  edgeMidpoint,
  ensureClockwise,
  normalizeRing,
  orderCornersFromEntrance,
} from "@/lib/geo/corners";
import {
  closestEdgeIndex,
  isClockwise,
  pointInPolygon,
  signedDistanceToPolygon,
} from "@/lib/geo/polygon";
import { centroid, distanceFt, makeProjection } from "@/lib/geo/project";
import type { LatLng, PointFt } from "@/lib/geo/types";

// Lot 4, Gaines Acres — the CAD-verified pilot ring from data/lot4_gaines_acres.kml
// (KML order: NE → SE → SW → NW, closed).
const LOT4_RING: LatLng[] = [
  { lat: 30.1737303, lng: -94.1956948 }, // NE at the road
  { lat: 30.1722938, lng: -94.1956711 }, // SE rear
  { lat: 30.1722937, lng: -94.1960369 }, // SW rear
  { lat: 30.1739324, lng: -94.1960614 }, // NW at the road
  { lat: 30.1737303, lng: -94.1956948 }, // closing vertex
];

// Gate 1 entrance: midpoint of the Broussard Rd frontage (NW–NE edge).
const LOT4_ENTRANCE: LatLng = { lat: 30.1738314, lng: -94.1958781 };

const SQUARE: PointFt[] = [
  { x: 0, y: 0 },
  { x: 0, y: 100 },
  { x: 100, y: 100 },
  { x: 100, y: 0 },
];

describe("local-feet projection (HUD spec §2)", () => {
  const proj = makeProjection({ lat: 30.1730626, lng: -94.195866 });

  it("round-trips lat/lng through local feet", () => {
    for (const p of LOT4_RING) {
      const back = proj.fromLocal(proj.toLocal(p));
      expect(back.lat).toBeCloseTo(p.lat, 9);
      expect(back.lng).toBeCloseTo(p.lng, 9);
    }
  });

  it("uses the spec's scale constants", () => {
    // 1/1000 degree of latitude = 110574 m / 1000 * 3.28084 ft
    const north = proj.toLocal({ lat: 30.1740626, lng: -94.195866 });
    expect(north.y).toBeCloseTo(110.574 * 3.28084, 3);
    expect(north.x).toBeCloseTo(0, 9);
  });

  it("puts Lot 4 in a ~310 × ~540 ft envelope", () => {
    const local = LOT4_RING.slice(0, 4).map(proj.toLocal);
    const xs = local.map((p) => p.x);
    const ys = local.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(100);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(200);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(500);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(650);
  });
});

describe("bearing (HUD spec §2)", () => {
  const o: PointFt = { x: 0, y: 0 };

  it("is degrees clockwise from north", () => {
    expect(bearingDeg(o, { x: 0, y: 10 })).toBe(0);
    expect(bearingDeg(o, { x: 10, y: 0 })).toBe(90);
    expect(bearingDeg(o, { x: 0, y: -10 })).toBe(180);
    expect(bearingDeg(o, { x: -10, y: 0 })).toBe(270);
    expect(bearingDeg(o, { x: 10, y: 10 })).toBeCloseTo(45, 9);
  });

  it("angularDelta takes the short way around", () => {
    expect(angularDelta(350, 10)).toBe(20);
    expect(angularDelta(10, 350)).toBe(-20);
    expect(angularDelta(0, 180)).toBe(-180); // spec formula: 180° maps to −180 (same rotation)
  });
});

describe("point-in-polygon", () => {
  it("classifies inside/outside on a square", () => {
    expect(pointInPolygon({ x: 50, y: 50 }, SQUARE)).toBe(true);
    expect(pointInPolygon({ x: -1, y: 50 }, SQUARE)).toBe(false);
    expect(pointInPolygon({ x: 101, y: 50 }, SQUARE)).toBe(false);
    expect(pointInPolygon({ x: 50, y: 100.01 }, SQUARE)).toBe(false);
  });

  it("counts the boundary as inside", () => {
    expect(pointInPolygon({ x: 0, y: 50 }, SQUARE)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 0 }, SQUARE)).toBe(true);
  });
});

describe("signed distance to polygon (HUD spec §7)", () => {
  it("is positive inside, negative outside, zero on the line", () => {
    expect(signedDistanceToPolygon({ x: 50, y: 50 }, SQUARE)).toBe(50);
    expect(signedDistanceToPolygon({ x: 50, y: 90 }, SQUARE)).toBe(10);
    expect(signedDistanceToPolygon({ x: 50, y: 110 }, SQUARE)).toBe(-10);
    expect(signedDistanceToPolygon({ x: -30, y: 50 }, SQUARE)).toBe(-30);
    expect(signedDistanceToPolygon({ x: 0, y: 50 }, SQUARE)).toBe(0);
  });

  it("measures to the nearest corner outside a corner", () => {
    expect(signedDistanceToPolygon({ x: 103, y: 104 }, SQUARE)).toBeCloseTo(
      -5,
      9,
    );
  });
});

describe("ring normalization and orientation", () => {
  it("drops the closing vertex and consecutive duplicates", () => {
    const ring = normalizeRing(LOT4_RING);
    expect(ring).toHaveLength(4);
  });

  it("rejects degenerate rings", () => {
    expect(() =>
      normalizeRing([
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0 },
      ]),
    ).toThrow();
  });

  it("detects and enforces clockwise compass order", () => {
    const cw = ensureClockwise(normalizeRing(LOT4_RING));
    const proj = makeProjection(centroid(cw));
    expect(isClockwise(cw.map(proj.toLocal))).toBe(true);

    const reversed = ensureClockwise([...normalizeRing(LOT4_RING)].reverse());
    expect(isClockwise(reversed.map(proj.toLocal))).toBe(true);
  });
});

describe("corner numbering from the entrance (Gate 1 decision)", () => {
  it("numbers Lot 4 clockwise from the road: C1=NW, C2=NE, C3=SE, C4=SW", () => {
    const ordered = orderCornersFromEntrance(LOT4_RING, LOT4_ENTRANCE);
    expect(ordered[0]!.lat).toBeCloseTo(30.1739324, 6); // C1 NW
    expect(ordered[1]!.lat).toBeCloseTo(30.1737303, 6); // C2 NE
    expect(ordered[2]!.lat).toBeCloseTo(30.1722938, 6); // C3 SE
    expect(ordered[3]!.lat).toBeCloseTo(30.1722937, 6); // C4 SW
    expect(ordered[2]!.lng).toBeCloseTo(-94.1956711, 6);
    expect(ordered[3]!.lng).toBeCloseTo(-94.1960369, 6);
  });

  it("renumbers when the entrance moves to another edge", () => {
    // Entrance on the south (rear) edge → C1 becomes SE, then SW, NW, NE.
    const ordered = orderCornersFromEntrance(
      LOT4_RING,
      edgeMidpoint(
        [
          { lat: 30.1722938, lng: -94.1956711 },
          { lat: 30.1722937, lng: -94.1960369 },
        ],
        0,
      ),
    );
    expect(ordered[0]!.lat).toBeCloseTo(30.1722938, 6); // SE
    expect(ordered[1]!.lat).toBeCloseTo(30.1722937, 6); // SW
  });

  it("provides a default entrance that the admin can move", () => {
    const e = defaultEntrance(LOT4_RING);
    const proj = makeProjection(centroid(normalizeRing(LOT4_RING)));
    // Default entrance lies on the ring boundary (some edge midpoint).
    expect(
      Math.abs(signedDistanceToPolygon(proj.toLocal(e), normalizeRing(LOT4_RING).map(proj.toLocal))),
    ).toBeLessThan(0.001);
  });
});

describe("closest edge / distances", () => {
  it("finds the road edge for the Lot 4 entrance", () => {
    const cw = ensureClockwise(normalizeRing(LOT4_RING));
    const proj = makeProjection(centroid(cw));
    const idx = closestEdgeIndex(proj.toLocal(LOT4_ENTRANCE), cw.map(proj.toLocal));
    const a = cw[idx]!;
    const b = cw[(idx + 1) % cw.length]!;
    // The road edge joins the two northernmost corners.
    expect(Math.min(a.lat, b.lat)).toBeGreaterThan(30.1737);
  });

  it("distanceFt is Euclidean in the plane", () => {
    expect(distanceFt({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("area", () => {
  it("Lot 4 is ~1.49 acres (survey figure)", () => {
    expect(areaAcres(LOT4_RING)).toBeGreaterThan(1.35);
    expect(areaAcres(LOT4_RING)).toBeLessThan(1.6);
  });
});
