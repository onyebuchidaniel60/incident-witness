import type { ReactNode } from "react";

import { DashboardSidebar } from "@/components/dashboard-sidebar";

export default function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div>
      <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <p className="font-semibold">Protected-area placeholder</p>
        <p className="mt-1">
          Authentication is not connected in Phase 1. These routes are public structural
          placeholders and do not load, protect or expose provider data.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <DashboardSidebar />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
