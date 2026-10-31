import Link from "next/link";

import { PrimaryNav } from "@/components/primary-nav";

export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link href="/" className="text-lg font-semibold tracking-tight text-slate-950">
            Incident Witness
          </Link>
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Functional staging workspace
          </span>
        </div>
        <PrimaryNav />
      </div>
    </header>
  );
}
