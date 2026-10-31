import Link from "next/link";
import { cookies } from "next/headers";

import { PrimaryNav } from "@/components/primary-nav";
import { Icon } from "@/components/ui/icon";
import { E2E_SESSION_COOKIE, e2eServerAuthEnabled, e2eSessionToken } from "@/lib/e2e-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function isAuthenticated(): Promise<boolean> {
  if (e2eServerAuthEnabled()) {
    const cookieStore = await cookies();
    if (cookieStore.get(E2E_SESSION_COOKIE)?.value === e2eSessionToken()) {
      return true;
    }
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

export async function SiteHeader() {
  const authenticated = await isAuthenticated();

  return (
    <header className="iw-container pt-4">
      <div className="flex min-h-[62px] items-center gap-5 rounded-[6px] border border-iw-border bg-iw-surface/60 px-4 py-2 shadow-[0_18px_45px_rgba(0,0,0,0.25)] backdrop-blur-xl">
        <Link href="/" className="iw-logo text-iw-ink">
          <span className="iw-brand-mark">
            <Icon name="hash" size="sm" />
          </span>
          Incident Witness
        </Link>
        <span className="hidden border-l border-iw-border pl-5 text-[9px] font-medium uppercase tracking-[0.13em] text-iw-faint xl:inline">
          Portable incident evidence
        </span>
        <PrimaryNav showWorkspace={authenticated} />
      </div>
    </header>
  );
}
