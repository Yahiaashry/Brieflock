import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CaseDetail } from "@/components/cases/case-detail";
import { requireServerProfile } from "@/lib/auth/server";
import { serverApi, ApiClientError } from "@/lib/api/server";
import type {
  CaseWithMeta,
  DocumentRecord,
  Profile,
  TransferWithMeta,
} from "@/lib/types";

type Params = { params: Promise<{ caseId: string }> };

interface TransferList {
  data: TransferWithMeta[];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { caseId } = await params;
  try {
    const caseItem = await serverApi<CaseWithMeta>(`/cases/${caseId}`);
    return { title: caseItem.title };
  } catch {
    return { title: "Case not found" };
  }
}

export default async function CaseDetailPage({ params }: Params) {
  const { caseId } = await params;
  const { profile } = await requireServerProfile();

  let caseItem: CaseWithMeta;
  try {
    caseItem = await serverApi<CaseWithMeta>(`/cases/${caseId}`);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound();
    throw error;
  }

  const ownFirmAdmin =
    profile.role === "firm_admin" && caseItem.firm_id === profile.firm_id;
  const caseLead = caseItem.members.some(
    (member) => member.user_id === profile.id && member.role === "lead",
  );
  const [documentsResult, outgoing, incoming, firmMembersResult] =
    await Promise.all([
      serverApi<{ data: DocumentRecord[] }>(
        `/cases/${caseId}/documents?scope=${ownFirmAdmin ? "firm" : "mine"}`,
      ),
      caseItem.firm_id === profile.firm_id
        ? serverApi<TransferList>(`/transfers?direction=outgoing&case_id=${caseId}`)
        : Promise.resolve({ data: [] }),
      caseItem.firm_id !== profile.firm_id
        ? serverApi<TransferList>(`/transfers?direction=incoming&case_id=${caseId}`)
        : Promise.resolve({ data: [] }),
      (ownFirmAdmin || caseLead) && caseItem.status !== "archived"
        ? serverApi<{ data: Profile[] }>("/firms/members")
        : Promise.resolve({ data: [] }),
    ]);

  const transfers = [...outgoing.data, ...incoming.data];
  const namesById = new Map(
    caseItem.members.map((member) => [member.user_id, member.profile.full_name]),
  );
  const uploaderNames = Object.fromEntries(
    documentsResult.data.map((document) => [
      document.uploaded_by,
      namesById.get(document.uploaded_by) ?? "Unknown",
    ]),
  );

  return (
    <CaseDetail
      caseItem={caseItem}
      documents={documentsResult.data}
      members={caseItem.members}
      transfers={transfers}
      firmMembers={firmMembersResult.data}
      uploaderNames={uploaderNames}
      user={profile}
    />
  );
}
