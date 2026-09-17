import { NextResponse, type NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { i18nText } from "@/lib/i18n/text";
import { walkUrl } from "@/lib/links";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET /api/v1/properties — list every property with its walk state. */
export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const [{ data: properties, error }, { data: corners }] = await Promise.all([
    supabase
      .from("properties")
      .select(
        "slug, name, address, county, acres, status, sale_status, es_reviewed, demo_mode, test_lot, published_at, created_at",
      )
      .order("created_at", { ascending: true }),
    supabase.from("corners").select("property_id, locked"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cornerStats = new Map<string, { total: number; locked: number }>();
  for (const c of corners ?? []) {
    const s = cornerStats.get(c.property_id) ?? { total: 0, locked: 0 };
    s.total += 1;
    if (c.locked) s.locked += 1;
    cornerStats.set(c.property_id, s);
  }

  // properties.id is intentionally not exposed; slug is the API identifier.
  const { data: ids } = await supabase.from("properties").select("id, slug");
  const idBySlug = new Map((ids ?? []).map((p) => [p.slug, p.id]));

  return NextResponse.json({
    properties: (properties ?? []).map((p) => {
      const stats = cornerStats.get(idBySlug.get(p.slug) ?? "") ?? { total: 0, locked: 0 };
      return {
        slug: p.slug,
        name: i18nText(p.name),
        address: p.address,
        county: p.county,
        acres: p.acres === null ? null : Number(p.acres),
        status: p.status,
        sale_status: p.sale_status,
        spanish_reviewed: p.es_reviewed,
        demo_mode: p.demo_mode,
        test_lot: p.test_lot,
        corners: stats,
        walk_url: p.status === "published" ? walkUrl(p.slug) : null,
        published_at: p.published_at,
        created_at: p.created_at,
      };
    }),
  });
}
