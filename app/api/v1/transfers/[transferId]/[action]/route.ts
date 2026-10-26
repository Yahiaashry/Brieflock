import { authenticate, requireActiveProfile } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import { serializeTransfers } from "@/lib/serializers/transfers";
import type {
  AuditAction,
  CaseMember,
  Transfer,
  TransferStatus,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ACTIONS = ["send", "accept", "reject", "cancel", "revoke"] as const;
type TransferAction = (typeof ACTIONS)[number];

const TRANSITIONS: Record<
  TransferAction,
  { from: TransferStatus; to: TransferStatus; audit: AuditAction }
> = {
  send: { from: "draft", to: "sent", audit: "transfer.sent" },
  accept: { from: "sent", to: "accepted", audit: "transfer.accepted" },
  reject: { from: "sent", to: "rejected", audit: "transfer.rejected" },
  cancel: { from: "sent", to: "cancelled", audit: "transfer.cancelled" },
  revoke: { from: "accepted", to: "revoked", audit: "transfer.revoked" },
};

function isTransferAction(value: string): value is TransferAction {
  return (ACTIONS as readonly string[]).includes(value);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ transferId: string; action: string }> },
) {
  return apiRoute(request, async () => {
    const { transferId, action } = await context.params;
    if (!UUID_RE.test(transferId) || !isTransferAction(action)) {
      throw ApiError.notFound();
    }

    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");

    const { data: transfer, error } = await auth.supabase
      .from("transfers")
      .select("*")
      .eq("id", transferId)
      .maybeSingle<Transfer>();

    if (error) throw new Error("Unable to load the transfer.");
    if (!transfer) throw ApiError.notFound();

    const transition = TRANSITIONS[action];
    if (transfer.status !== transition.from) throw ApiError.conflict();

    const isRecipient = transfer.recipient_user_ids.includes(profile.id);
    const isOwningFirm = transfer.from_firm_id === profile.firm_id;

    if (action === "accept" || action === "reject") {
      if (!isRecipient || transfer.to_firm_id !== profile.firm_id) {
        throw ApiError.forbidden();
      }
    } else if (action === "revoke") {
      if (!isOwningFirm || profile.role !== "firm_admin") {
        throw ApiError.forbidden();
      }
    } else {
      if (!isOwningFirm) throw ApiError.forbidden();
      const { data: membership, error: membershipError } = await auth.supabase
        .from("case_members")
        .select("*")
        .eq("case_id", transfer.case_id)
        .eq("user_id", profile.id)
        .maybeSingle<CaseMember>();
      if (membershipError) throw new Error("Unable to resolve membership.");
      if (!membership || membership.role === "external") {
        throw ApiError.forbidden();
      }
    }

    const { data: updated, error: updateError } = await auth.supabase
      .from("transfers")
      .update({ status: transition.to })
      .eq("id", transferId)
      .eq("status", transition.from)
      .select("*")
      .maybeSingle<Transfer>();

    if (updateError) {
      if (updateError.code === "23514") throw ApiError.conflict();
      throw new Error("Unable to update the transfer.");
    }
    if (!updated) throw ApiError.conflict();

    if (action === "accept") {
      const { error: memberError } = await auth.supabase
        .from("case_members")
        .upsert(
          transfer.recipient_user_ids.map((userId) => ({
            case_id: transfer.case_id,
            user_id: userId,
            role: "external",
            added_by: profile.id,
          })),
          { onConflict: "case_id,user_id", ignoreDuplicates: true },
        );

      if (memberError) {
        throw new Error("Unable to grant external case access.");
      }
    }

    if (action === "revoke") {
      const { error: removeError } = await auth.supabase
        .from("case_members")
        .delete()
        .eq("case_id", transfer.case_id)
        .eq("role", "external")
        .in("user_id", transfer.recipient_user_ids);

      if (removeError) {
        throw new Error("Unable to revoke external case access.");
      }
    }

    await writeAudit(
      auth.supabase,
      {
        actorUserId: profile.id,
        firmId: transfer.from_firm_id,
        caseId: transfer.case_id,
        transferId: transfer.id,
        action: transition.audit,
        result: "allow",
        details: {
          from_status: transition.from,
          to_status: transition.to,
        },
      },
      auth.geography,
    );

    const [serialized] = await serializeTransfers(auth.supabase, [updated]);
    return jsonResponse(serialized, request);
  });
}
