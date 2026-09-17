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
  searchParams: Promise<{ demo?: string; t?: string }>;
}) {
  const { slug } = await params;
  const { demo, t } = await searchParams;
  const supabase = createAdminClient();

  const { data: property } = await supabase
    .from("properties")
    .select("id, slug, name, acres, entrance_lat, entrance_lng, demo_mode, test_lot, status")
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

  // Phase 5 gate: a listing serves buyers only once published. Demo-mode
  // properties and generated test lots stay reachable for the team.
  if (property.status !== "published" && !property.demo_mode && !property.test_lot) {
    notFound();
  }

  // Prospect token: attribution only (publish status is the gate). Invalid,
  // revoked or expired tokens degrade to the public link silently.
  let linkToken: string | null = null;
  if (t) {
    const { data: link } = await supabase
      .from("walk_links")
      .select("token, revoked_at, expires_at")
      .eq("property_id", property.id)
      .eq("token", t)
      .maybeSingle();
    if (
      link &&
      !link.revoked_at &&
      (!link.expires_at || new Date(link.expires_at).getTime() > Date.now())
    ) {
      linkToken = link.token;
    }
  }

  // Approved walkthrough clips only (guardrail #3) — newest per slot.
  const { data: approvedMedia } = await supabase
    .from("media_assets")
    .select("slot, storage_path, created_at")
    .eq("property_id", property.id)
    .eq("type", "video")
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  const clipPathBySlot = new Map<string, string>();
  for (const a of approvedMedia ?? []) {
    if (!clipPathBySlot.has(a.slot)) clipPathBySlot.set(a.slot, a.storage_path);
  }

  const stakeUrls = new Map<string, string>();
  const paths = [
    ...corners.flatMap((c) => (c.stake_photo ? [c.stake_photo] : [])),
    ...clipPathBySlot.values(),
  ];
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("property-photos")
      .createSignedUrls(paths, 60 * 60 * 6);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) stakeUrls.set(s.path, s.signedUrl);
    }
  }

  const clipUrl = (slot: string): string | null => {
    const p = clipPathBySlot.get(slot);
    return p ? (stakeUrls.get(p) ?? null) : null;
  };
  const cornerClips: Record<number, string> = {};
  for (const c of corners) {
    const url = clipUrl(`corner_${c.n}_approach`);
    if (url) cornerClips[c.n] = url;
  }

  // Demo is opt-in per property. Without demo_mode the walk runs live device
  // GPS and nothing else, so a stray `?demo=` on a real listing's link can
  // never swap a buyer's position for a simulation.
  const demoScenario =
    property.demo_mode && demo && demo in SCENARIOS
      ? { key: demo, ...SCENARIOS[demo]! }
      : null;

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
    linkToken,
    googleKey:
      process.env.GOOGLE_MAPS_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? null,
    media: {
      intro: clipUrl("intro"),
      entrance: clipUrl("entrance"),
      homesite: clipUrl("homesite"),
      corners: cornerClips,
    },
  };

  return <WalkApp config={config} />;
}
