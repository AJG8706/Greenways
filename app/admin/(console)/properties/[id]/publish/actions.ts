"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { newLinkToken, publicLinkToken } from "@/lib/links";

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
  return { ok: true };
}

export async function unpublishProperty(propertyId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("properties")
    .update({ status: "draft" })
    .eq("id", propertyId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/properties/${propertyId}`);
  return { ok: true };
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
