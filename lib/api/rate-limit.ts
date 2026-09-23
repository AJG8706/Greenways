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

/** Client IP for per-IP buckets (Vercel sets x-forwarded-for; first hop). */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0]!.trim() || "unknown";
}
