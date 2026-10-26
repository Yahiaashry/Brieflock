import { AppShell } from "@/components/app-shell";
import { requireServerProfile } from "@/lib/auth/server";
import { serverApi } from "@/lib/api/server";
import type { Firm } from "@/lib/types";

export const dynamic = "force-dynamic";

interface DashboardStats {
  openCases: number;
  visibleDocuments: number;
  pendingScans: number;
  incomingTransfers: number;
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireServerProfile();
  const [stats, firm] = await Promise.all([
    serverApi<DashboardStats>("/dashboard"),
    serverApi<Firm>("/firms/current"),
  ]);

  return (
    <AppShell
      user={profile}
      firmName={firm.name}
      incomingCount={stats.incomingTransfers}
    >
      {children}
    </AppShell>
  );
}