import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
import type { LatLng } from "./geo/types";

export type ParsedKml = {
  name: string | null;
  description: string | null;
  /** Outer boundary of the first polygon, raw vertex order, closing vertex kept. */
  ring: LatLng[];
  /** First Point placemark, if any (reference pin — not assumed to be the entrance). */
  point: LatLng | null;
};

export type ParsedKmlPolygon = {
  /** Placemark name if the file carries one (subdivision exports often don't). */
  name: string | null;
  description: string | null;
  ring: LatLng[];
};

export type ParsedKmlMulti = {
  /** Every polygon in the file, in file order (surveyor exports run in plat order). */
  polygons: ParsedKmlPolygon[];
  point: LatLng | null;
};

/**
 * Parse a buyer-lot-map KML (the CAD-verified geometry standard). Only the
 * first Polygon placemark counts; anything else in the file is ignored.
 */
export function parseKml(xml: string): ParsedKml {
  const multi = parseKmlMulti(xml);
  const first = multi.polygons[0];
  if (!first) throw new Error("KML has no polygon boundary");
  return { name: first.name, description: first.description, ring: first.ring, point: multi.point };
}

/**
 * Parse every polygon in a KML — the master-tract case, where one surveyor
 * export carries a whole subdivision's lots. Folders recurse to any depth
 * (Google Earth Pro nests Shapes → <layer> → Placemark).
 */
export function parseKmlMulti(xml: string): ParsedKmlMulti {
  const parser = new XMLParser({
    ignoreAttributes: true,
    isArray: (tagName) => tagName === "Placemark" || tagName === "Folder",
  });
  const doc: unknown = parser.parse(xml);

  const kml = get(doc, "kml");
  const root = get(kml, "Document") ?? kml;
  const placemarks: unknown[] = [];
  collectPlacemarks(root, placemarks);
  if (placemarks.length === 0) throw new Error("KML has no Placemark");

  const polygons: ParsedKmlPolygon[] = [];
  let point: LatLng | null = null;

  for (const pm of placemarks) {
    const polyCoords = get(
      get(get(get(pm, "Polygon"), "outerBoundaryIs"), "LinearRing"),
      "coordinates",
    );
    if (typeof polyCoords === "string") {
      const ring = parseCoordinates(polyCoords);
      if (ring.length >= 4) {
        polygons.push({
          name: asString(get(pm, "name")),
          description: asString(get(pm, "description")),
          ring,
        });
      }
    }
    const pointCoords = get(get(pm, "Point"), "coordinates");
    if (point === null && typeof pointCoords === "string") {
      point = parseCoordinates(pointCoords)[0] ?? null;
    }
  }

  // Deed-plot exports (Land iD, deed-plotting CAD tools) carry no Polygon
  // at all: boundaries and lot lines are LineString segments, one per
  // survey call, with lots sharing edges. When a file has no polygons,
  // polygonize the line work — dangling leaders prune away, every enclosed
  // face becomes a lot, and the outer face (the whole tract) is dropped so
  // the result feeds the same single-vs-subdivision logic as polygons.
  if (polygons.length === 0) {
    const segments: LatLng[][] = [];
    collectLineSegments(root, segments);
    for (const ring of polygonizeSegments(segments)) {
      polygons.push({ name: null, description: null, ring });
    }
  }

  return { polygons, point };
}

function collectLineSegments(node: unknown, out: LatLng[][]): void {
  if (node === null || typeof node !== "object") return;
  const direct = get(node, "Placemark");
  for (const pm of Array.isArray(direct) ? direct : direct ? [direct] : []) {
    const coords = get(get(pm, "LineString"), "coordinates");
    if (typeof coords === "string") {
      const pts = parseCoordinates(coords);
      if (pts.length >= 2) out.push(pts);
    }
  }
  const folders = get(node, "Folder");
  for (const f of Array.isArray(folders) ? folders : folders ? [folders] : []) {
    collectLineSegments(f, out);
  }
}

/**
 * Planar face extraction over survey line work: build the segment graph,
 * prune dangling chains (label leaders, ties), then trace every face by
 * always taking the next edge clockwise. Interior faces are the lots; the
 * single largest face is the outside of the tract and is discarded. Each
 * returned ring carries its closing vertex, like a KML LinearRing.
 */
