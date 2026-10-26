import type { Metadata } from "next";
import { CasesView } from "@/components/cases/cases-view";
import { requireServerProfile } from "@/lib/auth/server";
import { serverApi } from "@/lib/api/server";
import type { CaseWithMeta } from "@/lib/types";

export const metadata: Metadata = { title: "Cases" };

interface DashboardStats {
  openCases: number;
  visibleDocuments: number;
  pendingScans: number;
  incomingTransfers: number;
}

interface CaseList {
  data: CaseWithMeta[];
}

export default async function CasesPage() {
  const { profile } = await requireServerProfile();
  const [mine, firmCases, stats] = await Promise.all([
    serverApi<CaseList>("/cases?scope=mine"),
    profile.role === "firm_admin"
      ? serverApi<CaseList>("/cases?scope=firm")
      : Promise.resolve({ data: [] }),
    serverApi<DashboardStats>("/dashboard"),
  ]);

  return (
    <CasesView
      mine={mine.data}
      firmCases={firmCases.data}
      stats={stats}
      user={profile}
    />
  );
}