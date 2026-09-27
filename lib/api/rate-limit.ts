import "server-only";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fixed-window rate limiting backed by Postgres (rate_limits +
 * rate_limit_hit) — one atomic upsert per request, safe across serverless
 * instances, no extra vendor. Fails OPEN: a limiter hiccup must never take
 * down a buyer-facing surface, so DB errors count as allowed.
 */
export async function rateLimitAllowed(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("rate_limit_hit", {
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

export function rateLimitedResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "rate_limited", detail: "Too many requests — slow down and retry." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

/**
 * Client IP for per-IP buckets. PLATFORM ASSUMPTION: on Vercel both headers
 * are set by the platform and cannot be spoofed by the caller. If this app
 * ever fronts another proxy/CDN or self-hosts, the first x-forwarded-for
 * hop becomes attacker-controlled and every per-IP budget with it — revisit
 * this function before changing hosting.
 */
export function clientIp(request: Request): string {
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]!.trim() || "unknown";
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0]!.trim() || "unknown";
}
