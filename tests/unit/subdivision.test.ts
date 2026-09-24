import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseKmlMulti } from "@/lib/kml";
import { pruneCollinear, splitSubdivision } from "@/lib/geo/subdivision";
import { normalizeRing } from "@/lib/geo/corners";

// The Warren master tract: one surveyor KML, ten lots, Google Earth Pro's
// two-deep Folder nesting (Document → Folder → Folder → Placemark).
const warren = readFileSync(join(__dirname, "../../data/warren_land_plan.kml"), "utf8");

describe("parseKmlMulti (master-tract KML)", () => {
  it("finds all ten lot polygons through nested folders", () => {
    const multi = parseKmlMulti(warren);
    expect(multi.polygons).toHaveLength(10);
    for (const p of multi.polygons) {
      expect(p.ring.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("keeps single-polygon parsing intact through folders", () => {
    const multi = parseKmlMulti(
      `<?xml version="1.0"?><kml><Document><Folder><Folder><Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>-94,30,0 -94,30.001,0 -94.001,30.001,0 -94,30,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Folder></Folder></Document></kml>`,
    );
    expect(multi.polygons).toHaveLength(1);
  });

  it("throws on a KML with no placemarks", () => {
    expect(() =>
      parseKmlMulti(`<?xml version="1.0"?><kml><Document><Folder/></Document></kml>`),
    ).toThrow(/placemark/i);
  });
});

describe("pruneCollinear", () => {
  it("drops a mid-edge phantom vertex, keeps real corners", () => {
    // Square ~660ft on a side with one extra vertex sitting on the south edge.
    const ring = [
      { lat: 30, lng: -94 },
      { lat: 30, lng: -94.001 }, // phantom: on the line between neighbors
      { lat: 30, lng: -94.002 },
      { lat: 30.0018, lng: -94.002 },
      { lat: 30.0018, lng: -94 },
    ];
    expect(pruneCollinear(ring)).toHaveLength(4);
  });

  it("never prunes below a triangle", () => {
    const tri = [
      { lat: 30, lng: -94 },
      { lat: 30.001, lng: -94 },
      { lat: 30, lng: -94.001 },
    ];
    expect(pruneCollinear(tri)).toHaveLength(3);
  });
});

describe("splitSubdivision (Warren measured facts)", () => {
  const lots = splitSubdivision(parseKmlMulti(warren).polygons);

  it("splits into ten lots in file (plat) order", () => {
    expect(lots).toHaveLength(10);
    expect(lots.map((l) => l.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("matches the surveyed acreage per lot", () => {
    for (const lot of lots.slice(0, 9)) {
      expect(lot.acres).toBeCloseTo(4.98, 1);
    }
    expect(lots[9]!.acres).toBeCloseTo(7.82, 1);
    const total = lots.reduce((s, l) => s + l.acres, 0);
    expect(total).toBeCloseTo(52.67, 1);
  });

  it("prunes phantom shared-edge vertices down to walkable corners", () => {
    // Every Warren lot is a quadrilateral once phantoms drop.
    expect(lots.map((l) => l.ring.length)).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
  });

  it("prunes phantoms before near-corner vertices (order hazard)", () => {
    // Lot 9 has a real corner sitting 6.9 ft off the line PLUS a phantom
    // 0.0 ft off right beside it. Pruning the near-corner vertex first would
    // cut an 0.08-acre sliver; the triangle-area guard makes the phantom go
    // first, after which the real corner measures ~203 ft of deviation.
    expect(lots[8]!.acres).toBeCloseTo(4.98, 1);
  });

  it("reports how many vertices were pruned per lot", () => {
    for (const lot of lots) {
      const raw = normalizeRing(parseKmlMulti(warren).polygons[lot.n - 1]!.ring);
      expect(lot.prunedVertices).toBe(raw.length - lot.ring.length);
      expect(lot.prunedVertices).toBeGreaterThanOrEqual(0);
    }
  });
});
