"use server";

import { revalidatePath } from "next/cache";
import {
  clearServiceKey,
  getServiceKey,
  isServiceKeyName,
  setServiceKey,
  type ServiceKeyName,
} from "@/lib/keys";
import { checkCredentials } from "@/lib/media/provider";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type KeyActionResult = { ok: boolean; message?: string };

/**
 * Key rotation is admin-role only — stricter than the team gate the rest
 * of the console uses, since whoever controls these keys controls vendor
 * spend. Returns the admin's team_users id for the audit trail.
 */
async function requireAdmin(): Promise<
  { ok: true; teamId: string } | { ok: false; message: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("team_users")
    .select("id, role")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  if (!me || me.role !== "admin") return { ok: false, message: "Admins only" };
  return { ok: true, teamId: me.id };
}

async function audit(action: string, detail: { [k: string]: string }) {
  try {
    const supabase = await createClient();
    await supabase.rpc("write_audit", {
      p_action: action,
      p_property_id: null as unknown as string,
      p_detail: detail as Json,
    });
  } catch {
    // best-effort — the rotation itself already succeeded
  }
}

export async function saveServiceKey(
  name: string,
  value: string,
): Promise<KeyActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!isServiceKeyName(name)) return { ok: false, message: "Unknown key" };
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, message: "Paste the new key first" };
  if (/[\r\n]/.test(trimmed) || trimmed.length > 500) {
    return { ok: false, message: "That doesn't look like a single API key" };
  }
  try {
    const { last4 } = await setServiceKey(name, trimmed, null);
    await audit("service_key_rotated", { name, last4 });
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save the key" };
  }
}

export async function removeServiceKey(name: string): Promise<KeyActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!isServiceKeyName(name)) return { ok: false, message: "Unknown key" };
  try {
    await clearServiceKey(name);
    await audit("service_key_cleared", { name });
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not remove the key" };
  }
}

/**
 * Live auth check against the vendor with whichever key currently
 * resolves (custom first, env fallback). Never returns the key.
 */
export async function testServiceKey(name: string): Promise<KeyActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!isServiceKeyName(name)) return { ok: false, message: "Unknown key" };
  try {
    return await liveCheck(name);
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Vendor check failed",
    };
  }
}

async function liveCheck(name: ServiceKeyName): Promise<KeyActionResult> {
  if (name === "higgsfield") {
    const result = await checkCredentials();
    return { ok: result.ok, message: result.detail };
  }

  const key = await getServiceKey(name);
  if (!key) return { ok: false, message: "No key configured" };

  if (name === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return res.ok
      ? { ok: true, message: "Auth OK — the Anthropic API accepted this key." }
      : {
          ok: false,
          message: `Anthropic rejected the key (HTTP ${res.status}). ${res.status === 401 ? "It is invalid, expired, or revoked." : ""}`.trim(),
        };
  }

  // monday
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: key,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query: "{ me { id } }" }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const body = (await res.json().catch(() => ({}))) as { data?: { me?: { id?: string } } };
  return res.ok && body.data?.me?.id
    ? { ok: true, message: "Auth OK — the Monday API accepted this token." }
    : { ok: false, message: `Monday rejected the token (HTTP ${res.status}).` };
}
