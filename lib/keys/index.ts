import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, keyLast4 } from "./crypto";

/**
 * Rotatable vendor keys. Resolution order: the encrypted service_keys row
 * (when KEY_ENCRYPTION_KEY is configured) wins over the deployment env
 * var, so the admin Settings page can rotate a key with no redeploy and
 * the env value remains the fallback. Reads are cached briefly: the
 * instance that rotates sees the new key at once (cache invalidated);
 * every other serverless instance follows within a minute.
 */
export const SERVICE_KEYS = {
  anthropic: { env: "ANTHROPIC_API_KEY", label: "Anthropic (Draft Spanish helper)" },
  higgsfield: { env: "HIGGSFIELD_API_KEY", label: "Higgsfield (media generation)" },
  monday: { env: "MONDAY_API_TOKEN", label: "Monday.com (inventory sync)" },
} as const;
export type ServiceKeyName = keyof typeof SERVICE_KEYS;

export function isServiceKeyName(name: string): name is ServiceKeyName {
  return name in SERVICE_KEYS;
}

export function kekConfigured(): boolean {
  return Boolean(process.env.KEY_ENCRYPTION_KEY);
}

const TTL_MS = 60_000;
const cache = new Map<ServiceKeyName, { value: string | null; at: number }>();

export async function getServiceKey(name: ServiceKeyName): Promise<string | null> {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let value: string | null = null;
  const kek = process.env.KEY_ENCRYPTION_KEY;
  if (kek) {
    try {
      const { data } = await createAdminClient()
        .from("service_keys")
        .select("ciphertext")
        .eq("name", name)
        .maybeSingle();
      if (data?.ciphertext) value = decryptSecret(data.ciphertext, kek);
    } catch {
      // Unreadable row (or DB hiccup): fall back to the deployment value
      // rather than taking the feature down.
    }
  }
  if (!value) value = process.env[SERVICE_KEYS[name].env] || null;

  cache.set(name, { value, at: Date.now() });
  return value;
}

export async function hasServiceKey(name: ServiceKeyName): Promise<boolean> {
  return Boolean(await getServiceKey(name));
}

export async function setServiceKey(
  name: ServiceKeyName,
  raw: string,
  updatedBy: string | null,
): Promise<{ last4: string }> {
  const kek = process.env.KEY_ENCRYPTION_KEY;
  if (!kek) throw new Error("KEY_ENCRYPTION_KEY is not configured on the deployment");
  const value = raw.trim();
  if (!value) throw new Error("Key is empty");
  const { error } = await createAdminClient().from("service_keys").upsert({
    name,
    ciphertext: encryptSecret(value, kek),
    last4: keyLast4(value),
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  });
  if (error) throw new Error(error.message);
  cache.delete(name);
  return { last4: keyLast4(value) };
}

export async function clearServiceKey(name: ServiceKeyName): Promise<void> {
  const { error } = await createAdminClient().from("service_keys").delete().eq("name", name);
  if (error) throw new Error(error.message);
  cache.delete(name);
}

export type ServiceKeyStatus = {
  source: "custom" | "env" | "none";
  last4: string | null;
  updatedAt: string | null;
};

export async function serviceKeyStatus(name: ServiceKeyName): Promise<ServiceKeyStatus> {
  if (kekConfigured()) {
    const { data } = await createAdminClient()
      .from("service_keys")
      .select("last4, updated_at")
      .eq("name", name)
      .maybeSingle();
    if (data) return { source: "custom", last4: data.last4, updatedAt: data.updated_at };
  }
  return process.env[SERVICE_KEYS[name].env]
    ? { source: "env", last4: null, updatedAt: null }
    : { source: "none", last4: null, updatedAt: null };
}
