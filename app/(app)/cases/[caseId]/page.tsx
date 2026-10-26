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
  const [documentsResult, outgoing, incoming, firmMembersResult] =
    await Promise.all([
      serverApi<{ data: DocumentRecord[] }>(
        `/cases/${caseId}/documents?scope=${ownFirmAdmin ? "firm" : "mine"}`,
      ),
      serverApi<TransferList>("/transfers?direction=outgoing"),
      serverApi<TransferList>("/transfers?direction=incoming"),
      serverApi<{ data: Profile[] }>("/firms/members"),
    ]);

  const transfers = [...outgoing.data, ...incoming.data]
    .filter((transfer) => transfer.case_id === caseId)
    .filter(
      (transfer, index, all) =>
        all.findIndex((item) => item.id === transfer.id) === index,
    );

  const firmMembers = firmMembersResult.data;
  const uploaderNames = Object.fromEntries(
    documentsResult.data.map((document) => [
      document.uploaded_by,
      caseItem.members.find(
        (member) => member.user_id === document.uploaded_by,
      )?.profile.full_name ?? "Unknown",
    ]),
  );

  return (
    <CaseDetail
      caseItem={caseItem}
      documents={documentsResult.data}
      members={caseItem.members}
      transfers={transfers}
      firmMembers={firmMembers}
      uploaderNames={uploaderNames}
      user={profile}
    />
  );
}