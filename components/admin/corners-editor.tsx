"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Crosshair, LocateFixed, Lock, LockOpen, Upload } from "lucide-react";
import {
  importKml,
  lockCorners,
  moveCorner,
  moveEntrance,
  placeTestLot,
  unlockCorners,
} from "@/app/admin/(console)/properties/actions";
import { Button } from "@/components/ui/button";
import { closestPointOnPolygon } from "@/lib/geo/polygon";
import { centroid, makeProjection } from "@/lib/geo/project";
import type { LatLng } from "@/lib/geo/types";
import { DrawnMap } from "./drawn-map";
import { GoogleMap } from "./google-map";
import { SatelliteMap } from "./satellite-map";

export type CornerRow = {
  id: string;
  n: number;
  lat: number;
  lng: number;
  name: { en: string; es: string };
  stake: { en: string; es: string };
  approachPhoto: string | null;
  stakePhoto: string | null;
  locked: boolean;
};

export type CornersLabels = {
  title: string;
  importKml: string;
  source: string;
  verified: string;
  locked: string;
  lock: string;
  lockHint: string;
  unlock: string;
  order: string;
  entrance: string;
  stakeDesc: string;
  corner: string;
  lat: string;
  lng: string;
  stake: string;
  photos: string;
  mapSource: string;
  mapDrawn: string;
  mapSatellite: string;
  mapGoogle: string;
  testLot: string;
  placeTestSquare: string;
  placeTestSquarePrompt: string;
  testLotNote: string;
  useMyLocation: string;
  locating: string;
  noGeolocation: string;
  setFromGps: string;
  gpsCaptured: string;
};

/**
 * Map background providers. 'google' is prepared as a first-class option —
 * it renders once NEXT_PUBLIC_GOOGLE_MAPS_KEY exists and the layer ships
 * (kickoff §4 decision); 'drawn' is always available as the fallback.
 */
export type MapProvider = "drawn" | "mapbox" | "google";
const MAP_PROVIDER_KEY = "gw-map-provider";

