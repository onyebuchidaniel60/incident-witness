import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { E2E_SESSION_COOKIE, e2eServerAuthEnabled, e2eSessionToken } from "@/lib/e2e-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server-only authorization boundary. Call this before returning any
 * protected layout or page tree so client components never mount for an
 * unauthenticated request.
 */
export async function requireAuthenticatedUser(): Promise<void> {
  if (e2eServerAuthEnabled()) {
    const cookieStore = await cookies();
    if (cookieStore.get(E2E_SESSION_COOKIE)?.value === e2eSessionToken()) {
      return;
    }
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
}
