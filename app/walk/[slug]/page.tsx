import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { i18nText } from "@/lib/i18n/text";
import type { WalkConfig } from "@/lib/walk/types";
import { SCENARIOS } from "@/lib/hud/walker";
import { WalkApp } from "@/components/walk/walk-app";

export const dynamic = "force-dynamic";

/**
 * Buyer walk. Buyers are anonymous (no account, ever) so data loads through
 * the service role here on the server; RLS stays closed to anonymous clients.
 * Public/prospect link tokens gate access in Phase 5 — until then any slug
 * with locked corners serves, which covers the Gate 3 field test.
 */
export default async function WalkPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const { slug } = await params;
  const { demo } = await searchParams;
  const supabase = createAdminClient();

  const { data: property } = await supabase
    .from("properties")
    .select("id, slug, name, acres, entrance_lat, entrance_lng")
    .eq("slug", slug)
    .maybeSingle();
  if (!property || property.entrance_lat === null || property.entrance_lng === null) {
    notFound();
  }

  const { data: corners } = await supabase
    .from("corners")
    .select("id, n, lat, lng, name, stake, stake_photo, locked")
    .eq("property_id", property.id)
    .order("n");
  // Corners reach buyers only once CAD-verified and locked (guardrail #2).
  if (!corners || corners.length < 3 || corners.some((c) => !c.locked)) notFound();

  const stakeUrls = new Map<string, string>();
  const paths = corners.flatMap((c) => (c.stake_photo ? [c.stake_photo] : []));
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("property-photos")
      .createSignedUrls(paths, 60 * 60 * 6);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) stakeUrls.set(s.path, s.signedUrl);
    }
  }

  const demoScenario =
    demo && demo in SCENARIOS ? { key: demo, ...SCENARIOS[demo]! } : null;

  const config: WalkConfig = {
    slug: property.slug,
    name: i18nText(property.name),
    acres: property.acres === null ? null : Number(property.acres),
    corners: corners.map((c) => ({
      id: c.id,
      n: c.n,
      lat: c.lat,
      lng: c.lng,
      name: i18nText(c.name),
      stake: i18nText(c.stake),
      stakePhotoUrl: c.stake_photo ? (stakeUrls.get(c.stake_photo) ?? null) : null,
    })),
    entrance: { lat: property.entrance_lat, lng: property.entrance_lng },
    declinationDeg: 1.5, // Beaumont ≈ +1.5°E (2026); per-property model in Phase 6
    demo: demoScenario,
  };

  return <WalkApp config={config} />;
}
