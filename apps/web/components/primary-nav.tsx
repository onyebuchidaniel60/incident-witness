"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";

const baseLinks = [
  { href: "/", label: "Home" },
  { href: "/docs", label: "Docs" },
  { href: "/verify", label: "Verify" },
  { href: "/login", label: "Login" },
];

function isCurrentPath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PrimaryNav({ showWorkspace }: { showWorkspace: boolean }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const links = showWorkspace
    ? [
        { href: "/", label: "Home" },
        { href: "/dashboard", label: "Workspace" },
        { href: "/docs", label: "Docs" },
        { href: "/verify", label: "Verify" },
      ]
    : baseLinks;

  return (
    <div className="relative ml-auto">
      <button
        type="button"
        className="iw-btn iw-btn-secondary iw-btn-sm md:hidden"
        aria-expanded={isOpen}
        aria-controls="primary-navigation"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        onClick={() => setIsOpen((current) => !current)}
      >
        <Icon name={isOpen ? "x" : "menu"} />
      </button>

      <nav
        id="primary-navigation"
        aria-label="Primary"
        className={`${
          isOpen ? "block" : "hidden"
        } absolute right-0 top-[calc(100%+0.55rem)] z-40 w-56 rounded-[4px] border border-iw-border-strong bg-iw-surface-2 p-2 shadow-[0_24px_60px_rgba(0,0,0,0.55)] md:static md:ml-4 md:block md:w-auto md:border-0 md:bg-transparent md:p-0 md:shadow-none`}
      >
        <ul className="flex flex-col gap-1 md:flex-row md:items-center md:gap-5">
          {links.map((link) => {
            const current = isCurrentPath(pathname, link.href);

            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={current ? "page" : undefined}
                  className={`block rounded-[3px] px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    current
                      ? "bg-iw-green/10 text-iw-green-bright shadow-[inset_0_0_0_1px_rgba(38,209,140,0.22)]"
                      : "text-iw-muted hover:bg-white/5 hover:text-iw-ink"
                  }`}
                  onClick={() => setIsOpen(false)}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
