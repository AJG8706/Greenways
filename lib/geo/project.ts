import type { LatLng, PointFt } from "./types";

const FT_PER_M = 3.28084;
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LNG_EQUATOR = 111320;

export type Projection = {
  origin: LatLng;
  toLocal: (p: LatLng) => PointFt;
  fromLocal: (p: PointFt) => LatLng;
};

/**
 * Local tangent plane in feet at `origin` (HUD spec §2):
 *   x = (lng − lng0) · 111320 · cos(lat0) · 3.28084
 *   y = (lat − lat0) · 110574 · 3.28084
 * Flat-earth error over a 1,000 ft lot is well under 0.1 ft.
 */
export function makeProjection(origin: LatLng): Projection {
  const ftPerDegLng =
    M_PER_DEG_LNG_EQUATOR * Math.cos((origin.lat * Math.PI) / 180) * FT_PER_M;
  const ftPerDegLat = M_PER_DEG_LAT * FT_PER_M;

  return {
    origin,
    toLocal: (p) => ({
      x: (p.lng - origin.lng) * ftPerDegLng,
      y: (p.lat - origin.lat) * ftPerDegLat,
    }),
    fromLocal: (p) => ({
      lat: origin.lat + p.y / ftPerDegLat,
      lng: origin.lng + p.x / ftPerDegLng,
    }),
  };
}

/** Vertex-average centroid — the projection origin per the HUD spec. */
export function centroid(ring: LatLng[]): LatLng {
  if (ring.length === 0) throw new Error("centroid of empty ring");
  let lat = 0;
  let lng = 0;
  for (const p of ring) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / ring.length, lng: lng / ring.length };
}

export function distanceFt(a: PointFt, b: PointFt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
