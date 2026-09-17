"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "../../actions";

/** Record an uploaded corner photo (approach or stake) against its corner row. */
export async function recordCornerPhoto(
  propertyId: string,
  cornerId: string,
  slot: "approach" | "stake",
  storagePath: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("corners")
    .update(slot === "approach" ? { approach_photo: storagePath } : { stake_photo: storagePath })
    .eq("id", cornerId);
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
