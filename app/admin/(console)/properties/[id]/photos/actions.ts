"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "../../actions";

/**
 * A recorded photo path must live in THIS property's folder and be an
 * image. The walk page signs whatever path these rows hold and hands the
 * URL to anonymous buyers, so an arbitrary path here would disclose another
 * property's private files through a public walk.
 */
function validPhotoPath(propertyId: string, folder: string, storagePath: string): boolean {
  return (
    storagePath.startsWith(`${propertyId}/${folder}/`) &&
    !storagePath.includes("..") &&
    /\.(jpe?g|png|webp|heic|heif)$/i.test(storagePath)
  );
}

/** Record an uploaded corner photo (approach or stake) against its corner row. */
export async function recordCornerPhoto(
  propertyId: string,
  cornerId: string,
  slot: "approach" | "stake",
  storagePath: string,
): Promise<ActionResult> {
  if (!validPhotoPath(propertyId, "corners", storagePath)) {
    return { ok: false, message: "Photo path does not belong to this property" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("corners")
    .update(slot === "approach" ? { approach_photo: storagePath } : { stake_photo: storagePath })
    .eq("id", cornerId)
    .eq("property_id", propertyId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

/** Record a property-level capture photo (entrance 360, homesite, gate, aerial). */
export async function recordPropertyPhoto(
  propertyId: string,
  slot: string,
  storagePath: string,
): Promise<ActionResult> {
  if (!validPhotoPath(propertyId, "property", storagePath)) {
    return { ok: false, message: "Photo path does not belong to this property" };
  }
  const supabase = await createClient();
  // Not an upsert: capture uniqueness lives on a PARTIAL index
  // (property_id, slot) WHERE type='capture', which ON CONFLICT column
  // inference cannot match through PostgREST. Replace the row instead.
  const { error: delError } = await supabase
    .from("media_assets")
    .delete()
    .eq("property_id", propertyId)
    .eq("type", "capture")
    .eq("slot", slot);
  if (delError) return { ok: false, message: delError.message };

  const { error } = await supabase.from("media_assets").insert({
    property_id: propertyId,
    type: "capture",
    slot,
    storage_path: storagePath,
    status: "approved", // human-shot, not generated — no review queue
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}
