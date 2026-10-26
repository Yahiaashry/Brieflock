import type {
  AuditAction,
  AuditEvent,
  AuditResult,
  CaseMember,
  CaseRecord,
  CaseWithMeta,
  ClearanceLevel,
  DenyReason,
  DocumentRecord,
  Firm,
  FirmSettings,
  Invite,
  MemberRole,
  Profile,
  Role,
  SecurityLevel,
  Transfer,
  TransferWithMeta,
  TransferStatus,
} from "@/lib/types";
import {
  auditEvents as seedAuditEvents,
  caseMembers as seedCaseMembers,
  cases as seedCases,
  DEMO_USER_ID,
  documents as seedDocuments,
  firms as seedFirms,
  invites as seedInvites,
  profiles as seedProfiles,
  transferItems as seedTransferItems,
  transfers as seedTransfers,
} from "./data";

interface State {
  firms: Firm[];
  profiles: Profile[];
  cases: CaseRecord[];
  caseMembers: CaseMember[];
  documents: DocumentRecord[];
  transfers: Transfer[];
  transferItems: { transfer_id: string; document_id: string }[];
  invites: Invite[];
  auditEvents: AuditEvent[];
}

function createState(): State {
  return {
    firms: structuredClone(seedFirms),
    profiles: structuredClone(seedProfiles),
    cases: structuredClone(seedCases),
    caseMembers: structuredClone(seedCaseMembers),
    documents: structuredClone(seedDocuments),
    transfers: structuredClone(seedTransfers),
    transferItems: structuredClone(seedTransferItems),
    invites: structuredClone(seedInvites),
    auditEvents: structuredClone(seedAuditEvents),
  };
}

const globalStore = globalThis as typeof globalThis & {
  __brieflockMockState?: State;
};

const state: State =
  globalStore.__brieflockMockState ?? (globalStore.__brieflockMockState = createState());

export type StoreResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function now() {
  return new Date().toISOString();
}

function pseudoHash(seed: string) {
  let out = "";
  let x = 2166136261;
  for (let i = 0; i < 64; i += 1) {
    x = Math.imul(x ^ seed.charCodeAt(i % Math.max(seed.length, 1)), 16777619);
    out += (x >>> 0).toString(16).padStart(8, "0");
  }
  return out.slice(0, 64);
}

function pushAudit(input: {
  action: AuditAction;
  result: AuditResult;
  deny_reason?: DenyReason | null;
  actor_user_id?: string | null;
  case_id?: string | null;
  document_id?: string | null;
  transfer_id?: string | null;
  firm_id?: string | null;
  details?: Record<string, unknown>;
}) {
  const previous = state.auditEvents.at(-1)?.entry_hash ?? "0".repeat(64);
  const occurred = now();
  const seq = (state.auditEvents.at(-1)?.chain_seq ?? 0) + 1;
  const entry: AuditEvent = {
    id: id("evt"),
    chain_seq: seq,
    occurred_at: occurred,
    actor_user_id: input.actor_user_id ?? getDemoUser().id,
    firm_id: input.firm_id === undefined ? getDemoUser().firm_id : input.firm_id,
    case_id: input.case_id ?? null,
    document_id: input.document_id ?? null,
    transfer_id: input.transfer_id ?? null,
    action: input.action,
    result: input.result,
    deny_reason: input.deny_reason ?? null,
    ip_hash: pseudoHash(`session-${seq}`),
    country: "GB",
    city: "London",
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    details: input.details ?? {},
    prev_hash: previous,
    entry_hash: pseudoHash(`${previous}-${seq}-${occurred}-${input.action}`),
  };
  state.auditEvents.push(entry);
}

export function getDemoUser(): Profile {
  return (
    state.profiles.find((profile) => profile.id === DEMO_USER_ID) ??
    state.profiles[0]
  );
}

export function getProfile(userId: string) {
  return state.profiles.find((profile) => profile.id === userId) ?? null;
}

export function getFirm(firmId?: string): Firm {
  const firmIdToUse = firmId ?? getDemoUser().firm_id;
  return state.firms.find((firm) => firm.id === firmIdToUse) ?? state.firms[0];
}

export function getFirmById(firmId: string) {
  return state.firms.find((firm) => firm.id === firmId) ?? null;
}

export function getFirmMembers(firmId = getDemoUser().firm_id) {
  return state.profiles.filter((profile) => profile.firm_id === firmId);
}

export function getActiveFirmMembers(firmId: string) {
  return state.profiles.filter(
    (profile) => profile.firm_id === firmId && profile.is_active,
  );
}

export function getCaseById(caseId: string) {
  return state.cases.find((item) => item.id === caseId) ?? null;
}

export function getDocumentById(documentId: string) {
  return state.documents.find((item) => item.id === documentId) ?? null;
}

