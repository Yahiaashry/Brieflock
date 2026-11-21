import type { Metadata } from "next";
import { CasesView } from "@/components/cases/cases-view";
import { requireServerProfile } from "@/lib/auth/server";
import { serverApi } from "@/lib/api/server";
import { adminClient } from "@/lib/supabase/admin";
import { loadWorkspaceCounts } from "@/lib/workspace/counts";
import type { CaseWithMeta } from "@/lib/types";

export const metadata: Metadata = { title: "Cases" };

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
    loadWorkspaceCounts(adminClient(), profile),
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
