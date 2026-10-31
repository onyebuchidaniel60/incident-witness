import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requireAuthenticatedUser } from "@/components/auth-guard";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireAuthenticatedUser();

  return <AppShell>{children}</AppShell>;
}
