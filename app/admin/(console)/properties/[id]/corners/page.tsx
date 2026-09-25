import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { i18nText } from "@/lib/i18n/text";
import { CornersEditor } from "@/components/admin/corners-editor";

export default async function CornersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: property }, { data: corners }, { data: lockAudit }, userRes] =
    await Promise.all([
      supabase
        .from("properties")
        .select("id, entrance_lat, entrance_lng, geometry_source, boundary, test_lot")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("corners")
        .select("id, n, lat, lng, name, stake, approach_photo, stake_photo, locked")
        .eq("property_id", id)
        .order("n"),
      supabase
        .from("audit_log")
        .select("action, created_at, actor")
        .eq("property_id", id)
        .in("action", ["corner_locked", "corner_unlocked"])
        .order("created_at", { ascending: false })
        .limit(1),
      supabase.auth.getUser(),
    ]);
  if (!property) notFound();

  const { data: me } = await supabase
    .from("team_users")
    .select("role")
    .eq("user_id", userRes.data.user?.id ?? "")
    .maybeSingle();

  const t = await getTranslations("admin.corners");

  const cornerRows = (corners ?? []).map((c) => ({
    id: c.id,
    n: c.n,
    lat: c.lat,
    lng: c.lng,
    name: i18nText(c.name),
    stake: i18nText(c.stake),
    approachPhoto: c.approach_photo,
    stakePhoto: c.stake_photo,
    locked: c.locked,
  }));

  const lastLockEvent = lockAudit?.[0]
    ? {
        action: lockAudit[0].action,
        at: lockAudit[0].created_at,
      }
    : null;

  return (
    <CornersEditor
      propertyId={id}
      mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? null}
      googleKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? null}
      corners={cornerRows}
      entrance={
        property.entrance_lat !== null && property.entrance_lng !== null
          ? { lat: property.entrance_lat, lng: property.entrance_lng }
          : null
      }
      geometrySource={property.geometry_source}
      isAdmin={me?.role === "admin"}
      isTestLot={property.test_lot}
      lastLockEvent={lastLockEvent}
      labels={{
        title: t("title"),
        importKml: t("importKml"),
        source: t("source"),
        verified: t("verified"),
        locked: t("locked"),
        lock: t("lock"),
        lockHint: t("lockHint"),
        unlock: t("unlock"),
        order: t("order"),
        entrance: t("entrance"),
        stakeDesc: t("stakeDesc"),
        corner: t("cols.corner"),
        lat: t("cols.lat"),
        lng: t("cols.lng"),
        stake: t("cols.stake"),
        photos: t("cols.photos"),
        mapSource: t("mapSource"),
        mapDrawn: t("mapDrawn"),
        mapSatellite: t("mapSatellite"),
        mapGoogle: t("mapGoogle"),
        testLot: t("testLot"),
        placeTestSquare: t("placeTestSquare"),
        placeTestSquarePrompt: t("placeTestSquarePrompt"),
        testLotNote: t("testLotNote"),
        useMyLocation: t("useMyLocation"),
        locating: t("locating"),
        noGeolocation: t("noGeolocation"),
        setFromGps: t("setFromGps"),
        gpsCaptured: t("gpsCaptured"),
      }}
    />
  );
}
