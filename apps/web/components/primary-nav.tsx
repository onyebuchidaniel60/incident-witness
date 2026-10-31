"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Workspace" },
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

export function PrimaryNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 md:hidden"
        aria-expanded={isOpen}
        aria-controls="primary-navigation"
        onClick={() => setIsOpen((current) => !current)}
      >
        {isOpen ? "Close menu" : "Open menu"}
      </button>

      <nav
        id="primary-navigation"
        aria-label="Primary"
        className={`${isOpen ? "block" : "hidden"} mt-3 md:mt-0 md:block`}
      >
        <ul className="flex flex-col gap-1 border-t border-slate-200 pt-3 md:flex-row md:items-center md:gap-5 md:border-0 md:pt-0">
          {links.map((link) => {
            const current = isCurrentPath(pathname, link.href);

            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={current ? "page" : undefined}
                  className={`block rounded px-2 py-1 text-sm font-medium ${
                    current ? "bg-slate-900 text-white" : "text-slate-700 hover:text-slate-950"
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
