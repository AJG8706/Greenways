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

  return { polygons, point };
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
