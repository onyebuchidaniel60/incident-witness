import Link from "next/link";

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/hosts", label: "Hosts" },
  { href: "/incidents", label: "Evidence sessions" },
  { href: "/settings", label: "Settings" },
];

export function DashboardSidebar() {
  return (
    <aside className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Provider workspace
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Placeholder navigation only. Authentication and account data are not connected.
      </p>
      <nav aria-label="Provider workspace" className="mt-4">
        <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="block rounded px-2 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