export function CornersEditor({
  propertyId,
  corners,
  entrance,
  geometrySource,
  isAdmin,
  isTestLot,
  lastLockEvent,
  labels,
  mapboxToken,
  googleKey,
}: {
  propertyId: string;
  corners: CornerRow[];
  entrance: LatLng | null;
  geometrySource: string | null;
  isAdmin: boolean;
  /** Generated square for GPS field testing rather than CAD-verified geometry. */
  isTestLot: boolean;
  lastLockEvent: { action: string; at: string } | null;
  labels: CornersLabels;
  /** Passed from the server so env names stay flexible (browser-safe keys). */
  mapboxToken: string | null;
  googleKey: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [entranceMode, setEntranceMode] = useState(false);
  const [testLotMode, setTestLotMode] = useState(false);
  const [locating, setLocating] = useState(false);
  const [gpsBusy, setGpsBusy] = useState<number | null>(null);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const hasGeometry = corners.length >= 3;
  const allLocked = hasGeometry && corners.every((c) => c.locked);

  const available: MapProvider[] = [
    "drawn",
    ...(mapboxToken ? (["mapbox"] as const) : []),
    ...(googleKey ? (["google"] as const) : []),
  ];
  const [provider, setProvider] = useState<MapProvider>(
    googleKey ? "google" : mapboxToken ? "mapbox" : "drawn",
  );
  useEffect(() => {
    try {
      const stored = localStorage.getItem(MAP_PROVIDER_KEY) as MapProvider | null;
      if (stored && available.includes(stored)) setProvider(stored);
    } catch {
      // storage unavailable — keep the default
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickProvider(next: MapProvider) {
    setProvider(next);
    try {
      localStorage.setItem(MAP_PROVIDER_KEY, next);
    } catch {
      // storage unavailable — selection lasts for the session
    }
  }

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.message ?? "Something went wrong");
    });
  }

  function onKmlChosen(file: File | undefined) {
    if (!file) return;
    const formData = new FormData();
    formData.set("kml", file);
    run(() => importKml(propertyId, formData));
  }

  function onCornerDragged(cornerId: string, next: LatLng) {
    run(() => moveCorner(cornerId, propertyId, next.lat, next.lng));
  }

  /**
   * Drop the test square on the device's own position — the quickest way to
   * stand up a GPS test wherever you are. Desktop positions are coarse; nudge
   * the square on the satellite map afterwards.
   */
  function useMyLocation() {
    setError(null);
    if (!navigator.geolocation) {
      setError(labels.noGeolocation);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        run(() =>
          placeTestLot(propertyId, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }),
        );
      },
      () => {
        setLocating(false);
        setError(labels.noGeolocation);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  /**
   * Stand on the stake, press the button: the corner takes the device's
   * position. Same pre-lock rule as dragging a pin — the server rejects a
   * locked corner — and the reported accuracy is shown so a coarse fix is
   * never mistaken for a surveyed point.
   */
  function setCornerFromGps(c: CornerRow) {
    setError(null);
    setGpsNote(null);
    if (!navigator.geolocation) {
      setError(labels.noGeolocation);
      return;
    }
    setGpsBusy(c.n);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsBusy(null);
        const ft = Math.round(pos.coords.accuracy * 3.28084);
        setGpsNote(`C${c.n} ${labels.gpsCaptured} · ±${ft} ft`);
        run(() =>
          moveCorner(c.id, propertyId, pos.coords.latitude, pos.coords.longitude),
        );
      },
      () => {
        setGpsBusy(null);
        setError(labels.noGeolocation);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  function onMapClick(p: LatLng) {
    // A test lot takes the click as the centre of a fresh generated square.
    if (testLotMode && isTestLot) {
      setTestLotMode(false);
      run(() => placeTestLot(propertyId, p));
      return;
    }
    if (!entranceMode || !hasGeometry) return;
    // Snap the entrance onto the lot line.
    const ring = corners.map((c) => ({ lat: c.lat, lng: c.lng }));
    const proj = makeProjection(centroid(ring));
    const snapped = proj.fromLocal(
      closestPointOnPolygon(proj.toLocal(p), ring.map(proj.toLocal)),
    );
    setEntranceMode(false);
    run(() => moveEntrance(propertyId, snapped));
  }

  return (
    <div className="stack" style={{ gap: "var(--gw-s-5)" }}>
      <div className="row" data-testid="corners-status">
        {allLocked ? (
          <span className="pill pill-live">{labels.verified}</span>
        ) : hasGeometry ? (
          <span className="pill pill-working">{labels.verified}?</span>
        ) : null}
        {hasGeometry && !allLocked ? (
          <span className="t-small muted">{labels.lockHint}</span>
        ) : null}
        {isTestLot ? (
          <span className="pill pill-draft" data-testid="test-lot-pill">
            {labels.testLot}
          </span>
        ) : null}
        {geometrySource ? <span className="t-small muted">{geometrySource}</span> : null}
        {lastLockEvent ? (
          <span className="t-small muted">
            · {lastLockEvent.action === "corner_locked" ? labels.locked : labels.unlock}{" "}
            {new Date(lastLockEvent.at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        ) : null}
      </div>

      <div className="row">
        <input
          ref={fileRef}
          type="file"
          accept=".kml,application/vnd.google-earth.kml+xml"
          className="sr-only"
          data-testid="kml-input"
          onChange={(e) => onKmlChosen(e.target.files?.[0])}
        />
        {isTestLot ? (
          <Button
            variant={testLotMode ? "default" : "secondary"}
            disabled={pending || allLocked}
            onClick={() => {
              setEntranceMode(false);
              setTestLotMode((v) => !v);
            }}
            data-testid="place-test-square"
          >
            <Crosshair size={16} />{" "}
            {testLotMode ? labels.placeTestSquarePrompt : labels.placeTestSquare}
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={pending || allLocked}
            onClick={() => fileRef.current?.click()}
            data-testid="import-kml"
          >
            <Upload size={16} /> {labels.importKml}
          </Button>
        )}
        {isTestLot ? (
          <Button
            variant="secondary"
            disabled={pending || allLocked || locating}
            onClick={useMyLocation}
            data-testid="test-square-here"
          >
            <LocateFixed size={16} />{" "}
            {locating ? labels.locating : labels.useMyLocation}
          </Button>
        ) : null}
        {hasGeometry && !allLocked ? (
          <Button
            disabled={pending}
            onClick={() => run(() => lockCorners(propertyId))}
            title={labels.lockHint}
            data-testid="lock-corners"
          >
            <Lock size={16} /> {labels.lock}
          </Button>
        ) : null}
        {allLocked && isAdmin ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => unlockCorners(propertyId))}
            data-testid="unlock-corners"
          >
            <LockOpen size={16} /> {labels.unlock}
          </Button>
        ) : null}
        {hasGeometry && !allLocked ? (
          <Button
            variant={entranceMode ? "default" : "ghost"}
            disabled={pending}
            onClick={() => {
              setTestLotMode(false);
              setEntranceMode((v) => !v);
            }}
          >
            {entranceMode ? "Click the lot line…" : "Move entrance"}
          </Button>
        ) : null}
      </div>

      {isTestLot ? (
        <div className="banner banner-warn" role="status" data-testid="test-lot-note">
          {labels.testLotNote}
        </div>
      ) : null}

      {error ? (
        <div className="banner banner-error" role="alert" data-testid="corners-error">
          {error}
        </div>
      ) : null}

      {gpsNote ? (
        <div className="banner" role="status" data-testid="gps-note">
          {gpsNote}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(320px,1fr)_minmax(420px,1fr)]">
        <section className="card" style={{ padding: "var(--gw-s-3)" }}>
          {hasGeometry ? (
            <div className="stack" style={{ gap: "var(--gw-s-3)" }}>
              {available.length > 1 ? (
                <div className="row" style={{ padding: "0 var(--gw-s-2)" }}>
                  <span className="t-label">{labels.mapSource}</span>
                  {available.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="btn btn-sm btn-secondary"
                      aria-pressed={provider === p}
                      style={
                        provider === p
                          ? { background: "var(--gw-pasture-green)", color: "var(--gw-prairie-cream)" }
                          : undefined
                      }
                      onClick={() => pickProvider(p)}
                      data-testid={`map-provider-${p}`}
                    >
                      {p === "drawn"
                        ? labels.mapDrawn
                        : p === "mapbox"
                          ? labels.mapSatellite
                          : labels.mapGoogle}
                    </button>
                  ))}
                </div>
              ) : null}
              {provider === "mapbox" && mapboxToken ? (
                <SatelliteMap
                  token={mapboxToken}
                  corners={corners}
                  entrance={entrance}
                  draggable={!allLocked}
                  onCornerDragged={onCornerDragged}
                  onMapClick={onMapClick}
                />
              ) : provider === "google" && googleKey ? (
                <GoogleMap
                  apiKey={googleKey}
                  corners={corners}
                  entrance={entrance}
                  draggable={!allLocked}
                  onCornerDragged={onCornerDragged}
                  onMapClick={onMapClick}
                />
              ) : (
                <DrawnMap
                  corners={corners}
                  entrance={entrance}
                  draggable={!allLocked}
                  onCornerDragged={onCornerDragged}
                  onMapClick={onMapClick}
                />
              )}
              <p className="t-small muted" style={{ padding: "0 var(--gw-s-2)" }}>
                {labels.order} · drag a pin only after unlocking
                {!mapboxToken && !googleKey
                  ? " · drawn fallback (no imagery key configured)"
                  : null}
              </p>
            </div>
          ) : (
            <div className="stack items-center p-8 text-center">
              <p className="muted">
                {isTestLot
                  ? `No geometry yet. ${labels.useMyLocation} to drop the test square where you are standing.`
                  : `No geometry yet. ${labels.importKml} — CAD-verified boundaries only.`}
              </p>
            </div>
          )}
        </section>

        <div className="stack" style={{ gap: "var(--gw-s-5)" }}>
          <section className="table-wrap">
            <table data-testid="corners-table">
              <thead>
                <tr>
                  <th>{labels.corner}</th>
                  <th>{labels.lat}</th>
                  <th>{labels.lng}</th>
                  <th>{labels.stake}</th>
                  <th>{labels.photos}</th>
                </tr>
              </thead>
              <tbody>
                {corners.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>C{c.n}</strong>
                      {c.name.en ? <p className="t-small muted">{c.name.en}</p> : null}
                      {!c.locked ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary mt-1"
                          disabled={pending || gpsBusy !== null}
                          onClick={() => setCornerFromGps(c)}
                          data-testid={`gps-corner-${c.n}`}
                        >
                          <LocateFixed size={14} />{" "}
                          {gpsBusy === c.n ? labels.locating : labels.setFromGps}
                        </button>
                      ) : null}
                    </td>
                    <td className="num">{c.lat.toFixed(6)}</td>
                    <td className="num">{c.lng.toFixed(6)}</td>
                    <td>{c.stake.en || "—"}</td>
                    <td>
                      <span
                        className={`pill ${
                          c.approachPhoto && c.stakePhoto ? "pill-live" : "pill-draft"
                        }`}
                      >
                        {(c.approachPhoto ? 1 : 0) + (c.stakePhoto ? 1 : 0)} / 2
                      </span>
                    </td>
                  </tr>
                ))}
                {corners.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      —
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          <section className="card">
            <div className="stack" style={{ gap: "var(--gw-s-2)" }}>
              <h3>{labels.entrance}</h3>
              <p className="t-small muted">
                Sets corner numbering and, later, the intro flyover&apos;s end frame.
              </p>
              {entrance ? (
                <p className="num" data-testid="entrance-coords">
                  {entrance.lat.toFixed(6)}, {entrance.lng.toFixed(6)}
                </p>
              ) : (
                <p className="muted">Set after KML import.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
