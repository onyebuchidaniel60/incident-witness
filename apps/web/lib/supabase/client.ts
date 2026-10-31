import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseCookieOptions, getSupabasePublicEnvironment } from "./env";

export function createSupabaseBrowserClient() {
  const { url, publishableKey } = getSupabasePublicEnvironment();
  return createBrowserClient(url, publishableKey, {
    cookieOptions: getSupabaseCookieOptions(),
  });
}
