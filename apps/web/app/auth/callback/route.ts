import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const authError = requestUrl.searchParams.get("error");
  const invalidLink = new URL("/login?error=invalid_link", requestUrl.origin);

  if (!code || authError) {
    return NextResponse.redirect(invalidLink);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(invalidLink);
    }
  } catch {
    return NextResponse.redirect(invalidLink);
  }

  return NextResponse.redirect(new URL("/dashboard", requestUrl.origin));
}
