import { NextResponse, type NextRequest } from "next/server";
import { forwardWalkEvents } from "@/lib/analytics";
import { clientIp, rateLimitAllowed, rateLimitedResponse } from "@/lib/api/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Walk telemetry ingest (HUD spec §11). Buyers are anonymous; writes go
 * through the service role here while RLS keeps the tables closed to
 * anonymous clients. Sessions hang off a per-property public walk_link
 * (get-or-created until Phase 5 issues real links). Demo sessions carry a
 * "demo:" device prefix so analytics can filter them out.
 */
const ALLOWED_EVENTS = new Set([
  "walk_opened",
  "disclaimer_acknowledged",
  "permission_granted",
  "permission_denied",
  "intro_skipped",
  "corner_tracked",
  "corner_found",
  "clip_played",
  "boundary_exit",
  "compass_unreliable",
  "gps_weak",
  "language_switched",
  "walk_completed",
  "preview_played",
]);

type Body = {
  slug?: string;
  sessionId?: string;
  token?: string;
  locale?: string;
  device?: string;
  events?: { name?: string; data?: Record<string, unknown>; ts?: number }[];
};

export async function POST(request: NextRequest) {
  // Generous per-IP budget: a real walk flushes every 15 s (~4 req/min) plus
  // immediate bookends — 120/min only stops floods, never a buyer.
  if (!(await rateLimitAllowed(`walk:${clientIp(request)}`, 120, 60))) {
    return rateLimitedResponse(30);
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const events = (body.events ?? [])
    .filter((e) => typeof e.name === "string" && ALLOWED_EVENTS.has(e.name))
    .slice(0, 100);
  if (!body.slug || events.length === 0) {
    return NextResponse.json({ error: "slug and events required" }, { status: 400 });
  }
  const locale = body.locale === "es" ? "es" : "en";
  const device = String(body.device ?? "").slice(0, 120) || null;

  const supabase = createAdminClient();
  let sessionId = body.sessionId ?? null;
  // The device that decides demo classification: the session's STORED value,
  // never the request's claim (an attacker could otherwise hide traffic).
  let effectiveDevice = device;

  // Security: a caller-supplied session id must actually belong to this
  // slug's property — otherwise anyone who learns an id could append
  // events to (or force-end) someone else's session.
  if (sessionId) {
    const { data: owned } = await supabase
      .from("walk_sessions")
      .select("id, device, walk_links!inner(properties!inner(slug))")
      .eq("id", sessionId)
      .maybeSingle();
    const ownerSlug = (
      owned as { walk_links?: { properties?: { slug?: string } } } | null
    )?.walk_links?.properties?.slug;
    if (!owned || ownerSlug !== body.slug) {
      return NextResponse.json({ error: "unknown session" }, { status: 404 });
    }
    effectiveDevice = owned.device;
  }

  if (!sessionId) {
    const { data: property } = await supabase
      .from("properties")
      .select("id, demo_mode")
      .eq("slug", body.slug)
      .maybeSingle();
    if (!property) return NextResponse.json({ error: "unknown walk" }, { status: 404 });

    // A "demo:" device is honored only on properties actually in demo mode —
    // otherwise fabricated anonymous traffic could classify itself as demo
    // and hide from the buyer numbers (or vice versa).
    const sessionDevice =
      device?.startsWith("demo:") && !property.demo_mode ? device.slice("demo:".length) : device;
    effectiveDevice = sessionDevice;

    // Prospect token attributes the session; anything else falls back to
    // the property's stable public link (get-or-created).
    let linkId: string | null = null;
    if (body.token) {
      const { data: prospect } = await supabase
        .from("walk_links")
        .select("id, revoked_at, expires_at")
        .eq("property_id", property.id)
        .eq("token", body.token)
        .maybeSingle();
      if (
        prospect &&
        !prospect.revoked_at &&
        (!prospect.expires_at || new Date(prospect.expires_at).getTime() > Date.now())
      ) {
        linkId = prospect.id;
      }
    }
    if (!linkId) {
      const token = `public-${body.slug}`;
      const { data: existingLink } = await supabase
        .from("walk_links")
        .select("id")
        .eq("token", token)
        .maybeSingle();
      linkId = existingLink?.id ?? null;
      if (!linkId) {
        const { data: link } = await supabase
          .from("walk_links")
          .insert({ property_id: property.id, kind: "public", token })
          .select("id")
          .single();
        linkId = link?.id ?? null;
      }
    }

    const { data: session, error: sessionError } = await supabase
      .from("walk_sessions")
      .insert({ link_id: linkId, locale, device: sessionDevice })
      .select("id")
      .single();
    if (sessionError || !session) {
      return NextResponse.json({ error: "session failed" }, { status: 500 });
    }
    sessionId = session.id;
  }

  // Cap per-event payloads: the aggregator only reads small fields, and an
  // unbounded blob here is just storage bloat from an anonymous endpoint.
  const boundedData = (d: unknown): unknown => {
    try {
      return JSON.stringify(d ?? {}).length <= 2048 ? (d ?? {}) : {};
    } catch {
      return {};
    }
  };
  const { error: insertError } = await supabase.from("walk_events").insert(
    events.map((e) => ({
      session_id: sessionId,
      name: e.name!,
      data: boundedData(e.data) as never,
    })),
  );
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  if (events.some((e) => e.name === "walk_completed")) {
    await supabase
      .from("walk_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId);
  }

  // Copy to the external analytics sink (GA4 when configured; demo
  // sessions never forwarded; best-effort, never fails the ingest).
  await forwardWalkEvents(
    events.map((e) => ({ name: e.name!, data: e.data })),
    {
      slug: body.slug,
      sessionId,
      locale,
      demo: (effectiveDevice ?? "").startsWith("demo:"),
    },
  );

  return NextResponse.json({ sessionId });
}
