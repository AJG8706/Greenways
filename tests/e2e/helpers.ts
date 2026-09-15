import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

export const ADMIN_EMAIL = "alton@texasgreenerpastures.com";

export function adminApi() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "E2E needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (start the local Supabase stack first)",
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Deterministic magic-link sign-in: generate the link server-side (same
 * invite-gate triggers run as for a real email) and follow the token hash
 * through /auth/confirm, which sets the session cookie.
 */
export async function signIn(page: Page, email: string) {
  const supabase = adminApi();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw new Error(`generateLink failed for ${email}: ${error.message}`);
  const tokenHash = data.properties.hashed_token;
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=magiclink`);
  await page.waitForURL("**/admin/**");
}
