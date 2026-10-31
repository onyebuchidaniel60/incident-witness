import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicEnvironment } from "./env";

export function createSupabaseBrowserClient() {
  const { url, publishableKey } = getSupabasePublicEnvironment();
  return createBrowserClient(url, publishableKey);
}
