import { NextResponse } from "next/server";

/**
 * Phase 1 placeholder only.
 *
 * This file establishes the Next.js 16 proxy convention but intentionally
 * performs no authentication, session refresh, redirect or access control.
 * Authentication is a Phase 2 responsibility and must not be assumed from this
 * pass-through.
 */
export function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/hosts/:path*", "/incidents/:path*", "/settings/:path*"],
};
