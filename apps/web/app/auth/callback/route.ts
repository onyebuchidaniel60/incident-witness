import { NextResponse } from "next/server";

import {
  E2E_SESSION_COOKIE,
  e2eServerAuthEnabled,
  e2eSessionToken,
} from "@/lib/e2e-auth";
import { getSupabaseCookieOptions } from "@/lib/supabase/env";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = forwardedHost ?? request.headers.get("host") ?? requestUrl.host;
  const origin = `${requestUrl.protocol}//${requestHost}`;
  const code = requestUrl.searchParams.get("code");
  const authError = requestUrl.searchParams.get("error");
  const invalidLink = new URL("/login?error=invalid_link", origin);

  if (!code || authError) {
    return NextResponse.redirect(invalidLink);
  }

  // Build the redirect first so Supabase writes the exchanged session cookies
  // onto the exact response returned to the browser.
  const response = NextResponse.redirect(new URL("/dashboard", origin));

  // Local E2E-only seam. It exercises the same response-cookie path without
  // requiring a live Supabase email or code. Disabled in production.
  if (e2eServerAuthEnabled() && code === "e2e-magic-link") {
    response.cookies.set(E2E_SESSION_COOKIE, e2eSessionToken(), getSupabaseCookieOptions());
    return response;
  }

  try {
    const supabase = await createSupabaseRouteHandlerClient(response);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(invalidLink);
    }
  } catch {
    return NextResponse.redirect(invalidLink);
  }

  return response;
}
