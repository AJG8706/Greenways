"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { newLinkToken, publicLinkToken, walkUrl } from "@/lib/links";
import {
  isMondayConfigured,
  listBoardItems,
  setWalkLink,
  type MondayItem,
} from "@/lib/integrations/monday";
import { i18nText } from "@/lib/i18n/text";

export type ActionResult = { ok: boolean; message?: string };

/** Human-readable text for the publish-gate trigger errors (guardrails). */
function publishError(message: string): string {
  if (message.includes("es_unreviewed")) {
    return "Spanish must be reviewed by a person first (Content tab).";
  }
  if (message.includes("corners_unverified")) {
    return "All corners must be locked (CAD-verified) first (Corners tab).";
  }
  if (message.includes("test_lot")) {
    return "A generated test lot can never be published.";
  }
  return message;
}

/** Publish: the DB trigger enforces es_reviewed + locked corners + not test_lot. */
export async function publishProperty(propertyId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("properties")
    .update({ status: "published" })
    .eq("id", propertyId);
  if (error) return { ok: false, message: publishError(error.message) };

  // Ensure the stable public link exists (sessions attribute to it).
  const { data: property } = await supabase
    .from("properties")
    .select("slug")
    .eq("id", propertyId)
    .single();
  if (property) {
    const token = publicLinkToken(property.slug);
    const { data: existing } = await supabase
      .from("walk_links")
      .select("id")
      .eq("token", token)
      .maybeSingle();
    if (!existing) {
      await supabase
        .from("walk_links")
        .insert({ property_id: propertyId, kind: "public", token });
    }
  }

  revalidatePath(`/admin/properties/${propertyId}`);
  // Board link rides publish state; failures are notes, never blockers.
  const monday = await syncMondayLink(propertyId);
  return monday.ok
    ? { ok: true }
    : { ok: true, message: `Published. Monday sync failed: ${monday.message}` };
}

/**
 * Master helper: publish every lot that passes its gates in one action.
 * Each lot goes through publishProperty (DB publish-gate trigger, public
 * link, Monday sync) — this only sequences them and reports the tally.
 */
export async function publishAllReadyLots(masterId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: lots, error } = await supabase
    .from("properties")
    .select("id, slug, status, es_reviewed, test_lot, corners(locked)")
    .eq("parent_id", masterId);
  if (error) return { ok: false, message: error.message };
  if (!lots || lots.length === 0) return { ok: false, message: "This property has no lots." };

  const ready = lots.filter((l) => {
    const corners = l.corners ?? [];
    return (
      l.status !== "published" &&
      l.es_reviewed &&
      !l.test_lot &&
      corners.length >= 3 &&
      corners.every((c) => c.locked)
    );
  });
  if (ready.length === 0) {
    return {
      ok: false,
      message:
        "No lots are ready — a lot publishes once its corners are locked and its Spanish is reviewed.",
    };
  }

  let published = 0;
  const failures: string[] = [];
  for (const lot of ready) {
    const res = await publishProperty(lot.id);
    if (res.ok) published += 1;
    else failures.push(`${lot.slug}: ${res.message ?? "failed"}`);
  }
  await supabase.rpc("write_audit", {
    p_action: "lots_bulk_published",
    p_property_id: masterId,
    p_detail: { published, ready: ready.length, lots: lots.length },
  });
  revalidatePath(`/admin/properties/${masterId}`);
  revalidatePath("/admin/properties");
  if (failures.length > 0) {
    return { ok: false, message: `Published ${published}. Failed — ${failures.join("; ")}` };
  }
  return { ok: true, message: `Published ${published} lots.` };
}

export async function unpublishProperty(propertyId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("properties")
    .update({ status: "draft" })
    .eq("id", propertyId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/properties/${propertyId}`);
  const monday = await syncMondayLink(propertyId);
  return monday.ok
    ? { ok: true }
    : { ok: true, message: `Unpublished. Monday sync failed: ${monday.message}` };
}

/** Issue a tokenized prospect link (also used by the n8n booking hook). */
export async function issueProspectLink(
  propertyId: string,
  input: { locale: "en" | "es"; ghlContactId?: string; expiresDays?: number },
): Promise<ActionResult> {
  const supabase = await createClient();
  const days = Math.min(Math.max(Math.round(input.expiresDays ?? 30), 1), 365);
  const { error } = await supabase.from("walk_links").insert({
    property_id: propertyId,
    kind: "prospect",
    token: newLinkToken(),
    locale: input.locale,
    ghl_contact_id: input.ghlContactId?.trim() || null,
    expires_at: new Date(Date.now() + days * 86400_000).toISOString(),
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

export async function revokeLink(propertyId: string, linkId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("walk_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("property_id", propertyId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
}

/** Board rows for the Publish tab's Monday picker. */
export async function listMondayItems(): Promise<
  { ok: boolean; items?: MondayItem[]; message?: string }
> {
  if (!isMondayConfigured()) return { ok: false, message: "Monday is not configured" };
  try {
    return { ok: true, items: await listBoardItems() };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Monday API failed" };
  }
}

/** Pin this property to a Monday row (empty id unlinks), then sync. */
export async function linkMondayItem(
  propertyId: string,
  itemId: string | null,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("properties")
    .select("monday_item_id")
    .eq("id", propertyId)
    .maybeSingle();

  const { error } = await supabase
    .from("properties")
    .update({ monday_item_id: itemId })
    .eq("id", propertyId);
  if (error) return { ok: false, message: error.message };

  // Unlinking clears the old row's column so the board never keeps a stale link.
  if (!itemId && current?.monday_item_id && isMondayConfigured()) {
    await setWalkLink(current.monday_item_id, null);
  }
  revalidatePath(`/admin/properties/${propertyId}`);
  return itemId ? syncMondayLink(propertyId) : { ok: true };
}

/** Push the walk link (published) or clear it (draft) on the linked row. */
export async function syncMondayLink(propertyId: string): Promise<ActionResult> {
  if (!isMondayConfigured()) return { ok: true };
  const supabase = await createClient();
  const { data: property } = await supabase
    .from("properties")
    .select("slug, name, status, monday_item_id")
    .eq("id", propertyId)
    .maybeSingle();
  if (!property?.monday_item_id) return { ok: true };

  const published = property.status === "published";
  const name = i18nText(property.name).en || property.slug;
  const result = await setWalkLink(
    property.monday_item_id,
    published ? walkUrl(property.slug) : null,
    `Greenways walk — ${name}`,
  );
  if (result.ok) {
    await supabase.rpc("write_audit", {
      p_action: "monday_synced",
      p_property_id: propertyId,
      p_detail: { item: property.monday_item_id, published },
    });
    revalidatePath(`/admin/properties/${propertyId}`);
  }
  return result;
}
