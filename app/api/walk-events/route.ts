import { NextResponse, type NextRequest } from "next/server";
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
  locale?: string;
  device?: string;
  events?: { name?: string; data?: Record<string, unknown>; ts?: number }[];
};

export async function POST(request: NextRequest) {
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

  if (!sessionId) {
    const { data: property } = await supabase
      .from("properties")
      .select("id")
      .eq("slug", body.slug)
      .maybeSingle();
    if (!property) return NextResponse.json({ error: "unknown walk" }, { status: 404 });

    const token = `phase3-${body.slug}`;
    const { data: existingLink } = await supabase
      .from("walk_links")
      .select("id")
      .eq("token", token)
      .maybeSingle();
    let linkId = existingLink?.id ?? null;
    if (!linkId) {
      const { data: link } = await supabase
        .from("walk_links")
        .insert({ property_id: property.id, kind: "public", token })
        .select("id")
        .single();
      linkId = link?.id ?? null;
    }

    const { data: session, error: sessionError } = await supabase
      .from("walk_sessions")
      .insert({ link_id: linkId, locale, device })
      .select("id")
      .single();
    if (sessionError || !session) {
      return NextResponse.json({ error: "session failed" }, { status: 500 });
    }
    sessionId = session.id;
  }

  const { error } = await supabase.from("walk_events").insert(
    events.map((e) => ({
      session_id: sessionId,
      name: e.name!,
      data: (e.data ?? {}) as never,
    })),
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (events.some((e) => e.name === "walk_completed")) {
    await supabase
      .from("walk_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId);
  }

  return NextResponse.json({ sessionId });
}
