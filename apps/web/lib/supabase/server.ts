import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { getSupabaseCookieOptions, getSupabasePublicEnvironment } from "./env";

export async function createSupabaseServerClient() {
  const { url, publishableKey } = getSupabasePublicEnvironment();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookieOptions: getSupabaseCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, {
              ...getSupabaseCookieOptions(),
              ...options,
            });
          }
        } catch {
          // Server Components cannot always write cookies. proxy.ts handles refresh.
        }
      },
    },
  });
}

/**
 * Route-handler client. Supabase must write the exchanged session cookies to
 * the exact response that is returned to the browser. Using the read-only
 * `next/headers` store and then returning a separate `NextResponse` can drop
 * the `Set-Cookie` headers on a redirect.
 */
export async function createSupabaseRouteHandlerClient(response: NextResponse) {
  const { url, publishableKey } = getSupabasePublicEnvironment();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookieOptions: getSupabaseCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, {
            ...getSupabaseCookieOptions(),
            ...options,
          });
        }
      },
    },
  });
}
