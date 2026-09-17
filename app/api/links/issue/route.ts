import { NextResponse, type NextRequest } from "next/server";
import { newLinkToken, walkPackSms, walkUrl } from "@/lib/links";
import { i18nText } from "@/lib/i18n/text";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Prospect-link issuance for the GHL Property Tours booking flow (plan §3
 * Phase 5): n8n calls this when a booking lands on calendar
 * xBSMR6gHnlxKqJfB5Pte, gets back the tokenized walk URL plus the walk-pack
 * SMS in both languages, and drops the right one on the contact.
 *
 * Auth: shared secret header. No N8N_WEBHOOK_SECRET configured = endpoint off.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { slug?: string; ghl_contact_id?: string; locale?: string; expires_days?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!body.slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  const locale = body.locale === "es" ? "es" : "en";

  const supabase = createAdminClient();
  const { data: property } = await supabase
    .from("properties")
    .select("id, slug, name, status")
    .eq("slug", body.slug)
    .maybeSingle();
  if (!property) return NextResponse.json({ error: "unknown property" }, { status: 404 });

  const days = Math.min(Math.max(Math.round(body.expires_days ?? 30), 1), 365);
  const token = newLinkToken();
  const expiresAt = new Date(Date.now() + days * 86400_000).toISOString();
  const { error } = await supabase.from("walk_links").insert({
    property_id: property.id,
    kind: "prospect",
    token,
    locale,
    ghl_contact_id: body.ghl_contact_id?.trim() || null,
    expires_at: expiresAt,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const url = walkUrl(property.slug, token);
  const name = i18nText(property.name);
  return NextResponse.json({
    url,
    token,
    expires_at: expiresAt,
    published: property.status === "published",
    sms: {
      en: walkPackSms("en", name.en || property.slug, url),
      es: walkPackSms("es", name.es || name.en || property.slug, url),
    },
  });
}
