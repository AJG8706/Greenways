import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { kmlTextFromUpload, parseKml } from "@/lib/kml";

const lot4 = readFileSync(
  join(__dirname, "../../data/lot4_gaines_acres.kml"),
  "utf8",
);

describe("KML import (buyer-lot-map standard)", () => {
  it("parses the Lot 4 pilot file", () => {
    const parsed = parseKml(lot4);
    expect(parsed.name).toContain("Lot 4");
    expect(parsed.description).toContain("Jefferson");
    expect(parsed.ring).toHaveLength(5); // 4 corners + closing vertex
    expect(parsed.ring[0]).toEqual({ lat: 30.1737303, lng: -94.1956948 });
    expect(parsed.point).toEqual({ lat: 30.1730626, lng: -94.195866 });
  });

  it("rejects KML without a polygon", () => {
    expect(() =>
      parseKml(
        `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><Point><coordinates>-94,30,0</coordinates></Point></Placemark></Document></kml>`,
      ),
    ).toThrow(/polygon/i);
  });

  it("rejects malformed coordinates", () => {
    expect(() =>
      parseKml(
        `<?xml version="1.0"?><kml><Document><Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>foo,bar baz</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`,
      ),
    ).toThrow(/coordinate/i);
  });

  it("handles a Folder wrapper and multiple placemarks", () => {
    const parsed = parseKml(
      `<?xml version="1.0"?><kml><Folder><Placemark><name>pin</name><Point><coordinates>-94.1,30.1,0</coordinates></Point></Placemark><Placemark><name>lot</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-94,30,0 -94,30.001,0 -94.001,30.001,0 -94,30,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Folder></kml>`,
    );
    expect(parsed.name).toBe("lot");
    expect(parsed.ring).toHaveLength(4);
    expect(parsed.point).toEqual({ lat: 30.1, lng: -94.1 });
  });
});

describe("kmlTextFromUpload (KMZ support)", () => {
  it("passes plain KML text through untouched", () => {
    const xml = readFileSync(join(__dirname, "../../data/lot4_gaines_acres.kml"), "utf8");
    const out = kmlTextFromUpload(new TextEncoder().encode(xml), "lot4.kml");
    expect(parseKml(out).ring.length).toBeGreaterThan(3);
  });

  it("extracts doc.kml from a KMZ and parses identically", () => {
    const xml = readFileSync(join(__dirname, "../../data/lot4_gaines_acres.kml"), "utf8");
    const kmz = zipSync({ "doc.kml": new TextEncoder().encode(xml), "images/ignored.png": new Uint8Array([1]) });
    const out = kmlTextFromUpload(kmz, "lot4.kmz");
    expect(parseKml(out).ring).toEqual(parseKml(xml).ring);
  });

  it("rejects a KMZ with no KML inside", () => {
    const kmz = zipSync({ "readme.txt": new TextEncoder().encode("nope") });
    expect(() => kmlTextFromUpload(kmz, "broken.kmz")).toThrow(/no .kml/i);
  });
});
