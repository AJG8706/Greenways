import { NextResponse, type NextRequest } from "next/server";
import { clientIp, rateLimitAllowed, rateLimitedResponse } from "@/lib/api/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { forwardWalkMilestone } from "@/lib/walk/milestones";

/**
 * Buyer lead capture ("I'm interested") from the walk's done screen. Buyers
 * are anonymous, so the insert goes through the service role while RLS keeps
 * walk_leads closed to anonymous clients. Each stored lead also emits the
 * contract_ready milestone to n8n → GHL (see lib/walk/milestones.ts) —
 * best-effort, never blocks the buyer's confirmation.
 */
type Body = {
  slug?: string;
  sessionId?: string;
  name?: string;
  phone?: string;
  locale?: string;
  /** "swipe" = slide-to-interest; a prospect session needs no typed phone. */
  source?: string;
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
  const typedPhone = String(body.phone ?? "").trim().slice(0, 30);
  let name = String(body.name ?? "").trim().slice(0, 80) || null;
  const locale = body.locale === "es" ? "es" : "en";
  const source = body.source === "swipe" ? "swipe" : "form";
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

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
  let ghlContactId: string | null = null;
  let linkPhone: string | null = null;
  let demoSession = false;
  if (body.sessionId) {
    const { data: owned } = await supabase
      .from("walk_sessions")
      .select(
        "id, device, walk_links!inner(kind, ghl_contact_id, contact_phone, contact_name, properties!inner(slug))",
      )
      .eq("id", body.sessionId)
      .maybeSingle();
    const link = (
      owned as {
        walk_links?: {
          kind?: string;
          ghl_contact_id?: string | null;
          contact_phone?: string | null;
          contact_name?: string | null;
          properties?: { slug?: string };
        };
      } | null
    )?.walk_links;
    if (owned && link?.properties?.slug === slug) {
      sessionId = owned.id;
      demoSession = (owned.device ?? "").startsWith("demo:");
      if (link.kind === "prospect") {
        ghlContactId = link.ghl_contact_id ?? null;
        linkPhone = link.contact_phone ?? null;
        if (!name) name = link.contact_name ?? null;
      }
    }
  }

  // A swipe from an attributed prospect needs no typed phone — the link
  // already knows who they are. Everyone else must leave a reachable number.
  // Loose phone check on purpose (international formats, spaces, dashes).
  const phone = typedPhone || linkPhone;
  const digits = (typedPhone || "").replace(/\D/g, "");
  const typedPhoneValid = digits.length >= 7 && digits.length <= 15;
  const attributed = ghlContactId !== null || linkPhone !== null;
  if (!typedPhoneValid && !(source === "swipe" && attributed)) {
    return NextResponse.json({ error: "a valid phone is required" }, { status: 400 });
  }

  const { error } = await supabase.from("walk_leads").insert({
    property_id: property.id,
    session_id: sessionId,
    locale,
    name,
    phone,
    source,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (sessionId) {
    // Joins the engagement trail so analytics can tie leads to walks.
    await supabase
      .from("walk_events")
      .insert({ session_id: sessionId, name: "lead_submitted", data: {} as never });
  }

  // "I want this property" moves the GHL opportunity to Contract ready and
  // texts the sales team (via n8n). Prospect sessions carry the contact id;
  // public walkers are matched by phone in n8n. Demo walks never leave.
  if (!demoSession) {
    await forwardWalkMilestone({
      kind: "walk_lead",
      stage: "contract_ready",
      slug: property.slug,
      lot: (property.name as { en?: string } | null)?.en || property.slug,
      ghlContactId,
      locale,
      sessionId,
      name,
      phone,
    });
  }

  return NextResponse.json({ ok: true });
}
