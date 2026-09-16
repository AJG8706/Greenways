"use client";

import { useEffect, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { LatLng } from "@/lib/geo/types";
import type { CornerRow } from "./corners-editor";

/**
 * Google Maps satellite layer for the Corners tab. The key is a browser key —
 * restrict it by HTTP referrer in Google Cloud console. Requires the
 * "Maps JavaScript API" enabled on the key's project.
 */
export function GoogleMap({
  apiKey,
  corners,
  entrance,
  draggable,
  onCornerDragged,
  onMapClick,
}: {
  apiKey: string;
  corners: CornerRow[];
  entrance: LatLng | null;
  draggable: boolean;
  onCornerDragged: (cornerId: string, next: LatLng) => void;
  onMapClick: (p: LatLng) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const callbacksRef = useRef({ onCornerDragged, onMapClick });
  callbacksRef.current = { onCornerDragged, onMapClick };

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let map: google.maps.Map | null = null;
    let listeners: google.maps.MapsEventListener[] = [];
    let overlays: (google.maps.Marker | google.maps.Polygon)[] = [];

    setOptions({ key: apiKey, v: "weekly" });
    Promise.all([importLibrary("maps"), importLibrary("marker")])
      .then(async () => {
        if (cancelled || !containerRef.current) return;

        const bounds = new google.maps.LatLngBounds();
        corners.forEach((c) => bounds.extend({ lat: c.lat, lng: c.lng }));

        map = new google.maps.Map(containerRef.current, {
          mapTypeId: google.maps.MapTypeId.HYBRID,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
        });
        map.fitBounds(bounds, 48);

        // Lot line: Trailhead Green over a dark casing (HUD spec §10).
        const path = corners.map((c) => ({ lat: c.lat, lng: c.lng }));
        overlays.push(
          new google.maps.Polygon({
            map,
            paths: path,
            strokeColor: "#24301F",
            strokeWeight: 6,
            strokeOpacity: 0.9,
            fillColor: "#8DBA5E",
            fillOpacity: 0.12,
            clickable: false,
          }),
          new google.maps.Polygon({
            map,
            paths: path,
            strokeColor: "#8DBA5E",
            strokeWeight: 2.5,
            fillOpacity: 0,
            clickable: false,
          }),
        );

        corners.forEach((c) => {
          const marker = new google.maps.Marker({
            map,
            position: { lat: c.lat, lng: c.lng },
            draggable,
            label: {
              text: String(c.n),
              color: "#24301F",
              fontWeight: "700",
              fontSize: "13px",
            },
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 14,
              fillColor: "#BCAA6E",
              fillOpacity: 1,
              strokeColor: "#F5F3E9",
              strokeWeight: 2.5,
            },
          });
          listeners.push(
            marker.addListener("dragend", () => {
              const pos = marker.getPosition();
              if (pos) {
                callbacksRef.current.onCornerDragged(c.id, {
                  lat: pos.lat(),
                  lng: pos.lng(),
                });
              }
            }),
          );
          overlays.push(marker);
        });

        if (entrance) {
          overlays.push(
            new google.maps.Marker({
              map,
              position: entrance,
              icon: {
                path: "M -4 3 L 0 -4 L 4 3 Z",
                scale: 1.6,
                fillColor: "#48712F",
                fillOpacity: 1,
                strokeColor: "#F5F3E9",
                strokeWeight: 2,
              },
              clickable: false,
            }),
          );
        }

        listeners.push(
          map.addListener("click", (e: google.maps.MapMouseEvent) => {
            if (e.latLng) {
              callbacksRef.current.onMapClick({
                lat: e.latLng.lat(),
                lng: e.latLng.lng(),
              });
            }
          }),
        );
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Google Maps failed to load");
        }
      });

    return () => {
      cancelled = true;
      listeners.forEach((l) => l.remove());
      overlays.forEach((o) => o.setMap(null));
      listeners = [];
      overlays = [];
      map = null;
    };
  }, [apiKey, corners, entrance, draggable]);

  if (error) {
    return (
      <div
        className="grid place-items-center rounded-2 p-8 text-center"
        style={{ aspectRatio: "1", background: "var(--gw-pine-3)", color: "var(--gw-sage-mist)" }}
        data-testid="google-map-error"
      >
        Google Maps could not load: {error}. Check that the Maps JavaScript API is
        enabled for this key in Google Cloud console.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full rounded-2"
      style={{ aspectRatio: "1", background: "var(--gw-pine-3)" }}
      data-testid="google-map"
    />
  );
}