function polygonizeSegments(segments: LatLng[][]): LatLng[][] {
  const keyOf = (p: LatLng) => `${p.lat.toFixed(7)},${p.lng.toFixed(7)}`;
  const pts = new Map<string, LatLng>();
  const adj = new Map<string, Set<string>>();
  for (const seg of segments) {
    for (let i = 1; i < seg.length; i++) {
      const a = seg[i - 1]!;
      const b = seg[i]!;
      const ka = keyOf(a);
      const kb = keyOf(b);
      if (ka === kb) continue;
      pts.set(ka, a);
      pts.set(kb, b);
      if (!adj.has(ka)) adj.set(ka, new Set());
      if (!adj.has(kb)) adj.set(kb, new Set());
      adj.get(ka)!.add(kb);
      adj.get(kb)!.add(ka);
    }
  }

  // Dangling chains can't bound a face; prune until every node has 2+ edges.
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const [k, ns] of [...adj]) {
      if (ns.size <= 1) {
        for (const n of ns) adj.get(n)?.delete(k);
        adj.delete(k);
        pruned = true;
      }
    }
  }
  if (adj.size === 0) return [];

  const angle = (from: string, to: string): number => {
    const a = pts.get(from)!;
    const b = pts.get(to)!;
    const lat0 = (((a.lat + b.lat) / 2) * Math.PI) / 180;
    return Math.atan2(b.lat - a.lat, (b.lng - a.lng) * Math.cos(lat0));
  };
  const visited = new Set<string>();
  const faces: LatLng[][] = [];
  for (const [start, ns] of adj) {
    for (const first of ns) {
      if (visited.has(`${start}|${first}`)) continue;
      let a = start;
      let b = first;
      const cycle: string[] = [];
      let guard = adj.size * 8;
      let closed = false;
      while (guard-- > 0) {
        visited.add(`${a}|${b}`);
        cycle.push(a);
        const base = angle(b, a);
        let best: string | null = null;
        let bestDelta = Infinity;
        for (const n of adj.get(b)!) {
          let delta = base - angle(b, n);
          while (delta <= 1e-9) delta += 2 * Math.PI;
          if (delta < bestDelta) {
            bestDelta = delta;
            best = n;
          }
        }
        if (best === null) break;
        a = b;
        b = best;
        if (a === start && b === first) {
          closed = true;
          break;
        }
      }
      if (closed && cycle.length >= 3) faces.push(cycle.map((k) => pts.get(k)!));
    }
  }
  if (faces.length < 2) return [];

  // Shoelace on an equirectangular projection — plenty for "which face is
  // the outside" and "is this face degenerate" at parcel scale.
  const area = (ring: LatLng[]): number => {
    const lat0 = (ring[0]!.lat * Math.PI) / 180;
    let s = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      s += p.lng * Math.cos(lat0) * q.lat - q.lng * Math.cos(lat0) * p.lat;
    }
    return s / 2;
  };
  const measured = faces
    .map((ring) => ({ ring, size: Math.abs(area(ring)) }))
    .filter((f) => f.size > 1e-12)
    .sort((x, y) => y.size - x.size);
  return measured.slice(1).map((f) => [...f.ring, f.ring[0]!]);
}

/** KML coordinates: whitespace-separated `lng,lat[,alt]` tuples. */
function parseCoordinates(text: string): LatLng[] {
  return text
    .trim()
    .split(/\s+/)
    .map((tuple) => {
      const [lng, lat] = tuple.split(",").map(Number);
      if (
        lng === undefined ||
        lat === undefined ||
        Number.isNaN(lng) ||
        Number.isNaN(lat)
      ) {
        throw new Error(`Bad KML coordinate: "${tuple}"`);
      }
      return { lat, lng };
    });
}

function collectPlacemarks(node: unknown, out: unknown[]): void {
  if (node === null || typeof node !== "object") return;
  const direct = get(node, "Placemark");
  if (Array.isArray(direct)) out.push(...direct);
  else if (direct !== undefined && direct !== null) out.push(direct);
  const folders = get(node, "Folder");
  for (const f of Array.isArray(folders) ? folders : folders ? [folders] : []) {
    collectPlacemarks(f, out);
  }
}

function get(obj: unknown, key: string): unknown {
  if (obj === null || typeof obj !== "object") return undefined;
  return (obj as Record<string, unknown>)[key];
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Accept .kml and .kmz alike: a KMZ is a zip whose main document is a KML
 * (Google Earth saves `doc.kml` at the root). Returns the KML text either
 * way. The extracted size is capped independently of the upload cap so a
 * tiny zip can't expand into something enormous.
 */
export function kmlTextFromUpload(bytes: Uint8Array, filename: string): string {
  const isZip = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip && !/\.kmz$/i.test(filename)) {
    return new TextDecoder().decode(bytes);
  }
  const entries = unzipSync(bytes, {
    filter: (f) => /\.kml$/i.test(f.name) && f.originalSize <= 8 * 1024 * 1024,
  });
  const names = Object.keys(entries);
  if (names.length === 0) throw new Error("KMZ contains no .kml document");
  const main = names.find((n) => /^doc\.kml$/i.test(n)) ?? names.sort()[0]!;
  return new TextDecoder().decode(entries[main]!);
}
