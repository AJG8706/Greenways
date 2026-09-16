"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseKml } from "@/lib/kml";
import {
  areaAcres,
  defaultEntrance,
  normalizeRing,
  orderCornersFromEntrance,
} from "@/lib/geo/corners";
import type { LatLng } from "@/lib/geo/types";
import type { Json } from "@/lib/supabase/database.types";

export type ActionResult = { ok: boolean; message?: string };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function createProperty(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const nameEn = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const county = String(formData.get("county") ?? "").trim();
  if (!nameEn) return { ok: false, message: "Name is required" };

  const supabase = await createClient();
  const slug = slugify(nameEn);
  if (!slug) return { ok: false, message: "Name must contain letters or numbers" };

  const { data, error } = await supabase
    .from("properties")
    .insert({
      slug,
      name: { en: nameEn, es: "" },
      address: address || null,
      county: county || null,
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      message: error.code === "23505" ? "A property with that name already exists" : error.message,
    };
  }
  redirect(`/admin/properties/${data.id}`);
}

/**
 * KML import (guardrail #2): boundary polygon + corners numbered clockwise
 * from the entrance. Replaces any existing unlocked geometry; refuses to touch
 * locked corners.
 */
export async function importKml(
  propertyId: string,
  formData: FormData,
): Promise<ActionResult> {
  const file = formData.get("kml");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a .kml file" };
  }
  if (file.size > 1024 * 1024) {
    return { ok: false, message: "KML too large (max 1 MB)" };
  }

  let parsed;
  try {
    parsed = parseKml(await file.text());
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not parse KML" };
  }

  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("corners")
    .select("id, locked")
    .eq("property_id", propertyId);
  if (existingError) return { ok: false, message: existingError.message };
  if (existing.some((c) => c.locked)) {
    return {
      ok: false,
      message: "Corners are locked. Unlock (admin) before re-importing geometry.",
    };
  }

  const ring = normalizeRing(parsed.ring);
  const entrance = defaultEntrance(ring);
  const ordered = orderCornersFromEntrance(ring, entrance);
  const acres = Math.round(areaAcres(ring) * 100) / 100;

  const boundary: Json = {
    type: "Polygon",
    coordinates: [
      [...ordered, ordered[0]!].map((p) => [p.lng, p.lat] as unknown as Json),
    ],
  } as unknown as Json;

  const { error: propError } = await supabase
    .from("properties")
    .update({
      boundary,
      acres,
      entrance_lat: entrance.lat,
      entrance_lng: entrance.lng,
      geometry_source: `${file.name} · ${parsed.name ?? "KML polygon"}`,
    })
    .eq("id", propertyId);
  if (propError) return { ok: false, message: propError.message };

  const { error: delError } = await supabase
    .from("corners")
    .delete()
    .eq("property_id", propertyId);
  if (delError) return { ok: false, message: delError.message };

  const { error: insError } = await supabase.from("corners").insert(
    ordered.map((p, i) => ({
      property_id: propertyId,
      n: i + 1,
      lat: p.lat,
      lng: p.lng,
    })),
  );
  if (insError) return { ok: false, message: insError.message };

  await supabase.rpc("write_audit", {
    p_action: "kml_imported",
    p_property_id: propertyId,
    p_detail: { file: file.name, corners: ordered.length },
  });

  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

/** Move the entrance to a clicked point; corner numbering re-derives. */
export async function moveEntrance(
  propertyId: string,
  entrance: LatLng,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: corners, error } = await supabase
    .from("corners")
    .select("id, n, lat, lng, name, stake, approach_photo, stake_photo, locked")
    .eq("property_id", propertyId)
    .order("n");
  if (error) return { ok: false, message: error.message };
  if (corners.length < 3) return { ok: false, message: "Import a KML first" };
  if (corners.some((c) => c.locked)) {
    return { ok: false, message: "Corners are locked. Unlock (admin) before renumbering." };
  }

  const ring = corners.map((c) => ({ lat: c.lat, lng: c.lng }));
  const ordered = orderCornersFromEntrance(ring, entrance);

  // Renumber: map each existing corner row to its new position so names,
  // stake text and photos travel with the physical corner.
  const byKey = new Map(corners.map((c) => [`${c.lat},${c.lng}`, c]));
  const { error: delError } = await supabase
    .from("corners")
    .delete()
    .eq("property_id", propertyId);
  if (delError) return { ok: false, message: delError.message };

  const { error: insError } = await supabase.from("corners").insert(
    ordered.map((p, i) => {
      const old = byKey.get(`${p.lat},${p.lng}`);
      return {
        property_id: propertyId,
        n: i + 1,
        lat: p.lat,
        lng: p.lng,
        name: old?.name ?? { en: "", es: "" },
        stake: old?.stake ?? { en: "", es: "" },
        approach_photo: old?.approach_photo ?? null,
        stake_photo: old?.stake_photo ?? null,
      };
    }),
  );
  if (insError) return { ok: false, message: insError.message };

  const { error: entError } = await supabase
    .from("properties")
    .update({ entrance_lat: entrance.lat, entrance_lng: entrance.lng })
    .eq("id", propertyId);
  if (entError) return { ok: false, message: entError.message };

  await supabase.rpc("write_audit", {
    p_action: "entrance_moved",
    p_property_id: propertyId,
    p_detail: { lat: entrance.lat, lng: entrance.lng },
  });

  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

/** Lock all corners (CAD-verified). */
export async function lockCorners(propertyId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("corners")
    .update({ locked: true })
    .eq("property_id", propertyId)
    .eq("locked", false);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

/** Unlock corners for adjustment — admin only; the DB trigger enforces and logs it. */
export async function unlockCorners(propertyId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("corners")
    .update({ locked: false })
    .eq("property_id", propertyId)
    .eq("locked", true);
  if (error) {
    return {
      ok: false,
      message: error.message.includes("admin_only")
        ? "Only an admin can unlock corners."
        : error.message,
    };
  }
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

/** Drag-to-adjust a single (unlocked) corner. */
export async function moveCorner(
  cornerId: string,
  propertyId: string,
  lat: number,
  lng: number,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("corners")
    .update({ lat, lng })
    .eq("id", cornerId);
  if (error) {
    return {
      ok: false,
      message: error.message.includes("corner_locked")
        ? "That corner is locked. Unlock before moving it."
        : error.message,
    };
  }
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

/** Notate the lot's sale state: available | under_contract | sold. */
export async function setSaleStatus(
  propertyId: string,
  saleStatus: "available" | "under_contract" | "sold",
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("properties")
    .update({ sale_status: saleStatus })
    .eq("id", propertyId);
  if (error) return { ok: false, message: error.message };
  await supabase.rpc("write_audit", {
    p_action: "sale_status_changed",
    p_property_id: propertyId,
    p_detail: { to: saleStatus },
  });
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}
