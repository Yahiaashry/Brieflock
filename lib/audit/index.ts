import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AuditAction,
  AuditResult,
  DenyReason,
} from "@/lib/types";
import type { RequestGeography } from "@/lib/geo";

export interface AuditEventInput {
  actorUserId?: string | null;
  firmId?: string | null;
  caseId?: string | null;
  documentId?: string | null;
  transferId?: string | null;
  action: AuditAction;
  result: AuditResult;
  denyReason?: DenyReason | null;
  details?: Record<string, unknown>;
}

export async function writeAudit(
  supabase: SupabaseClient,
  input: AuditEventInput,
  geography: RequestGeography,
) {
  if ((input.result === "deny") !== Boolean(input.denyReason)) {
    throw new Error("Audit deny events require exactly one deny reason.");
  }

  const { error } = await supabase.from("audit_events").insert({
    actor_user_id: input.actorUserId ?? null,
    firm_id: input.firmId ?? null,
    case_id: input.caseId ?? null,
    document_id: input.documentId ?? null,
    transfer_id: input.transferId ?? null,
    action: input.action,
    result: input.result,
    deny_reason: input.denyReason ?? null,
    ip_hash: geography.ipHash,
    country: geography.country,
    city: geography.city,
    user_agent: geography.userAgent,
    details: input.details ?? {},
  });

  if (error) {
    throw new Error(`Audit write failed: ${error.message}`);
  }
}

export async function verifyAuditChain(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("audit_chain_verify");
  if (error) throw new Error(`Audit verification failed: ${error.message}`);

  const rows = (data ?? []) as Array<{ chain_seq: number; ok: boolean }>;
  const firstFailure = rows.find((row) => !row.ok);
  return {
    ok: !firstFailure,
    checked: rows.length,
    first_failure: firstFailure?.chain_seq ?? null,
  };
}
