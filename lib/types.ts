export type SecurityLevel = 1 | 2 | 3;
export type ClearanceLevel = 1 | 2 | 3;
export type Role = "firm_admin" | "security" | "lawyer" | "paralegal";
export type CaseStatus = "open" | "closed" | "archived";
export type ScanStatus = "pending" | "clean" | "infected" | "error";
export type TransferStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "revoked";
export type MemberRole = "lead" | "member" | "external";
export type AuditResult = "allow" | "deny" | "info";

export type DenyReason =
  | "UNAUTHENTICATED"
  | "DEACTIVATED"
  | "FIRM_MISMATCH"
  | "NOT_CASE_MEMBER"
  | "CLEARANCE_MISMATCH"
  | "UNSCANNED"
  | "INFECTED"
  | "CASE_ARCHIVED"
  | "DOWNLOAD_BLOCKED_L3";

export type AuditAction =
  | "auth.login_failed"
  | "member.added"
  | "member.removed"
  | "member.role_changed"
  | "clearance.changed"
  | "case.created"
  | "case.updated"
  | "case.closed"
  | "case.archived"
  | "document.uploaded"
  | "document.viewed"
  | "document.downloaded"
  | "document.access_denied"
  | "document.level_raised"
  | "document.level_lowered"
  | "document.scan_failed"
  | "document.purged"
  | "transfer.created"
  | "transfer.sent"
  | "transfer.accepted"
  | "transfer.rejected"
  | "transfer.cancelled"
  | "transfer.revoked"
  | "firm.updated";

export interface FirmSettings {
  retention_days: number;
  watermark_l1: boolean;
  l3_view_only_default: boolean;
}

export interface Firm {
  id: string;
  name: string;
  slug: string;
  settings: FirmSettings;
  plan: string;
  created_at: string;
  deactivated_at: string | null;
}

export interface Profile {
  id: string;
  firm_id: string;
  email: string;
  full_name: string;
  role: Role;
  clearance_level: ClearanceLevel;
  is_active: boolean;
  created_at: string;
  deactivated_at: string | null;
  last_seen_at: string | null;
}

export interface CaseRecord {
  id: string;
  firm_id: string;
  title: string;
  case_reference: string;
  default_security_level: SecurityLevel;
  status: CaseStatus;
  allow_l3_download: boolean;
  legal_hold: boolean;
  retention_days: number | null;
  created_by: string;
  created_at: string;
  closed_at: string | null;
}

export interface CaseMember {
  case_id: string;
  user_id: string;
  role: MemberRole;
  added_by: string;
  added_at: string;
}

export interface DocumentRecord {
  id: string;
  case_id: string;
  firm_id: string;
  filename: string;
  storage_path: string;
  size_bytes: number;
  mime_type: "application/pdf";
  sha256: string;
  security_level: SecurityLevel;
  scan_status: ScanStatus;
  scan_method: string;
  description: string | null;
  uploaded_by: string;
  uploaded_at: string;
  superseded: boolean;
  retention_marked_at?: string | null;
  purged_at?: string | null;
  purge_claimed_at?: string | null;
}

export interface TransferItem {
  transfer_id: string;
  document_id: string;
}

export interface Transfer {
  id: string;
  case_id: string;
  from_firm_id: string;
  to_firm_id: string;
  created_by: string;
  recipient_user_ids: string[];
  status: TransferStatus;
  message: string | null;
  sent_at: string | null;
  responded_at: string | null;
  created_at: string;
}

export interface Invite {
  id: string;
  firm_id: string;
  email: string;
  role: Role;
  clearance_level: ClearanceLevel;
  created_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export interface AuditEvent {
  id: string;
  chain_seq: number;
  occurred_at: string;
  actor_user_id: string | null;
  firm_id: string | null;
  case_id: string | null;
  document_id: string | null;
  transfer_id: string | null;
  action: AuditAction;
  result: AuditResult;
  deny_reason: DenyReason | null;
  ip_hash: string | null;
  country: string | null;
  city: string | null;
  user_agent: string | null;
  details: Record<string, unknown>;
  prev_hash: string;
  entry_hash: string;
}

export type ComposerDocument = Pick<
  DocumentRecord,
  | "id"
  | "filename"
  | "size_bytes"
  | "security_level"
  | "scan_status"
  | "description"
  | "uploaded_at"
>;

export interface CaseWithMeta extends CaseRecord {
  members: (CaseMember & { profile: Profile })[];
  visible_document_count: number;
  last_upload_at: string | null;
  /** Present when the cases endpoint is called with `include=documents`. */
  documents?: ComposerDocument[];
}

export interface TransferWithMeta extends Transfer {
  case_title: string;
  case_reference: string;
  from_firm_name: string;
  to_firm_name: string;
  created_by_name: string;
  items: DocumentRecord[];
  recipients: Profile[];
}
