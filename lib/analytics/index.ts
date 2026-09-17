import "server-only";

import {
  buildGa4Payload,
  type WalkEventContext,
  type WalkEventInput,
} from "@/lib/analytics/ga4";

/**
 * Analytics sink for walk telemetry. walk_events in Postgres stays the
 * source of truth; this forwards a copy to an external analytics vendor
 * when one is configured — currently GA4 via the Measurement Protocol
 * (set GA4_MEASUREMENT_ID + GA4_API_SECRET in the environment; unset =
 * no-op). Swapping or adding vendors happens in this folder only.
 *
 * Demo sessions are never forwarded — production analytics stay clean.
 * Forwarding is best-effort and never blocks or fails the ingest.
 */
export async function forwardWalkEvents(
  events: WalkEventInput[],
  ctx: WalkEventContext,
): Promise<void> {
  if (ctx.demo) return;
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;
  if (!measurementId || !apiSecret || events.length === 0) return;

  const url =
    `https://www.google-analytics.com/mp/collect` +
    `?measurement_id=${encodeURIComponent(measurementId)}` +
    `&api_secret=${encodeURIComponent(apiSecret)}`;
  try {
    await fetch(url, {
      method: "POST",
      body: JSON.stringify(buildGa4Payload(events, ctx)),
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
  } catch {
    // Analytics never breaks telemetry ingest.
  }
}
