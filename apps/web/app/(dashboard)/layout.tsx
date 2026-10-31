import type { ReactNode } from "react";

import { AuthGuard } from "@/components/auth-guard";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

export default function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <AuthGuard>
      <div>
        <div className="mb-6 rounded-lg border border-slate-300 bg-white p-4 text-sm leading-6 text-slate-700">
          <p className="font-semibold text-slate-950">Provider workspace</p>
          <p className="mt-1">
            This workspace uses your authenticated account. Host and session data is read from the
            staging API; missing sources stay visibly unavailable.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <DashboardSidebar />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </AuthGuard>
  );
}
