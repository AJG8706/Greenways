"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LatLng } from "@/lib/geo/types";
import type { CornerRow } from "./corners-editor";

/**
 * MapLibre GL + Mapbox Satellite tiles (locked stack choice). Rendered only
 * when NEXT_PUBLIC_MAPBOX_TOKEN exists; the drawn fallback covers the rest.
 */
export function SatelliteMap({
  token,
  corners,
  entrance,
  draggable,
  onCornerDragged,
  onMapClick,
}: {
  token: string;
  corners: CornerRow[];
  entrance: LatLng | null;
  draggable: boolean;
  onCornerDragged: (cornerId: string, next: LatLng) => void;
  onMapClick: (p: LatLng) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const callbacksRef = useRef({ onCornerDragged, onMapClick });
  callbacksRef.current = { onCornerDragged, onMapClick };

  useEffect(() => {
    if (!containerRef.current) return;

    const ring = corners.map((c) => [c.lng, c.lat] as [number, number]);
    const bounds = ring.reduce(
      (b, p) => b.extend(p),
      new maplibregl.LngLatBounds(ring[0], ring[0]),
    );

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: "raster",
            tiles: [
              `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${token}`,
            ],
            tileSize: 512,
            attribution: "© Mapbox © Maxar",
          },
        },
        layers: [{ id: "satellite", type: "raster", source: "satellite" }],
      },
      bounds,
      fitBoundsOptions: { padding: 48 },
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("lot", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [[...ring, ring[0]!]] },
        },
      });
      // Trailhead Green over a dark casing so the line reads on canopy (HUD spec §10).
      map.addLayer({
        id: "lot-casing",
        type: "line",
        source: "lot",
        paint: { "line-color": "#24301F", "line-width": 6, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "lot-line",
        type: "line",
        source: "lot",
        paint: { "line-color": "#8DBA5E", "line-width": 2.5 },
      });
    });

    map.on("click", (e) => {
      callbacksRef.current.onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    markersRef.current = corners.map((c) => {
      const el = document.createElement("div");
      el.dataset.testid = `map-corner-${c.n}`;
      el.style.cssText =
        "width:28px;height:28px;border-radius:50%;background:#BCAA6E;border:2.5px solid #F5F3E9;display:grid;place-items:center;font:700 13px var(--gw-font-display);color:#24301F;cursor:" +
        (draggable ? "grab" : "default");
      el.textContent = String(c.n);
      const marker = new maplibregl.Marker({ element: el, draggable })
        .setLngLat([c.lng, c.lat])
        .addTo(map);
      marker.on("dragend", () => {
        const pos = marker.getLngLat();
        callbacksRef.current.onCornerDragged(c.id, { lat: pos.lat, lng: pos.lng });
      });
      return marker;
    });

    if (entrance) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:18px;height:18px;border-radius:4px;background:#F5F3E9;display:grid;place-items:center;";
      el.innerHTML =
        '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 9 L5 1 L9 9 Z" fill="#48712F"/></svg>';
      new maplibregl.Marker({ element: el }).setLngLat([entrance.lng, entrance.lat]).addTo(map);
    }

    return () => {
      markersRef.current.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
    // Rebuild the map when geometry or lock state changes.
  }, [token, corners, entrance, draggable]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-2"
      style={{ aspectRatio: "1", background: "var(--gw-pine-3)" }}
      data-testid="satellite-map"
    />
  );
}
