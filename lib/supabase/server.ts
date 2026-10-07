import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { authCookieOptions, REMEMBER_COOKIE, rememberedFrom } from "./cookies";

export async function createClient() {
  const cookieStore = await cookies();
  const remember = rememberedFrom(cookieStore.get(REMEMBER_COOKIE)?.value);

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, authCookieOptions(remember, options)),
            );
          } catch {
            // Called from a Server Component — session refresh happens in middleware.
          }
        },
      },
    },
  );
}
