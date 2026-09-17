import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * API-key material helpers (pure; the route-side authenticator lives in
 * lib/api/auth.ts). Secret format: gw_live_<43 chars base64url>. Only the
 * SHA-256 hex of the whole secret is stored.
 */

export const KEY_PREFIX = "gw_live_";

export function generateApiKey(): { secret: string; hash: string; prefix: string } {
  const secret = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { secret, hash: hashApiKey(secret), prefix: secret.slice(0, KEY_PREFIX.length + 4) };
}

export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Constant-time hash comparison (both inputs are hex sha256 digests). */
export function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
