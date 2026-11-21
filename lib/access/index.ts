import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CaseRecord,
  ClearanceLevel,
  DenyReason,
  DocumentRecord,
  Firm,
  Profile,
  Role,
  ScanStatus,
  SecurityLevel,
} from "@/lib/types";

export type AccessIntent = "view" | "download" | "metadata";

export interface AccessFacts {
  active: boolean;
  sameFirm: boolean;
  acceptedTransferGrant: boolean;
  caseMember: boolean;
  role: Role;
  clearanceLevel: ClearanceLevel;
  securityLevel: SecurityLevel;
  scanStatus: ScanStatus;
  caseArchived: boolean;
  allowL3Download: boolean;
}

export interface PureAccessDecision {
  allow: boolean;
  reason?: DenyReason;
  metadataOnly: boolean;
}

export function evaluateAccess(
  facts: AccessFacts,
  intent: AccessIntent,
): PureAccessDecision {
  if (!facts.active) {
    return { allow: false, reason: "DEACTIVATED", metadataOnly: false };
  }

  if (!facts.sameFirm && !facts.acceptedTransferGrant) {
    return { allow: false, reason: "FIRM_MISMATCH", metadataOnly: false };
  }

  if (intent === "metadata" && facts.sameFirm && facts.role === "firm_admin") {
    return { allow: true, metadataOnly: true };
  }

  if (!facts.caseMember) {
    return { allow: false, reason: "NOT_CASE_MEMBER", metadataOnly: false };
  }

  if (facts.clearanceLevel !== facts.securityLevel) {
    return { allow: false, reason: "CLEARANCE_MISMATCH", metadataOnly: false };
  }

  if (intent !== "metadata") {
    if (facts.scanStatus !== "clean") {
      return {
        allow: false,
        reason: facts.scanStatus === "infected" ? "INFECTED" : "UNSCANNED",
        metadataOnly: false,
      };
    }

    if (
      intent === "download" &&
      facts.securityLevel === 3 &&
      !facts.allowL3Download
    ) {
      return {
        allow: false,
        reason: "DOWNLOAD_BLOCKED_L3",
        metadataOnly: false,
      };
    }
  }

  return { allow: true, metadataOnly: false };
}

export type DocumentDecision =
  | {
      allow: true;
      metadataOnly: boolean;
      profile: Profile;
      document: DocumentRecord;
      caseRecord: CaseRecord;
      firm: Firm;
      grant: "firm" | "transfer";
    }
  | { allow: false; notFound: true }
  | {
      allow: false;
      notFound: false;
      reason: DenyReason;
      profile: Profile;
      document: DocumentRecord;
      caseRecord: CaseRecord;
      firm: Firm;
    };

interface DocumentWithCase extends DocumentRecord {
  case: CaseRecord | null;
}

export async function decideDocumentAccess(
  supabase: SupabaseClient,
  profile: Profile,
  documentId: string,
  intent: AccessIntent,
): Promise<DocumentDecision> {
  const { data: documentRow, error: documentError } = await supabase
    .from("documents")
    .select("*, case:cases(*)")
    .eq("id", documentId)
    .maybeSingle<DocumentWithCase>();

  if (documentError) {
    throw new Error("Unable to load document access context.");
  }

  if (!documentRow || !documentRow.case || documentRow.purge_claimed_at || documentRow.purged_at) {
    return { allow: false, notFound: true };
  }

  const caseRecord = documentRow.case;
  const document = documentRow as DocumentRecord;

  const sameFirm = document.firm_id === profile.firm_id;
  let acceptedTransferGrant = false;

  if (!sameFirm) {
    const { data: grants, error: grantError } = await supabase
      .from("transfers")
      .select("id, transfer_items!inner(document_id)")
      .eq("status", "accepted")
      .eq("transfer_items.document_id", document.id)
      .contains("recipient_user_ids", [profile.id])
      .limit(1);

    if (grantError) {
      throw new Error("Unable to resolve transfer access.");
    }

    acceptedTransferGrant = (grants?.length ?? 0) > 0;
  }

  if (!sameFirm && !acceptedTransferGrant) {
    return { allow: false, notFound: true };
  }

  const { data: memberRow, error: membershipError } = await supabase
    .from("case_members")
    .select("case_id")
    .eq("case_id", document.case_id)
    .eq("user_id", profile.id)
    .maybeSingle<{ case_id: string }>();

  if (membershipError) {
    throw new Error("Unable to resolve case membership.");
  }

  const { data: firmRow, error: firmError } = await supabase
    .from("firms")
    .select("*")
    .eq("id", document.firm_id)
    .single<Firm>();

  if (firmError || !firmRow) {
    throw new Error("Unable to load owning firm.");
  }

  const decision = evaluateAccess(
    {
      active: profile.is_active,
      sameFirm,
      acceptedTransferGrant,
      caseMember: Boolean(memberRow),
      role: profile.role,
      clearanceLevel: profile.clearance_level,
      securityLevel: document.security_level,
      scanStatus: document.scan_status,
      caseArchived: caseRecord.status === "archived",
      allowL3Download: caseRecord.allow_l3_download,
    },
    intent,
  );

  if (!decision.allow) {
    return {
      allow: false,
      notFound: false,
      reason: decision.reason ?? "FIRM_MISMATCH",
      profile,
      document,
      caseRecord,
      firm: firmRow,
    };
  }

  return {
    allow: true,
    metadataOnly: decision.metadataOnly,
    profile,
    document,
    caseRecord,
    firm: firmRow,
    grant: sameFirm ? "firm" : "transfer",
  };
}

export function watermarkRequired(
  firm: Firm,
  document: DocumentRecord,
) {
  return (
    document.security_level >= 2 ||
    (document.security_level === 1 && firm.settings.watermark_l1)
  );
}
