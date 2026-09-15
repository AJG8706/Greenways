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

/**
 * Parse a buyer-lot-map KML (the CAD-verified geometry standard). Only the
 * first Polygon placemark counts; anything else in the file is ignored.
 */
export function parseKml(xml: string): ParsedKml {
  const parser = new XMLParser({
    ignoreAttributes: true,
    isArray: (tagName) => tagName === "Placemark",
  });
  const doc: unknown = parser.parse(xml);

  const kml = get(doc, "kml");
  const root = get(kml, "Document") ?? get(kml, "Folder") ?? kml;
  const placemarks = collectPlacemarks(root);
  if (placemarks.length === 0) throw new Error("KML has no Placemark");

  let ring: LatLng[] | null = null;
  let point: LatLng | null = null;
  let name: string | null = null;
  let description: string | null = null;

  for (const pm of placemarks) {
    const polyCoords = get(
      get(get(get(pm, "Polygon"), "outerBoundaryIs"), "LinearRing"),
      "coordinates",
    );
    if (ring === null && typeof polyCoords === "string") {
      ring = parseCoordinates(polyCoords);
      name = asString(get(pm, "name"));
      description = asString(get(pm, "description"));
    }
    const pointCoords = get(get(pm, "Point"), "coordinates");
    if (point === null && typeof pointCoords === "string") {
      point = parseCoordinates(pointCoords)[0] ?? null;
    }
  }

  if (ring === null || ring.length < 4) {
    throw new Error("KML has no polygon boundary");
  }
  return { name, description, ring, point };
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

function collectPlacemarks(node: unknown): unknown[] {
  const direct = get(node, "Placemark");
  if (Array.isArray(direct)) return direct;
  if (direct !== undefined && direct !== null) return [direct];
  return [];
}

function get(obj: unknown, key: string): unknown {
  if (obj === null || typeof obj !== "object") return undefined;
  return (obj as Record<string, unknown>)[key];
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
