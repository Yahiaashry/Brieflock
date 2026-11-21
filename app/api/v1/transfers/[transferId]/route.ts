import { z } from "zod";
import { authenticate, requireActiveProfile } from "@/lib/auth";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import { serializeTransfers } from "@/lib/serializers/transfers";
import type {
  CaseMember,
  DocumentRecord,
  Profile,
  Transfer,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const patchSchema = z
  .object({
    recipient_user_ids: z.array(z.string().uuid()).min(1).max(10).optional(),
    document_ids: z.array(z.string().uuid()).min(1).max(50).optional(),
    message: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

export async function GET(
  request: Request,
  context: { params: Promise<{ transferId: string }> },
) {
  return apiRoute(request, async () => {
    const { transferId } = await context.params;
    if (!UUID_RE.test(transferId)) throw ApiError.notFound();

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

    const isRecipient =
      transfer.to_firm_id === profile.firm_id &&
      transfer.status !== "draft" &&
      transfer.recipient_user_ids.includes(profile.id);
    const isOwningAdmin =
      transfer.from_firm_id === profile.firm_id &&
      profile.role === "firm_admin";

    let isCaseMember = false;
    if (transfer.from_firm_id === profile.firm_id) {
      const { data: membership, error: membershipError } = await auth.supabase
        .from("case_members")
        .select("*")
        .eq("case_id", transfer.case_id)
        .eq("user_id", profile.id)
        .maybeSingle<CaseMember>();
      if (membershipError) throw new Error("Unable to resolve membership.");
      isCaseMember = Boolean(membership);
    }

    if (!isRecipient && !isOwningAdmin && !isCaseMember) {
      throw ApiError.notFound();
    }

    const [serialized] = await serializeTransfers(auth.supabase, [transfer]);
    return jsonResponse(serialized, request);
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ transferId: string }> },
) {
  return apiRoute(request, async () => {
    const { transferId } = await context.params;
    if (!UUID_RE.test(transferId)) throw ApiError.notFound();

    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");

    const body = patchSchema.parse(await request.json());
    if (Object.keys(body).length === 0) {
      throw ApiError.validation("At least one field is required.");
    }

    const { data: transfer, error } = await auth.supabase
      .from("transfers")
      .select("*")
      .eq("id", transferId)
      .maybeSingle<Transfer>();

    if (error) throw new Error("Unable to load the transfer.");
    if (!transfer || transfer.from_firm_id !== profile.firm_id) {
      throw ApiError.notFound();
    }
    if (transfer.status !== "draft") {
      throw ApiError.conflict("Only a draft transfer can be edited.");
    }
    if (transfer.created_by !== profile.id) {
      throw ApiError.forbidden();
    }

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

    const update: {
      recipient_user_ids?: string[];
      message?: string | null;
    } = {};

    if (body.recipient_user_ids) {
      const recipientIds = unique(body.recipient_user_ids);
      if (recipientIds.length !== body.recipient_user_ids.length) {
        throw ApiError.validation("Recipient ids must be unique.");
      }

      const { data: recipientProfiles, error: recipientError } =
        await auth.supabase
          .from("profiles")
          .select("*")
          .eq("firm_id", transfer.to_firm_id)
          .eq("is_active", true)
          .in("id", recipientIds);

      if (recipientError) throw new Error("Unable to resolve recipients.");
      if (((recipientProfiles ?? []) as Profile[]).length !== recipientIds.length) {
        throw ApiError.validation(
          "Every recipient must be an active member of the recipient firm.",
        );
      }

      update.recipient_user_ids = recipientIds;
    }

    if (body.message !== undefined) {
      update.message = body.message ?? null;
    }

    if (Object.keys(update).length > 0) {
      const { error: updateError } = await auth.supabase
        .from("transfers")
        .update(update)
        .eq("id", transferId)
        .eq("status", "draft");

      if (updateError) throw new Error("Unable to update the transfer.");
    }

    if (body.document_ids) {
      const documentIds = unique(body.document_ids);
      if (documentIds.length !== body.document_ids.length) {
        throw ApiError.validation("Document ids must be unique.");
      }

      const { data: documents, error: documentsError } = await auth.supabase
        .from("documents")
        .select("*")
        .in("id", documentIds)
        .eq("case_id", transfer.case_id)
        .eq("firm_id", profile.firm_id);

      if (documentsError) {
        throw new Error("Unable to resolve transfer documents.");
      }
      if (((documents ?? []) as DocumentRecord[]).length !== documentIds.length) {
        throw ApiError.validation("Every document must belong to the case.");
      }

      const inaccessible = (documents as DocumentRecord[]).some(
        (document) => document.security_level !== profile.clearance_level ||
          document.scan_status !== "clean" || document.superseded ||
          Boolean(document.retention_marked_at),
      );
      if (inaccessible) {
        throw ApiError.validation("One or more documents are not accessible.");
      }

      const { data: previousItems, error: previousError } = await auth.supabase
        .from("transfer_items")
        .select("document_id")
        .eq("transfer_id", transferId);

      if (previousError) {
        throw new Error("Unable to load the current transfer documents.");
      }

      const { error: deleteError } = await auth.supabase
        .from("transfer_items")
        .delete()
        .eq("transfer_id", transferId);

      if (deleteError) {
        throw new Error("Unable to update transfer documents.");
      }

      const { error: itemsError } = await auth.supabase
        .from("transfer_items")
        .insert(
          documentIds.map((documentId) => ({
            transfer_id: transferId,
            document_id: documentId,
          })),
        );

      if (itemsError) {
        const previousIds = (previousItems ?? []) as Array<{
          document_id: string;
        }>;
        if (previousIds.length > 0) {
          await auth.supabase.from("transfer_items").insert(
            previousIds.map((item) => ({
              transfer_id: transferId,
              document_id: item.document_id,
            })),
          );
        }
        throw new Error("Unable to attach transfer documents.");
      }
    }

    const { data: updated, error: readError } = await auth.supabase
      .from("transfers")
      .select("*")
      .eq("id", transferId)
      .single<Transfer>();

    if (readError) throw new Error("Unable to load the updated transfer.");

    const [serialized] = await serializeTransfers(auth.supabase, [updated]);
    return jsonResponse(serialized, request);
  });
}
