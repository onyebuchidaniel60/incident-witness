import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { DEMO_LOGIN_EMAIL, demoLoginEnabled, isSameOriginDemoLoginRequest } from "@/lib/demo-login";
import { getSupabasePublicEnvironment } from "@/lib/supabase/env";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers: NO_STORE_HEADERS });
}

/**
 * One-click hackathon judge sign-in.
 *
 * This route accepts no body and never reads an email from the request. It can
 * only generate a session for the fixed, pre-seeded demo account. The
 * service-role key is read from a server-only environment variable and is
 * never returned to the browser or placed in a client bundle.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!demoLoginEnabled()) {
    return jsonError(404, "NOT_FOUND", "Not found.");
  }

  if (!isSameOriginDemoLoginRequest(request)) {
    return jsonError(403, "DEMO_LOGIN_FORBIDDEN", "Cross-origin demo sign-in is not allowed.");
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    return jsonError(
      503,
      "DEMO_LOGIN_NOT_CONFIGURED",
      "Judge demo sign-in is not configured on this deployment.",
    );
  }

  let supabaseUrl: string;
  try {
    ({ url: supabaseUrl } = getSupabasePublicEnvironment());
  } catch {
    return jsonError(
      503,
      "DEMO_LOGIN_NOT_CONFIGURED",
      "Judge demo sign-in is not configured on this deployment.",
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: DEMO_LOGIN_EMAIL,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error("[demo-login] generateLink failed", {
      code: linkError?.code ?? "NO_HASHED_TOKEN",
    });
    return jsonError(
      502,
      "DEMO_LOGIN_FAILED",
      "The demo account could not be prepared. Check that the demo user is seeded.",
    );
  }

  // Build the response first so Supabase writes the session cookies onto the
  // exact response returned to the browser.
  const response = NextResponse.json(
    { ok: true, redirectTo: "/dashboard" },
    { headers: NO_STORE_HEADERS },
  );

  try {
    const supabase = await createSupabaseRouteHandlerClient(response);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });

    if (verifyError) {
      console.error("[demo-login] session exchange failed", {
        code: verifyError.code ?? "VERIFY_FAILED",
      });
      return jsonError(502, "DEMO_LOGIN_FAILED", "The demo session could not be created.");
    }
  } catch {
    console.error("[demo-login] session exchange failed", { code: "EXCEPTION" });
    return jsonError(502, "DEMO_LOGIN_FAILED", "The demo session could not be created.");
  }

  return response;
}
