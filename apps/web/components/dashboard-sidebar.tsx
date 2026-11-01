"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Icon, type IconName } from "@/components/ui/icon";

const links: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Overview", icon: "grid" },
  { href: "/hosts", label: "Hosts", icon: "server" },
  { href: "/incidents", label: "Evidence sessions", icon: "activity" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

function isCurrentPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardSidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-iw-border bg-black/10 lg:w-[300px] lg:flex-row lg:border-b-0 lg:border-r">
      <div className="hidden w-[72px] flex-col items-center gap-5 border-r border-iw-border py-4 lg:flex">
        <Link
          href="/dashboard"
          className="iw-brand-mark"
          aria-label="Incident Witness dashboard"
        >
          <Icon name="hash" />
        </Link>
        <nav aria-label="Workspace shortcuts" className="flex flex-col gap-2.5">
          {links.slice(0, 3).map((link) => {
            const current = isCurrentPath(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-label={link.label}
                aria-current={current ? "page" : undefined}
                className={`grid h-10 w-10 place-items-center rounded-[4px] transition-colors ${
                  current
                    ? "bg-iw-green/10 text-iw-green-bright shadow-[inset_0_0_0_1px_rgba(38,209,140,0.28)]"
                    : "text-iw-faint hover:bg-white/5 hover:text-iw-ink"
                }`}
              >
                <Icon name={link.icon} />
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-3">
          <Link
            href="/settings"
            aria-label="Settings"
            className="grid h-10 w-10 place-items-center rounded-[4px] text-iw-faint transition-colors hover:bg-white/5 hover:text-iw-ink"
          >
            <Icon name="settings" />
          </Link>
          <Link
            href="/settings"
            aria-label="Account settings"
            title="Account settings"
            className="grid h-7 w-7 place-items-center rounded-full border border-iw-border-strong bg-iw-surface-2 font-mono text-[8px] text-iw-muted cursor-pointer transition-colors hover:border-iw-green/50 hover:bg-iw-green/10 hover:text-iw-green-bright"
          >
            OP
          </Link>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <Link href="/dashboard" className="iw-logo text-iw-ink">
            <span className="iw-brand-mark h-8 w-8">
              <Icon name="hash" size="sm" />
            </span>
            Incident Witness
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              aria-label="Back to public home"
              title="Back to public home"
              className="grid h-8 w-8 place-items-center rounded-[4px] border border-iw-border bg-white/[0.02] text-iw-faint transition-colors hover:border-iw-green/40 hover:bg-iw-green/10 hover:text-iw-green-bright"
            >
              <Icon name="arrow-left" size="sm" />
            </Link>
            <button
              type="button"
              className="iw-btn iw-btn-secondary iw-btn-sm"
              aria-expanded={isOpen}
              aria-controls="workspace-navigation"
              aria-label={isOpen ? "Close workspace menu" : "Open workspace menu"}
              onClick={() => setIsOpen((current) => !current)}
            >
              <Icon name={isOpen ? "x" : "menu"} />
            </button>
          </div>
        </div>

        <div className="hidden lg:block lg:pt-1">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              aria-label="Back to public home"
              title="Back to public home"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-[3px] border border-iw-border bg-white/[0.02] text-iw-faint transition-colors hover:border-iw-green/40 hover:bg-iw-green/10 hover:text-iw-green-bright"
            >
              <Icon name="arrow-left" size="sm" />
            </Link>
            <p className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-iw-faint">
              Provider workspace
            </p>
          </div>
          <p className="mt-2 text-[10.5px] leading-5 text-iw-muted">
            Hosts, evidence sessions and sealed records.
          </p>
        </div>

        <nav
          id="workspace-navigation"
          aria-label="Provider workspace"
          className={`${isOpen ? "mt-4 block" : "hidden"} lg:mt-5 lg:block`}
        >
          <ul className="space-y-1">
            {links.map((link) => {
              const current = isCurrentPath(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={current ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-[4px] px-2.5 py-2 text-[11.5px] font-medium transition-colors ${
                      current
                        ? "bg-white/[0.045] text-iw-ink shadow-[inset_2px_0_0_var(--color-iw-green)]"
                        : "text-iw-muted hover:bg-white/[0.035] hover:text-iw-ink"
                    }`}
                    onClick={() => setIsOpen(false)}
                  >
                    <Icon name={link.icon} size="sm" />
                    <span>{link.label}</span>
                    {current ? (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-iw-green" />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
