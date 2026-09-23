import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { hashApiKey, KEY_PREFIX } from "@/lib/api/keys";
import { rateLimitAllowed, rateLimitedResponse } from "@/lib/api/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/** Per-key budget: generous for tools, cheap to raise, hard to abuse. */
const KEY_LIMIT_PER_MINUTE = 120;

/**
 * Bearer-key authentication for /api/v1. Keys are admin-issued (Team tab),
 * stored as SHA-256 only, revocable, with last_used_at touched best-effort.
 */
export type ApiAuth =
  | { ok: true; keyId: string }
  | { ok: false; response: NextResponse };

export async function authenticateApiKey(request: NextRequest): Promise<ApiAuth> {
  const header = request.headers.get("authorization") ?? "";
  const secret = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!secret.startsWith(KEY_PREFIX)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "unauthorized", detail: "Send Authorization: Bearer gw_live_…" },
        { status: 401 },
      ),
    };
  }

  const supabase = createAdminClient();
  const { data: key } = await supabase
    .from("api_keys")
    .select("id, revoked_at")
    .eq("key_hash", hashApiKey(secret))
    .maybeSingle();

  if (!key || key.revoked_at) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "unauthorized", detail: key ? "Key revoked" : "Unknown key" },
        { status: 401 },
      ),
    };
  }

  if (!(await rateLimitAllowed(`key:${key.id}`, KEY_LIMIT_PER_MINUTE, 60))) {
    return { ok: false, response: rateLimitedResponse(60) };
  }

  void supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", key.id)
    .then(() => undefined);

  return { ok: true, keyId: key.id };
}
