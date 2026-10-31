import type { ReactNode } from "react";

import { DashboardSidebar } from "@/components/dashboard-sidebar";

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="iw-app-stage">
      <div className="iw-app-frame">
        <DashboardSidebar />
        <main id="main-content" tabIndex={-1} className="iw-app-main">
          {children}
        </main>
      </div>
    </div>
  );
}
