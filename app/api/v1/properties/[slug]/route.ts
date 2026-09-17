import { NextResponse, type NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { i18nText } from "@/lib/i18n/text";
import { walkUrl } from "@/lib/links";
import { mediaSlotsFor } from "@/lib/media/slots";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET /api/v1/properties/{slug} — full detail incl. corners + media state. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return auth.response;
  const { slug } = await params;

  const supabase = createAdminClient();
  const { data: property } = await supabase
    .from("properties")
    .select(
      "id, slug, name, address, county, acres, status, sale_status, es_reviewed, demo_mode, test_lot, entrance_lat, entrance_lng, geometry_source, monday_item_id, published_at, created_at",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!property) return NextResponse.json({ error: "unknown property" }, { status: 404 });

  const [{ data: corners }, { data: media }, { data: links }] = await Promise.all([
    supabase
      .from("corners")
      .select("n, lat, lng, name, stake, locked")
      .eq("property_id", property.id)
      .order("n"),
    supabase
      .from("media_assets")
      .select("slot, type, status, created_at")
      .eq("property_id", property.id)
      .neq("type", "capture")
      .order("created_at", { ascending: false }),
    supabase
      .from("walk_links")
      .select("kind, locale, ghl_contact_id, expires_at, revoked_at, created_at")
      .eq("property_id", property.id)
      .eq("kind", "prospect"),
  ]);

  const approvedSlots = new Set(
    (media ?? []).filter((m) => m.status === "approved").map((m) => m.slot),
  );
  const slots = mediaSlotsFor((corners ?? []).map((c) => c.n)).map((s) => ({
    slot: s.key,
    approved: approvedSlots.has(s.key),
  }));

  return NextResponse.json({
    slug: property.slug,
    name: i18nText(property.name),
    address: property.address,
    county: property.county,
    acres: property.acres === null ? null : Number(property.acres),
    status: property.status,
    sale_status: property.sale_status,
    spanish_reviewed: property.es_reviewed,
    demo_mode: property.demo_mode,
    test_lot: property.test_lot,
    geometry_source: property.geometry_source,
    monday_item_id: property.monday_item_id,
    entrance:
      property.entrance_lat !== null && property.entrance_lng !== null
        ? { lat: property.entrance_lat, lng: property.entrance_lng }
        : null,
    corners: (corners ?? []).map((c) => ({
      n: c.n,
      lat: c.lat,
      lng: c.lng,
      name: i18nText(c.name),
      stake: i18nText(c.stake),
      locked: c.locked,
    })),
    media_slots: slots,
    prospect_links: (links ?? []).map((l) => ({
      locale: l.locale,
      ghl_contact_id: l.ghl_contact_id,
      expires_at: l.expires_at,
      revoked: l.revoked_at !== null,
      created_at: l.created_at,
    })),
    walk_url: property.status === "published" ? walkUrl(property.slug) : null,
    published_at: property.published_at,
    created_at: property.created_at,
  });
}
