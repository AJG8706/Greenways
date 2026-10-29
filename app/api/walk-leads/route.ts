import { NextResponse, type NextRequest } from "next/server";
import { clientIp, rateLimitAllowed, rateLimitedResponse } from "@/lib/api/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Buyer lead capture ("I'm interested") from the walk's done screen. Buyers
 * are anonymous, so the insert goes through the service role while RLS keeps
 * walk_leads closed to anonymous clients. When N8N_LEAD_WEBHOOK_URL is set,
 * each lead is also forwarded to n8n (→ GHL/SMS) — best-effort, never blocks
 * the buyer's confirmation.
 */
type Body = {
  slug?: string;
  sessionId?: string;
  name?: string;
  phone?: string;
  locale?: string;
};

export async function POST(request: NextRequest) {
  // A real buyer sends one lead; small budgets stop floods on an anonymous
  // endpoint without ever stopping a household on one IP.
  if (!(await rateLimitAllowed(`lead:${clientIp(request)}`, 5, 60))) {
    return rateLimitedResponse(60);
  }
  if (!(await rateLimitAllowed("lead:global", 200, 60))) {
    return rateLimitedResponse(60);
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const slug = String(body.slug ?? "").slice(0, 120);
  const phone = String(body.phone ?? "").trim().slice(0, 30);
  const name = String(body.name ?? "").trim().slice(0, 80) || null;
  const locale = body.locale === "es" ? "es" : "en";
  // Loose on purpose (international formats, spaces, dashes) — the digits are
  // what the follow-up text needs.
  const digits = phone.replace(/\D/g, "");
  if (!slug || digits.length < 7 || digits.length > 15) {
    return NextResponse.json({ error: "slug and a valid phone required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: property } = await supabase
    .from("properties")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!property) return NextResponse.json({ error: "unknown walk" }, { status: 404 });

  // Session attribution is optional and verified: a session id that doesn't
  // belong to this slug is dropped (wrong attribution must not kill a lead).
  let sessionId: string | null = null;
  if (body.sessionId) {
    const { data: owned } = await supabase
      .from("walk_sessions")
      .select("id, walk_links!inner(properties!inner(slug))")
      .eq("id", body.sessionId)
      .maybeSingle();
    const ownerSlug = (
      owned as { walk_links?: { properties?: { slug?: string } } } | null
    )?.walk_links?.properties?.slug;
    if (owned && ownerSlug === slug) sessionId = owned.id;
  }

  const { error } = await supabase.from("walk_leads").insert({
    property_id: property.id,
    session_id: sessionId,
    locale,
    name,
    phone,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (sessionId) {
    // Joins the engagement trail so analytics can tie leads to walks.
    await supabase
      .from("walk_events")
      .insert({ session_id: sessionId, name: "lead_submitted", data: {} as never });
  }

  // Hot-lead forward (n8n → GHL/SMS). Optional via env; fire-and-forget.
  const webhook = process.env.N8N_LEAD_WEBHOOK_URL;
  if (webhook) {
    const lotName =
      (property.name as { en?: string } | null)?.en || property.slug;
    try {
      await fetch(webhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET ?? "",
        },
        body: JSON.stringify({
          kind: "walk_lead",
          lot: lotName,
          slug: property.slug,
          name,
          phone,
          locale,
          submittedAt: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // The lead row is already stored; the forward is a convenience.
    }
  }

  return NextResponse.json({ ok: true });
}
