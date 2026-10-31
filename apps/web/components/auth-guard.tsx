import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { E2E_SESSION_COOKIE, e2eServerAuthEnabled, e2eSessionToken } from "@/lib/e2e-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function AuthGuard({ children }: Readonly<{ children: ReactNode }>) {
  if (e2eServerAuthEnabled()) {
    const cookieStore = await cookies();
    if (cookieStore.get(E2E_SESSION_COOKIE)?.value === e2eSessionToken()) {
      return <>{children}</>;
    }
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <>{children}</>;
}
