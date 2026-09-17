import { edgeMidpoint } from "./corners";
import { makeProjection } from "./project";
import type { LatLng } from "./types";

/**
 * Synthetic square lots for GPS field testing.
 *
 * These are NOT parcel geometry. Guardrail #2 still holds for anything a buyer
 * sees: real corners come only from CAD-verified KML. A test lot exists so the
 * team can exercise the live-GPS walk anywhere — an office parking lot, a park
 * — without driving to a listed property, and the `test_lot` flag on the
 * property keeps it out of publish (DB trigger) and marks it in the console.
 */

/** Half-diagonal of the generated square, in feet. */
export const TEST_LOT_RADIUS_FT = 100;

/**
 * Four corners on a square whose vertices sit `radiusFt` from `center`, in
 * clockwise order starting at the north-west vertex: NW, NE, SE, SW.
 *
 * With the entrance at the midpoint of the north edge this satisfies the
 * corner-numbering rule (clockwise; C1 is the corner immediately before the
 * entrance, so C1 -> C2 crosses it) and mirrors the pilot property's
 * C1=NW C2=NE C3=SE C4=SW layout.
 */
export function testLotRing(center: LatLng, radiusFt = TEST_LOT_RADIUS_FT): LatLng[] {
  const proj = makeProjection(center);
  // Vertices at compass bearings 315, 45, 135, 225 -> a square with its sides
  // running true north/south and east/west, `radiusFt` from centre at each corner.
  const half = radiusFt / Math.SQRT2;
  return [
    proj.fromLocal({ x: -half, y: half }), // NW
    proj.fromLocal({ x: half, y: half }), // NE
    proj.fromLocal({ x: half, y: -half }), // SE
    proj.fromLocal({ x: -half, y: -half }), // SW
  ];
}

/** Entrance for a test lot: the midpoint of the north edge (NW -> NE). */
export function testLotEntrance(ring: LatLng[]): LatLng {
  return edgeMidpoint(ring, 0);
}

/** Marker written to `properties.geometry_source` for generated test lots. */
export const TEST_LOT_GEOMETRY_SOURCE =
  "Synthetic test square — generated for GPS field testing, NOT CAD-verified";
