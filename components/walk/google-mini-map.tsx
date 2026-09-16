"use client";

import { useEffect, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useTranslations } from "next-intl";
import type { LatLng } from "@/lib/geo/types";
import type { WalkCorner } from "@/lib/walk/types";

/**
 * Satellite mini-map for map mode (HUD spec §10) on the Google layer.
 * Framed on the buyer and the tracked corner, re-framed only when either
 * drifts within 12% of the edge. Falls back to the drawn map when offline
 * or the Maps JS API fails to load.
 */
export function GoogleMiniMap({
  apiKey,
  corners,
  buyer,
  trackedId,
  foundIds,
  distanceFt,
  fallback,
}: {
  apiKey: string;
  corners: WalkCorner[];
  buyer: LatLng | null;
  trackedId: string;
  foundIds: ReadonlySet<string>;
  distanceFt: number | null;
  fallback: React.ReactNode;
}) {
  const t = useTranslations();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const buyerMarkerRef = useRef<google.maps.Marker | null>(null);
  const guideRef = useRef<google.maps.Polyline | null>(null);
  const cornerMarkersRef = useRef<google.maps.Marker[]>([]);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  const offline = typeof navigator !== "undefined" && navigator.onLine === false;

  // Map + lot line once.
  useEffect(() => {
    if (offline || !containerRef.current) return;
    let cancelled = false;
    let overlays: (google.maps.Polygon | google.maps.Polyline | google.maps.Marker)[] = [];
    let map: google.maps.Map | null = null;

    setOptions({ key: apiKey, v: "weekly" });
    Promise.all([importLibrary("maps"), importLibrary("marker")])
      .then(() => {
        if (cancelled || !containerRef.current) return;
        map = new google.maps.Map(containerRef.current, {
          mapTypeId: google.maps.MapTypeId.HYBRID,
          disableDefaultUI: true,
          gestureHandling: "greedy",
          keyboardShortcuts: false,
        });
        mapRef.current = map;

        const path = corners.map((c) => ({ lat: c.lat, lng: c.lng }));
        overlays.push(
          new google.maps.Polygon({
            map,
            paths: path,
            strokeColor: "#24301F",
            strokeWeight: 6,
            strokeOpacity: 0.9,
            fillOpacity: 0,
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
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      overlays.forEach((o) => o.setMap(null));
      overlays = [];
      cornerMarkersRef.current.forEach((m) => m.setMap(null));
      cornerMarkersRef.current = [];
      buyerMarkerRef.current?.setMap(null);
      buyerMarkerRef.current = null;
      guideRef.current?.setMap(null);
      guideRef.current = null;
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once per key
  }, [apiKey, offline]);

  // Corner pins (screen-pixel sizing per §10) — few and rarely changing.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    cornerMarkersRef.current.forEach((m) => m.setMap(null));
    cornerMarkersRef.current = corners.map((c) => {
      const found = foundIds.has(c.id);
      const isTracked = c.id === trackedId;
      return new google.maps.Marker({
        map,
        position: { lat: c.lat, lng: c.lng },
        clickable: false,
        zIndex: isTracked ? 3 : 1,
        label: {
          text: found ? "✓" : String(c.n),
          color: "#24301F",
          fontWeight: "700",
          fontSize: "11px",
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: isTracked ? 14 : 10,
          fillColor: found || isTracked ? "#8DBA5E" : "#BCAA6E",
          fillOpacity: 1,
          strokeColor: "#F5F3E9",
          strokeWeight: isTracked ? 3 : 2,
        },
      });
    });
  }, [ready, corners, foundIds, trackedId]);

  // Buyer dot, dashed guide line, and lazy re-framing.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const tracked = corners.find((c) => c.id === trackedId);
    if (!tracked) return;
    const trackedPos = { lat: tracked.lat, lng: tracked.lng };

    if (buyer) {
      if (!buyerMarkerRef.current) {
        buyerMarkerRef.current = new google.maps.Marker({
          map,
          clickable: false,
          zIndex: 4,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#8DBA5E",
            fillOpacity: 1,
            strokeColor: "#F5F3E9",
            strokeWeight: 3,
          },
        });
      }
      buyerMarkerRef.current.setPosition(buyer);

      if (!guideRef.current) {
        guideRef.current = new google.maps.Polyline({
          map,
          clickable: false,
          strokeOpacity: 0,
          icons: [
            {
              icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: "#8DBA5E", strokeWeight: 2, scale: 3 },
              offset: "0",
              repeat: "12px",
            },
          ],
        });
      }
      guideRef.current.setPath([buyer, trackedPos]);
    }

    // Frame buyer + tracked; re-fit only when either nears the edge (12%).
    const focus = buyer ? [buyer, trackedPos] : [trackedPos];
    const bounds = map.getBounds();
    const needsFit =
      !bounds ||
      focus.some((p) => {
        const span = bounds.toSpan();
        const inner = new google.maps.LatLngBounds(
          {
            lat: bounds.getSouthWest().lat() + span.lat() * 0.12,
            lng: bounds.getSouthWest().lng() + span.lng() * 0.12,
          },
          {
            lat: bounds.getNorthEast().lat() - span.lat() * 0.12,
            lng: bounds.getNorthEast().lng() - span.lng() * 0.12,
          },
        );
        return !inner.contains(p);
      });
    if (needsFit) {
      const fit = new google.maps.LatLngBounds();
      focus.forEach((p) => fit.extend(p));
      map.fitBounds(fit, 56);
    }
  }, [ready, buyer, trackedId, corners]);

  if (offline || failed) return <>{fallback}</>;

  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: 340 }} data-testid="google-mini-map">
      <div
        ref={containerRef}
        className="w-full rounded-3"
        style={{ aspectRatio: "1", background: "var(--gw-pine-3)" }}
      />
      <span className="hud-chip absolute" style={{ left: 8, top: 8, minHeight: 28, background: "var(--gw-pine-2)" }}>
        N
      </span>
      <span className="hud-chip num absolute" style={{ right: 8, bottom: 8, background: "var(--gw-pine-2)" }}>
        {distanceFt ?? "—"} {t("common.ft")} {t("hud.away")}
      </span>
    </div>
  );
}
