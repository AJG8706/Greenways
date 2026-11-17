import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { clientIp, rateLimitAllowed, rateLimitedResponse } from "@/lib/api/rate-limit";
import { isDemoDevice } from "@/lib/analytics/walk-aggregate";
import { composeDigestText, type DigestRow } from "@/lib/digest";
import { i18nText } from "@/lib/i18n/text";
import { getAutomationSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { forwardTeamNotice } from "@/lib/walk/milestones";

function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Weekly digest (opt-in, Settings → Automations). n8n is only the clock:
 * it POSTs here on schedule; this composes the last 7 days across
 * non-archived properties and forwards the text to the GHL inbound
 * webhook (kind "weekly_digest"), whose workflow texts Laura & Mario.
 * Toggle off = {enabled:false}, nothing sent.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret || !secretMatches(request.headers.get("x-webhook-secret") ?? "", secret)) {
    if (!(await rateLimitAllowed(`webhook-auth:${clientIp(request)}`, 20, 60))) {
      return rateLimitedResponse(60);
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await rateLimitAllowed("webhook:digest", 10, 60))) {
    return rateLimitedResponse(60);
  }

  const settings = await getAutomationSettings();
  if (!settings.digestEnabled) {
    return NextResponse.json({ enabled: false });
  }

  const supabase = createAdminClient();
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();

  const { data: properties } = await supabase
    .from("properties")
    .select("id, slug, name, test_lot, archived_at")
    .is("archived_at", null);
  const real = (properties ?? []).filter((p) => !p.test_lot);
  const propertyIds = real.map((p) => p.id);
  if (propertyIds.length === 0) {
    return NextResponse.json({ enabled: true, text: null, sent: false });
  }

  const { data: links } = await supabase
    .from("walk_links")
    .select("id, property_id")
    .in("property_id", propertyIds);
  const linkToProperty = new Map((links ?? []).map((l) => [l.id, l.property_id]));
  const linkIds = (links ?? []).map((l) => l.id);

  const { data: sessions } = linkIds.length
    ? await supabase
        .from("walk_sessions")
        .select("id, link_id, device, ended_at, started_at")
        .in("link_id", linkIds)
        .gte("started_at", since)
        .limit(5000)
    : { data: [] as never[] };
  const buyerSessions = (sessions ?? []).filter((s) => !isDemoDevice(s.device));
  const sessionIds = buyerSessions.map((s) => s.id);

  const { data: fbEvents } = sessionIds.length
    ? await supabase
        .from("walk_events")
        .select("session_id, name, data")
        .eq("name", "walk_feedback")
        .in("session_id", sessionIds)
        .limit(5000)
    : { data: [] as never[] };

  const { data: leads } = await supabase
    .from("walk_leads")
    .select("id, property_id")
    .in("property_id", propertyIds)
    .gte("created_at", since);

  const lovedSessions = new Set(
    (fbEvents ?? [])
      .filter((e) => ((e.data ?? {}) as { verdict?: unknown }).verdict === "loved")
      .map((e) => e.session_id),
  );

  const rows: DigestRow[] = real.map((p) => {
    const mine = buyerSessions.filter(
      (s) => s.link_id && linkToProperty.get(s.link_id) === p.id,
    );
    return {
      name: i18nText(p.name).en || p.slug,
      walks: mine.length,
      completed: mine.filter((s) => s.ended_at).length,
      interested: (leads ?? []).filter((l) => l.property_id === p.id).length,
      loved: mine.filter((s) => lovedSessions.has(s.id)).length,
    };
  });

  const monday = new Date();
  const label = `week to ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  const text = composeDigestText(rows, label);
  const sent = await forwardTeamNotice({ kind: "weekly_digest", text });

  return NextResponse.json({ enabled: true, text, sent });
}
