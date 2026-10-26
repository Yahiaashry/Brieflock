import {
  isVisibleDocument,
  type CaseMemberWithProfile,
} from "@/lib/access/cases";
import type {
  CaseRecord,
  CaseWithMeta,
  DocumentRecord,
  Profile,
} from "@/lib/types";

type DocumentSummary = Pick<
  DocumentRecord,
  | "id"
  | "case_id"
  | "firm_id"
  | "security_level"
  | "uploaded_at"
  | "superseded"
>;

export function serializeCase(
  caseRecord: CaseRecord,
  members: CaseMemberWithProfile[],
  documents: DocumentSummary[],
  profile: Profile,
  adminMetadata: boolean,
  acceptedExternalDocumentIds?: ReadonlySet<string>,
): CaseWithMeta {
  const caseMembers = members
    .filter((member) => member.case_id === caseRecord.id)
    .map((member) => ({
      ...member,
      full_name: member.profile.full_name,
      member_role: member.role,
    }));

  const visibleDocuments = documents.filter((document) => {
    if (document.case_id !== caseRecord.id || document.superseded) return false;
    if (document.firm_id === profile.firm_id) {
      return isVisibleDocument(document, profile, adminMetadata);
    }
    return (
      profile.is_active &&
      document.security_level === profile.clearance_level &&
      (acceptedExternalDocumentIds?.has(document.id) ?? false)
    );
  });

  const lastUpload =
    visibleDocuments
      .map((document) => document.uploaded_at)
      .sort()
      .at(-1) ?? null;

  return {
    ...caseRecord,
    members: caseMembers,
    visible_document_count: visibleDocuments.length,
    document_count: visibleDocuments.length,
    last_upload_at: lastUpload,
  } as CaseWithMeta;
}