export function getCaseMembers(caseId: string) {
  return state.caseMembers.filter((member) => member.case_id === caseId);
}

export function getCaseMembersWithProfiles(caseId: string) {
  return getCaseMembers(caseId)
    .map((member) => {
      const profile = getProfile(member.user_id);
      return profile ? { ...member, profile } : null;
    })
    .filter((member): member is CaseMember & { profile: Profile } =>
      Boolean(member),
    );
}

export function isCaseMember(caseId: string, userId: string) {
  return state.caseMembers.some(
    (member) => member.case_id === caseId && member.user_id === userId,
  );
}

export function isExternalMember(caseId: string, userId: string) {
  return state.caseMembers.some(
    (member) =>
      member.case_id === caseId &&
      member.user_id === userId &&
      member.role === "external",
  );
}

export function hasAcceptedTransferGrant(userId: string, documentId: string) {
  const doc = getDocumentById(documentId);
  if (!doc) return false;
  return state.transfers.some(
    (transfer) =>
      transfer.status === "accepted" &&
      transfer.recipient_user_ids.includes(userId) &&
      state.transferItems.some(
        (item) =>
          item.transfer_id === transfer.id && item.document_id === documentId,
      ),
  );
}

export function canSeeDocumentMetadata(user: Profile, doc: DocumentRecord) {
  if (!user.is_active) return false;
  if (!isCaseMember(doc.case_id, user.id)) return false;
  if (doc.security_level !== user.clearance_level) return false;
  return (
    doc.firm_id === user.firm_id || hasAcceptedTransferGrant(user.id, doc.id)
  );
}

export function getVisibleDocuments(caseId: string, user: Profile) {
  if (!isCaseMember(caseId, user.id)) return [];
  return state.documents
    .filter(
      (doc) =>
        doc.case_id === caseId &&
        !doc.superseded &&
        canSeeDocumentMetadata(user, doc),
    )
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
}

export function getAccessibleCaseIds(user: Profile) {
  const ids = new Set<string>();
  for (const member of state.caseMembers) {
    if (member.user_id === user.id) ids.add(member.case_id);
  }
  if (user.role === "firm_admin") {
    for (const item of state.cases) {
      if (item.firm_id === user.firm_id) ids.add(item.id);
    }
  }
  return ids;
}

