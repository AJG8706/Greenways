import type { CookieOptions } from "@supabase/ssr";

/**
 * "Remember this device" choice from the sign-in form, carried as its own
 * cookie so every later auth-cookie write (confirm route, middleware
 * refresh) applies the same lifetime:
 *  - "1" → auth cookies keep the library's long-lived default (~400 days,
 *    Alton's explicit call — a 30-day cap shipped briefly and was reverted);
 *  - "0" → session cookies that end when the browser closes (the
 *    preference cookie itself is session-scoped then, so the two die
 *    together);
 *  - missing (magic link opened in a different browser, pre-existing
 *    sessions) counts as remembered — the checkbox defaults on.
 */
export const REMEMBER_COOKIE = "gw-remember";
export const REMEMBER_COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;

export function rememberedFrom(value: string | undefined): boolean {
  return value !== "0";
}

/** Apply the remember choice to the options Supabase asks us to set. */
export function authCookieOptions(remember: boolean, options: CookieOptions): CookieOptions {
  if (remember) return options;
  const session = { ...options };
  delete session.maxAge;
  delete session.expires;
  return session;
}
