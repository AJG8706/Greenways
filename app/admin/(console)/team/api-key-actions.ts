"use server";

import { revalidatePath } from "next/cache";
import { generateApiKey } from "@/lib/api/keys";
import { createClient } from "@/lib/supabase/server";

/** Create an API key; the secret is returned once and only its hash stored. */
export async function createApiKey(
  name: string,
): Promise<{ ok: boolean; secret?: string; message?: string }> {
  if (!name.trim()) return { ok: false, message: "Name the key after the tool that uses it" };

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("team_users")
    .select("id, role")
    .eq("user_id", userRes.user?.id ?? "")
    .maybeSingle();
  if (me?.role !== "admin") return { ok: false, message: "Only an admin can create API keys" };

  const { secret, hash, prefix } = generateApiKey();
  const { error } = await supabase.from("api_keys").insert({
    name: name.trim(),
    key_hash: hash,
    prefix,
    created_by: me.id,
  });
  if (error) return { ok: false, message: error.message };

  await supabase.rpc("write_audit", {
    p_action: "api_key_created",
    p_property_id: null as unknown as string,
    p_detail: { name: name.trim(), prefix },
  });
  revalidatePath("/admin/team");
  return { ok: true, secret };
}

export async function revokeApiKey(keyId: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId);
  if (error) return { ok: false, message: error.message };

  await supabase.rpc("write_audit", {
    p_action: "api_key_revoked",
    p_property_id: null as unknown as string,
    p_detail: { key_id: keyId },
  });
  revalidatePath("/admin/team");
  return { ok: true };
}