export function getCasesForUser(
  user: Profile,
  scope: "mine" | "firm" = "mine",
): CaseWithMeta[] {
  const cases =
    scope === "firm" && user.role === "firm_admin"
      ? state.cases.filter((item) => item.firm_id === user.firm_id)
      : state.cases.filter((item) => isCaseMember(item.id, user.id));

  return cases
    .map((item) => {
      const visibleDocs = getVisibleDocuments(item.id, user);
      return {
        ...item,
        members: getCaseMembersWithProfiles(item.id),
        visible_document_count: visibleDocs.length,
        last_upload_at: visibleDocs[0]?.uploaded_at ?? null,
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getCaseForUser(caseId: string, user: Profile) {
  const item = getCaseById(caseId);
  if (!item) return null;
  if (!user.is_active) return null;
  const sameFirmAdmin = item.firm_id === user.firm_id && user.role === "firm_admin";
  if (!isCaseMember(caseId, user.id) && !sameFirmAdmin) return null;
  return item;
}

export function getCaseCountsForFirm(firmId: string) {
  const counts: Record<string, number> = {};
  for (const member of state.caseMembers) {
    const item = getCaseById(member.case_id);
    if (!item || item.firm_id !== firmId || item.status === "archived") continue;
    counts[member.user_id] = (counts[member.user_id] ?? 0) + 1;
  }
  return counts;
}

export function getDashboardStats(user: Profile) {
  const myCases = state.cases.filter(
    (item) => isCaseMember(item.id, user.id) && item.status === "open",
  );
  const visibleDocuments = state.documents.filter(
    (doc) => canSeeDocumentMetadata(user, doc) && !doc.superseded,
  );
  const pendingScans = visibleDocuments.filter(
    (doc) => doc.scan_status === "pending",
  ).length;
  const incoming = state.transfers.filter(
    (transfer) =>
      transfer.to_firm_id === user.firm_id &&
      transfer.recipient_user_ids.includes(user.id) &&
      transfer.status === "sent",
  ).length;
  return {
    openCases: myCases.length,
    visibleDocuments: visibleDocuments.length,
    pendingScans,
    incomingTransfers: incoming,
  };
}

function decorateTransfer(transfer: Transfer): TransferWithMeta {
  const item = getCaseById(transfer.case_id);
  const fromFirm = getFirmById(transfer.from_firm_id);
  const toFirm = getFirmById(transfer.to_firm_id);
  const items = state.transferItems
    .filter((entry) => entry.transfer_id === transfer.id)
    .map((entry) => getDocumentById(entry.document_id))
    .filter((document): document is DocumentRecord => Boolean(document));
  const recipients = transfer.recipient_user_ids
    .map((userId) => getProfile(userId))
    .filter((profile): profile is Profile => Boolean(profile));
  return {
    ...transfer,
    case_title: item?.title ?? "Unknown case",
    case_reference: item?.case_reference ?? "—",
    from_firm_name: fromFirm?.name ?? "Unknown firm",
    to_firm_name: toFirm?.name ?? "Unknown firm",
    created_by_name: getProfile(transfer.created_by)?.full_name ?? "Unknown member",
    items,
    recipients,
  };
}

export function getTransfersForUser(
  user: Profile,
  direction: "outgoing" | "incoming",
) {
  return state.transfers
    .filter((transfer) => {
      if (direction === "incoming") {
        return (
          transfer.status !== "draft" &&
          transfer.to_firm_id === user.firm_id &&
          transfer.recipient_user_ids.includes(user.id)
        );
      }
      const item = getCaseById(transfer.case_id);
      if (!item || item.firm_id !== user.firm_id) return false;
      return isCaseMember(item.id, user.id) || user.role === "firm_admin";
    })
    .map(decorateTransfer)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getTransferForUser(transferId: string, user: Profile) {
  const transfer = state.transfers.find((item) => item.id === transferId);
  if (!transfer) return null;
  const item = getCaseById(transfer.case_id);
  const outgoingAccess =
    item?.firm_id === user.firm_id &&
    (isCaseMember(transfer.case_id, user.id) || user.role === "firm_admin");
  const incomingAccess =
    transfer.to_firm_id === user.firm_id &&
    transfer.recipient_user_ids.includes(user.id);
  if (!outgoingAccess && !incomingAccess) return null;
  return decorateTransfer(transfer);
}

export function getFirmTransfers(user: Profile) {
  return state.transfers
    .filter((transfer) => transfer.from_firm_id === user.firm_id)
    .map(decorateTransfer);
}

export function getAuditEventsForFirm(
  user: Profile,
  filters: {
    action?: string;
    result?: string;
    deny_reason?: string;
    actor_user_id?: string;
    case_id?: string;
    from?: string;
    to?: string;
    q?: string;
  } = {},
) {
  if (user.role !== "firm_admin") return [];
  return state.auditEvents
    .filter((event) => event.firm_id === user.firm_id)
    .filter((event) => !filters.action || event.action === filters.action)
    .filter((event) => !filters.result || event.result === filters.result)
    .filter(
      (event) => !filters.deny_reason || event.deny_reason === filters.deny_reason,
    )
    .filter(
      (event) =>
        !filters.actor_user_id || event.actor_user_id === filters.actor_user_id,
    )
    .filter((event) => !filters.case_id || event.case_id === filters.case_id)
    .filter((event) => !filters.from || event.occurred_at >= filters.from)
    .filter((event) => !filters.to || event.occurred_at <= filters.to)
    .filter((event) => {
      if (!filters.q) return true;
      const needle = filters.q.toLowerCase();
      return (
        event.action.toLowerCase().includes(needle) ||
        (event.deny_reason ?? "").toLowerCase().includes(needle) ||
        (getProfile(event.actor_user_id ?? "")?.full_name ?? "")
          .toLowerCase()
          .includes(needle)
      );
    })
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

export function getRecentDenials() {
  return state.auditEvents
    .filter((event) => event.result === "deny")
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

export interface SearchResults {
  documents: Array<
    DocumentRecord & { case_title: string; case_reference: string }
  >;
  cases: CaseRecord[];
}

export function searchForUser(user: Profile, query: string): SearchResults {
  const needle = query.trim().toLowerCase();
  if (!needle) return { documents: [], cases: [] };
  const accessibleCaseIds = getAccessibleCaseIds(user);

  const cases = state.cases
    .filter((item) => accessibleCaseIds.has(item.id))
    .filter(
      (item) =>
        item.title.toLowerCase().includes(needle) ||
        item.case_reference.toLowerCase().includes(needle),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const documents = state.documents
    .filter((doc) => !doc.superseded)
    .filter((doc) => canSeeDocumentMetadata(user, doc))
    .filter(
      (doc) =>
        doc.filename.toLowerCase().includes(needle) ||
        (doc.description ?? "").toLowerCase().includes(needle),
    )
    .map((doc) => {
      const item = getCaseById(doc.case_id);
      return {
        ...doc,
        case_title: item?.title ?? "Unknown case",
        case_reference: item?.case_reference ?? "—",
      };
    })
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));

  return { documents, cases };
}

export function getContentAuthorization(
  documentId: string,
  user: Profile,
  disposition: "view" | "download",
  options: { audit?: boolean } = {},
):
  | {
      ok: true;
      document: DocumentRecord;
      watermark: {
        required: boolean;
        viewer_name: string;
        issued_at: string;
      };
    }
  | { ok: false; code: "ACCESS_DENIED" | "DOWNLOAD_BLOCKED_L3" } {
  const document = getDocumentById(documentId);
  if (!document) return { ok: false, code: "ACCESS_DENIED" };

  const item = getCaseById(document.case_id);
  const active = user.is_active;
  const firmMatch =
    document.firm_id === user.firm_id ||
    hasAcceptedTransferGrant(user.id, document.id);
  const member = isCaseMember(document.case_id, user.id);
  const clearanceMatch = user.clearance_level === document.security_level;
  const scanClean = document.scan_status === "clean";

  const deny = (reason: DenyReason) => {
    if (options.audit !== false) {
      pushAudit({
        action: "document.access_denied",
        result: "deny",
        deny_reason: reason,
        case_id: document.case_id,
        document_id: document.id,
        details: { disposition },
      });
    }
    return { ok: false as const, code: "ACCESS_DENIED" as const };
  };

  if (!active) return deny("DEACTIVATED");
  if (!firmMatch) return deny("FIRM_MISMATCH");
  if (!member) return deny("NOT_CASE_MEMBER");
  if (!clearanceMatch) return deny("CLEARANCE_MISMATCH");
  if (!scanClean) {
    return deny(document.scan_status === "infected" ? "INFECTED" : "UNSCANNED");
  }
  if (
    disposition === "download" &&
    document.security_level === 3 &&
    item &&
    !item.allow_l3_download
  ) {
    if (options.audit !== false) {
      pushAudit({
        action: "document.access_denied",
        result: "deny",
        deny_reason: "DOWNLOAD_BLOCKED_L3",
        case_id: document.case_id,
        document_id: document.id,
        details: { disposition },
      });
    }
    return { ok: false, code: "DOWNLOAD_BLOCKED_L3" };
  }

  if (options.audit !== false) {
    pushAudit({
      action:
        disposition === "download" ? "document.downloaded" : "document.viewed",
      result: "allow",
      case_id: document.case_id,
      document_id: document.id,
      details: { disposition },
    });
  }

  const firm = getFirm(user.firm_id);
  return {
    ok: true,
    document,
    watermark: {
      required:
        document.security_level >= 2 ||
        (document.security_level === 1 && firm.settings.watermark_l1),
      viewer_name: user.full_name,
      issued_at: now(),
    },
  };
}

export function createCase(
  user: Profile,
  input: {
    title: string;
    case_reference: string;
    default_security_level: SecurityLevel;
    retention_days: number | null;
  },
): StoreResult<CaseRecord> {
  const title = input.title.trim();
  const reference = input.case_reference.trim();
  if (!title) return { ok: false, error: "A case title is required." };
  if (!reference) return { ok: false, error: "A case reference is required." };
  if (
    state.cases.some(
      (item) =>
        item.firm_id === user.firm_id &&
        item.case_reference.toLowerCase() === reference.toLowerCase(),
    )
  ) {
    return {
      ok: false,
      error: "That case reference already exists in your firm.",
    };
  }
  const created: CaseRecord = {
    id: id("case"),
    firm_id: user.firm_id,
    title,
    case_reference: reference,
    default_security_level: input.default_security_level,
    status: "open",
    allow_l3_download: !getFirm().settings.l3_view_only_default,
    legal_hold: false,
    retention_days: input.retention_days,
    created_by: user.id,
    created_at: now(),
    closed_at: null,
  };
  state.cases.push(created);
  state.caseMembers.push({
    case_id: created.id,
    user_id: user.id,
    role: "lead",
    added_by: user.id,
    added_at: now(),
  });
  pushAudit({
    action: "case.created",
    result: "allow",
    case_id: created.id,
    details: { title, case_reference: reference },
  });
  return { ok: true, data: created };
}

export function updateCase(
  user: Profile,
  caseId: string,
  patch: Partial<
    Pick<
      CaseRecord,
      | "status"
      | "allow_l3_download"
      | "legal_hold"
      | "default_security_level"
      | "title"
      | "case_reference"
      | "retention_days"
    >
  >,
): StoreResult<CaseRecord> {
  const item = getCaseById(caseId);
  if (!item) return { ok: false, error: "Case not found." };
  if (item.status === "archived") {
    return { ok: false, error: "This case is archived. Changes are blocked." };
  }
  if (patch.title !== undefined) {
    if (!patch.title.trim()) return { ok: false, error: "A title is required." };
    if (patch.title.trim().length > 300) {
      return { ok: false, error: "Titles are limited to 300 characters." };
    }
    item.title = patch.title.trim();
  }
  if (patch.case_reference !== undefined) {
    const reference = patch.case_reference.trim();
    if (!reference) {
      return { ok: false, error: "A case reference is required." };
    }
    const duplicate = state.cases.some(
      (entry) =>
        entry.id !== caseId &&
        entry.firm_id === item.firm_id &&
        entry.case_reference.toLowerCase() === reference.toLowerCase(),
    );
    if (duplicate) {
      return {
        ok: false,
        error: "That case reference already exists in your firm.",
      };
    }
    item.case_reference = reference;
  }
  if (patch.retention_days !== undefined) {
    item.retention_days = patch.retention_days;
  }
  Object.assign(item, {
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.allow_l3_download !== undefined
      ? { allow_l3_download: patch.allow_l3_download }
      : {}),
    ...(patch.legal_hold !== undefined ? { legal_hold: patch.legal_hold } : {}),
    ...(patch.default_security_level !== undefined
      ? { default_security_level: patch.default_security_level }
      : {}),
  });
  const action: AuditAction =
    patch.status === "archived"
      ? "case.archived"
      : patch.status === "closed"
        ? "case.closed"
        : "case.updated";
  if (patch.status === "closed") item.closed_at = now();
  pushAudit({
    action,
    result: "allow",
    case_id: caseId,
    details: { fields: Object.keys(patch) },
  });
  return { ok: true, data: item };
}

export function createDocument(
  user: Profile,
  input: {
    case_id: string;
    filename: string;
    size_bytes: number;
    security_level: SecurityLevel;
    description: string | null;
  },
): StoreResult<DocumentRecord> {
  const item = getCaseById(input.case_id);
  if (!item) return { ok: false, error: "Case not found." };
  if (item.status === "archived") {
    return { ok: false, error: "This case is archived. Uploads are blocked." };
  }
  if (!input.filename.toLowerCase().endsWith(".pdf")) {
    return { ok: false, error: "Only PDF documents can be uploaded." };
  }
  if (input.size_bytes > 104857600) {
    return { ok: false, error: "The maximum document size is 100 MB." };
  }
  if (input.security_level < item.default_security_level) {
    return {
      ok: false,
      error: "Documents cannot be uploaded below the case default level.",
    };
  }
  const documentId = id("doc");
  const created: DocumentRecord = {
    id: documentId,
    case_id: input.case_id,
    firm_id: item.firm_id,
    filename: input.filename,
    storage_path: `${item.firm_id}/${input.case_id}/${documentId}/${input.filename}`,
    size_bytes: input.size_bytes,
    mime_type: "application/pdf",
    sha256: pseudoHash(`${documentId}-${input.filename}`),
    security_level: input.security_level,
    scan_status: "pending",
    scan_method: "magic-bytes-mvp",
    description: input.description,
    uploaded_by: user.id,
    uploaded_at: now(),
    superseded: false,
  };
  state.documents.push(created);
  return { ok: true, data: created };
}

export function completeDocumentUpload(
  user: Profile,
  documentId: string,
): StoreResult<DocumentRecord> {
  const document = getDocumentById(documentId);
  if (!document) return { ok: false, error: "Document not found." };
  if (document.uploaded_by !== user.id) {
    return { ok: false, error: "Only the uploader can complete this upload." };
  }
  document.scan_status = "clean";
  pushAudit({
    action: "document.uploaded",
    result: "allow",
    case_id: document.case_id,
    document_id: document.id,
    details: { scan_status: "clean", method: document.scan_method },
  });
  return { ok: true, data: document };
}

export function changeDocumentLevel(
  user: Profile,
  documentId: string,
  securityLevel: SecurityLevel,
  reason?: string,
): StoreResult<DocumentRecord> {
  const document = getDocumentById(documentId);
  if (!document) return { ok: false, error: "Document not found." };
  const item = getCaseById(document.case_id);
  if (item?.status === "archived") {
    return { ok: false, error: "This case is archived. Changes are blocked." };
  }
  if (securityLevel === document.security_level) {
    return { ok: false, error: "The document is already at that level." };
  }
  const raising = securityLevel > document.security_level;
  if (!raising && user.role !== "firm_admin") {
    return {
      ok: false,
      error: "Only a firm administrator can lower a security level.",
    };
  }
  if (!raising && !reason?.trim()) {
    return {
      ok: false,
      error: "A reason is required when lowering a security level.",
    };
  }
  const previous = document.security_level;
  document.security_level = securityLevel;
  pushAudit({
    action: raising ? "document.level_raised" : "document.level_lowered",
    result: "allow",
    case_id: document.case_id,
    document_id: document.id,
    details: {
      from: previous,
      to: securityLevel,
      ...(reason ? { reason: reason.trim() } : {}),
    },
  });
  return { ok: true, data: document };
}

export function updateFirmSettings(
  user: Profile,
  patch: Partial<FirmSettings> & { name?: string },
): StoreResult<Firm> {
  if (user.role !== "firm_admin") {
    return { ok: false, error: "Only firm administrators can change settings." };
  }
  const firm = getFirm(user.firm_id);
  if (patch.name !== undefined) {
    if (!patch.name.trim()) return { ok: false, error: "Firm name is required." };
    firm.name = patch.name.trim();
  }
  if (patch.retention_days !== undefined) {
    firm.settings.retention_days = Math.max(1, Math.round(patch.retention_days));
  }
  if (patch.watermark_l1 !== undefined) {
    firm.settings.watermark_l1 = patch.watermark_l1;
  }
  if (patch.l3_view_only_default !== undefined) {
    firm.settings.l3_view_only_default = patch.l3_view_only_default;
  }
  pushAudit({
    action: "firm.updated",
    result: "allow",
    details: { fields: Object.keys(patch) },
  });
  return { ok: true, data: firm };
}

export function updateProfile(
  user: Profile,
  profileId: string,
  patch: Partial<Pick<Profile, "role" | "clearance_level" | "is_active">>,
): StoreResult<Profile> {
  if (user.role !== "firm_admin") {
    return { ok: false, error: "Only firm administrators can change members." };
  }
  const target = getProfile(profileId);
  if (!target || target.firm_id !== user.firm_id) {
    return { ok: false, error: "Member not found." };
  }
  const activeAdmins = state.profiles.filter(
    (profile) =>
      profile.firm_id === user.firm_id &&
      profile.role === "firm_admin" &&
      profile.is_active,
  );
  const demotingLastAdmin =
    target.role === "firm_admin" &&
    (patch.role !== undefined && patch.role !== "firm_admin") &&
    activeAdmins.length <= 1;
  const deactivatingLastAdmin =
    target.role === "firm_admin" && patch.is_active === false && activeAdmins.length <= 1;
  if (demotingLastAdmin || deactivatingLastAdmin) {
    return {
      ok: false,
      error: "Your firm must keep at least one active administrator.",
    };
  }

  if (patch.role !== undefined && patch.role !== target.role) {
    const before = target.role;
    target.role = patch.role;
    pushAudit({
      action: "member.role_changed",
      result: "allow",
      details: { scope: "firm", user_id: target.id, from: before, to: patch.role },
    });
  }
  if (
    patch.clearance_level !== undefined &&
    patch.clearance_level !== target.clearance_level
  ) {
    const before = target.clearance_level;
    target.clearance_level = patch.clearance_level;
    pushAudit({
      action: "clearance.changed",
      result: "allow",
      details: { user_id: target.id, from: before, to: patch.clearance_level },
    });
  }
  if (patch.is_active !== undefined && patch.is_active !== target.is_active) {
    target.is_active = patch.is_active;
    target.deactivated_at = patch.is_active ? null : now();
    pushAudit({
      action: patch.is_active ? "member.added" : "member.removed",
      result: "allow",
      details: {
        user_id: target.id,
        reason: patch.is_active ? "reactivated" : "deactivated",
      },
    });
  }
  return { ok: true, data: target };
}

export function createInvite(
  user: Profile,
  input: { email: string; role: Role; clearance_level: ClearanceLevel },
): StoreResult<Invite> {
  if (user.role !== "firm_admin") {
    return { ok: false, error: "Only firm administrators can invite members." };
  }
  if (!input.email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }
  const invite: Invite = {
    id: id("inv"),
    firm_id: user.firm_id,
    email: input.email.trim().toLowerCase(),
    role: input.role,
    clearance_level: input.clearance_level,
    created_by: user.id,
    created_at: now(),
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    accepted_at: null,
  };
  state.invites.push(invite);
  pushAudit({
    action: "firm.updated",
    result: "allow",
    details: { type: "invite_sent", role: input.role },
  });
  return { ok: true, data: invite };
}

export function revokeInvite(user: Profile, inviteId: string): StoreResult {
  if (user.role !== "firm_admin") {
    return { ok: false, error: "Only firm administrators can revoke invites." };
  }
  const index = state.invites.findIndex(
    (invite) => invite.id === inviteId && invite.firm_id === user.firm_id,
  );
  if (index === -1) return { ok: false, error: "Invite not found." };
  state.invites.splice(index, 1);
  pushAudit({
    action: "firm.updated",
    result: "allow",
    details: { type: "invite_revoked" },
  });
  return { ok: true, data: null };
}

export function getInvites() {
  return state.invites.filter(
    (invite) => invite.firm_id === getDemoUser().firm_id && !invite.accepted_at,
  );
}

export function addCaseMember(
  user: Profile,
  caseId: string,
  userId: string,
  role: Exclude<MemberRole, "external">,
): StoreResult {
  const item = getCaseById(caseId);
  if (!item) return { ok: false, error: "Case not found." };
  if (item.firm_id !== user.firm_id) {
    return { ok: false, error: "You can only add members of your own firm." };
  }
  if (item.status === "archived") {
    return { ok: false, error: "This case is archived. Changes are blocked." };
  }
  const profile = getProfile(userId);
  if (!profile || profile.firm_id !== user.firm_id || !profile.is_active) {
    return { ok: false, error: "That member is not active in your firm." };
  }
  if (isCaseMember(caseId, userId)) {
    return { ok: false, error: "That member is already on this case." };
  }
  state.caseMembers.push({
    case_id: caseId,
    user_id: userId,
    role,
    added_by: user.id,
    added_at: now(),
  });
  pushAudit({
    action: "member.added",
    result: "allow",
    case_id: caseId,
    details: { scope: "case", role, user_id: userId },
  });
  return { ok: true, data: null };
}

export function updateCaseMemberRole(
  user: Profile,
  caseId: string,
  userId: string,
  role: Exclude<MemberRole, "external">,
): StoreResult {
  const member = state.caseMembers.find(
    (entry) => entry.case_id === caseId && entry.user_id === userId,
  );
  if (!member) return { ok: false, error: "Case member not found." };
  if (member.role === "external") {
    return {
      ok: false,
      error: "External membership is managed by transfers only.",
    };
  }
  const before = member.role;
  member.role = role;
  pushAudit({
    action: "member.role_changed",
    result: "allow",
    case_id: caseId,
    details: { scope: "case", user_id: userId, from: before, to: role },
  });
  return { ok: true, data: null };
}

export function removeCaseMember(
  user: Profile,
  caseId: string,
  userId: string,
): StoreResult {
  const index = state.caseMembers.findIndex(
    (entry) => entry.case_id === caseId && entry.user_id === userId,
  );
  if (index === -1) return { ok: false, error: "Case member not found." };
  if (state.caseMembers[index].role === "external") {
    return {
      ok: false,
      error: "External access is severed only by revoking the transfer.",
    };
  }
  state.caseMembers.splice(index, 1);
  pushAudit({
    action: "member.removed",
    result: "allow",
    case_id: caseId,
    details: { scope: "case", user_id: userId },
  });
  return { ok: true, data: null };
}

export function createTransfer(
  user: Profile,
  input: {
    case_id: string;
    to_firm_id: string;
    recipient_user_ids: string[];
    document_ids: string[];
    message: string | null;
  },
): StoreResult<Transfer> {
  const item = getCaseById(input.case_id);
  if (!item) return { ok: false, error: "Case not found." };
  if (item.status === "archived") {
    return { ok: false, error: "This case is archived. Transfers are blocked." };
  }
  if (input.to_firm_id === user.firm_id) {
    return { ok: false, error: "Select a receiving firm outside your firm." };
  }
  if (input.recipient_user_ids.length < 1 || input.recipient_user_ids.length > 10) {
    return { ok: false, error: "Choose between 1 and 10 recipients." };
  }
  if (input.document_ids.length < 1) {
    return { ok: false, error: "Select at least one document." };
  }
  const transfer: Transfer = {
    id: `tr_${String(state.transfers.length + 64).padStart(3, "0")}`,
    case_id: input.case_id,
    from_firm_id: user.firm_id,
    to_firm_id: input.to_firm_id,
    created_by: user.id,
    recipient_user_ids: input.recipient_user_ids,
    status: "draft",
    message: input.message?.trim() || null,
    sent_at: null,
    responded_at: null,
    created_at: now(),
  };
  state.transfers.push(transfer);
  for (const documentId of input.document_ids) {
    state.transferItems.push({
      transfer_id: transfer.id,
      document_id: documentId,
    });
  }
  pushAudit({
    action: "transfer.created",
    result: "info",
    case_id: transfer.case_id,
    transfer_id: transfer.id,
    details: { items: input.document_ids.length },
  });
  return { ok: true, data: transfer };
}

const transferTransitions: Record<
  string,
  { from: TransferStatus; to: TransferStatus; action: AuditAction }
> = {
  send: { from: "draft", to: "sent", action: "transfer.sent" },
  accept: { from: "sent", to: "accepted", action: "transfer.accepted" },
  reject: { from: "sent", to: "rejected", action: "transfer.rejected" },
  cancel: { from: "sent", to: "cancelled", action: "transfer.cancelled" },
  revoke: { from: "accepted", to: "revoked", action: "transfer.revoked" },
};

export function transitionTransfer(
  user: Profile,
  transferId: string,
  transition: "send" | "accept" | "reject" | "cancel" | "revoke",
): StoreResult<Transfer> {
  const transfer = state.transfers.find((entry) => entry.id === transferId);
  if (!transfer) return { ok: false, error: "Transfer not found." };
  const rule = transferTransitions[transition];
  if (transfer.status !== rule.from) {
    return {
      ok: false,
      error: `This transfer cannot be ${transition === "accept" ? "accepted" : `${transition}ed`} from its current state.`,
    };
  }
  const outgoing = transfer.from_firm_id === user.firm_id;
  const designated = transfer.recipient_user_ids.includes(user.id);

  if (transition === "accept" || transition === "reject") {
    if (!designated) {
      return { ok: false, error: "Only designated recipients can respond." };
    }
  } else if (transition === "revoke") {
    if (!outgoing || user.role !== "firm_admin") {
      return {
        ok: false,
        error: "Only an administrator of the owning firm can revoke.",
      };
    }
  } else if (!outgoing || (!isCaseMember(transfer.case_id, user.id) && user.role !== "firm_admin")) {
    return { ok: false, error: "Only the sending firm can perform this action." };
  }

  transfer.status = rule.to;
  if (transition === "send") transfer.sent_at = now();
  if (transition === "accept" || transition === "reject") {
    transfer.responded_at = now();
  }

  if (transition === "accept") {
    for (const recipientId of transfer.recipient_user_ids) {
      const recipient = getProfile(recipientId);
      if (!recipient) continue;
      const already = state.caseMembers.some(
        (member) =>
          member.case_id === transfer.case_id &&
          member.user_id === recipientId,
      );
      if (!already) {
        state.caseMembers.push({
          case_id: transfer.case_id,
          user_id: recipientId,
          role: "external",
          added_by: transfer.created_by,
          added_at: now(),
        });
      }
    }
  }

  if (transition === "revoke") {
    for (const recipientId of transfer.recipient_user_ids) {
      const hasOtherAccess = state.transfers.some(
        (other) =>
          other.id !== transfer.id &&
          other.case_id === transfer.case_id &&
          other.status === "accepted" &&
          other.recipient_user_ids.includes(recipientId),
      );
      if (!hasOtherAccess) {
        state.caseMembers = state.caseMembers.filter(
          (member) =>
            !(
              member.case_id === transfer.case_id &&
              member.user_id === recipientId &&
              member.role === "external"
            ),
        );
      }
    }
  }

  pushAudit({
    action: rule.action,
    result: "allow",
    case_id: transfer.case_id,
    transfer_id: transfer.id,
    details: {
      status: rule.to,
      ...(transition === "accept" ? { external_members_added: true } : {}),
    },
  });
  return { ok: true, data: transfer };
}

export function updateTransfer(
  user: Profile,
  transferId: string,
  patch: {
    recipient_user_ids?: string[];
    document_ids?: string[];
    message?: string | null;
  },
): StoreResult<Transfer> {
  const transfer = state.transfers.find((entry) => entry.id === transferId);
  if (!transfer) return { ok: false, error: "Transfer not found." };
  if (transfer.status !== "draft") {
    return { ok: false, error: "Only drafts can be edited." };
  }
  if (transfer.created_by !== user.id) {
    return { ok: false, error: "Only the sender can edit this draft." };
  }
  if (patch.recipient_user_ids) {
    if (
      patch.recipient_user_ids.length < 1 ||
      patch.recipient_user_ids.length > 10
    ) {
      return { ok: false, error: "Choose between 1 and 10 recipients." };
    }
    transfer.recipient_user_ids = patch.recipient_user_ids;
  }
  if (patch.message !== undefined) {
    transfer.message = patch.message?.trim() || null;
  }
  if (patch.document_ids) {
    if (patch.document_ids.length < 1) {
      return { ok: false, error: "Select at least one document." };
    }
    state.transferItems = state.transferItems.filter(
      (item) => item.transfer_id !== transfer.id,
    );
    for (const documentId of patch.document_ids) {
      state.transferItems.push({
        transfer_id: transfer.id,
        document_id: documentId,
      });
    }
  }
  return { ok: true, data: transfer };
}

export function getOtherFirms(firmId: string) {
  return state.firms.filter((firm) => firm.id !== firmId);
}

export function getCaseDocuments(caseId: string) {
  return state.documents
    .filter((document) => document.case_id === caseId && !document.superseded)
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
}

export function getAuditActors(user: Profile) {
  const actorIds = new Set(
    state.auditEvents
      .filter((event) => event.firm_id === user.firm_id)
      .map((event) => event.actor_user_id)
      .filter((actorId): actorId is string => Boolean(actorId)),
  );
  return Array.from(actorIds)
    .map((actorId) => getProfile(actorId))
    .filter((profile): profile is Profile => Boolean(profile));
}
