import { NextResponse, type NextRequest } from "next/server";
import { issueProspectLinkForSlug } from "@/lib/links-service";

/**
 * Prospect-link issuance for the GHL Property Tours booking flow (plan §3
 * Phase 5): n8n calls this when a booking lands on calendar
 * xBSMR6gHnlxKqJfB5Pte, gets back the tokenized walk URL plus the walk-pack
 * SMS in both languages, and drops the right one on the contact.
 * Same implementation as POST /api/v1/properties/{slug}/links — this door
 * authenticates with the shared secret instead of an API key.
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

  const result = await issueProspectLinkForSlug({
    slug: body.slug,
    ghlContactId: body.ghl_contact_id,
    locale: body.locale,
    expiresDays: body.expires_days,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    url: result.url,
    token: result.token,
    expires_at: result.expires_at,
    published: result.published,
    sms: result.sms,
  });
}
