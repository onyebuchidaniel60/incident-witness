import Link from "next/link";

import { PrimaryNav } from "@/components/primary-nav";
import { Icon } from "@/components/ui/icon";

export function SiteHeader() {
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
        <PrimaryNav />
      </div>
    </header>
  );
}
