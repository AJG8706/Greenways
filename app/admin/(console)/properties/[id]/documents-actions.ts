"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Audit trail for the Documents card (storage writes happen client-side). */
export async function recordDocumentEvent(
  propertyId: string,
  action: "document_uploaded" | "document_removed",
  path: string,
): Promise<void> {
  if (!path.startsWith(`${propertyId}/documents/`)) return;
  const supabase = await createClient();
  await supabase.rpc("write_audit", {
    p_action: action,
    p_property_id: propertyId,
    p_detail: { path },
  });
  revalidatePath(`/admin/properties/${propertyId}`);
}
