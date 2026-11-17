import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { clientIp, rateLimitAllowed, rateLimitedResponse } from "@/lib/api/rate-limit";
import { i18nText } from "@/lib/i18n/text";
import { getAutomationSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { forwardWalkMilestone } from "@/lib/walk/milestones";

function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * No-show nudges (opt-in, Settings → Automations). n8n POSTs here daily;
 * a prospect link issued N days ago (default 3) that no session ever
 * opened gets one "walk_noshow" webhook to GHL — the workflow there tags
 * the contact walk-no-show and sends the nudge SMS. noshow_notified_at
 * stamps the link so a contact is never nudged twice; links older than
 * 30 days are left alone (stale bookings, not nudge material).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret || !secretMatches(request.headers.get("x-webhook-secret") ?? "", secret)) {
    if (!(await rateLimitAllowed(`webhook-auth:${clientIp(request)}`, 20, 60))) {
      return rateLimitedResponse(60);
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await rateLimitAllowed("webhook:no-shows", 10, 60))) {
    return rateLimitedResponse(60);
  }

  const settings = await getAutomationSettings();
  if (!settings.noshowEnabled) {
    return NextResponse.json({ enabled: false, nudged: 0 });
  }

  const supabase = createAdminClient();
  const now = Date.now();
  const cutoff = new Date(now - settings.noshowDays * 86400_000).toISOString();
  const floor = new Date(now - 30 * 86400_000).toISOString();

  const { data: candidates, error } = await supabase
    .from("walk_links")
    .select(
      "id, property_id, ghl_contact_id, contact_phone, contact_name, locale, created_at, properties!inner(slug, name)",
    )
    .eq("kind", "prospect")
    .is("revoked_at", null)
    .is("noshow_notified_at", null)
    .lte("created_at", cutoff)
    .gte("created_at", floor)
    .limit(50);
  if (error) {
    return NextResponse.json(
      {
        error: /noshow_notified_at/.test(error.message)
          ? "The automations migration (20261117100000) has not reached the database yet — run the DB push workflow."
          : error.message,
      },
      { status: 500 },
    );
  }

  const withContact = (candidates ?? []).filter((c) => c.ghl_contact_id || c.contact_phone);
  if (withContact.length === 0) {
    return NextResponse.json({ enabled: true, nudged: 0 });
  }

  // A link with any session was opened — not a no-show.
  const { data: opened } = await supabase
    .from("walk_sessions")
    .select("link_id")
    .in(
      "link_id",
      withContact.map((c) => c.id),
    );
  const openedIds = new Set((opened ?? []).map((s) => s.link_id));

  let nudged = 0;
  for (const link of withContact.slice(0, 20)) {
    if (openedIds.has(link.id)) continue;
    const property = link.properties as unknown as { slug: string; name: unknown };
    await forwardWalkMilestone({
      kind: "walk_noshow",
      stage: "no_show",
      slug: property.slug,
      lot: i18nText(property.name as never).en || property.slug,
      ghlContactId: link.ghl_contact_id,
      phone: link.contact_phone,
      name: link.contact_name,
      locale: link.locale === "es" ? "es" : "en",
      sessionId: null,
    });
    await supabase
      .from("walk_links")
      .update({ noshow_notified_at: new Date().toISOString() })
      .eq("id", link.id);
    await supabase.rpc("write_audit", {
      p_action: "noshow_nudged",
      p_property_id: link.property_id,
      p_detail: { link: link.id },
    });
    nudged += 1;
  }

  return NextResponse.json({ enabled: true, nudged });
}
