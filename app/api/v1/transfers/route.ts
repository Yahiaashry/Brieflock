import { z } from "zod";
import { authenticate, requireActiveProfile } from "@/lib/auth";
import { loadCaseAccess } from "@/lib/access/cases";
import { writeAudit } from "@/lib/audit";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import { serializeTransfers } from "@/lib/serializers/transfers";
import type {
  DocumentRecord,
  Firm,
  Profile,
  Transfer,
  TransferWithMeta,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  case_id: z.string().uuid(),
  to_firm_id: z.string().uuid(),
  recipient_user_ids: z.array(z.string().uuid()).min(1).max(10),
  document_ids: z.array(z.string().uuid()).min(1).max(50),
  message: z.string().trim().max(1000).nullable().optional(),
});

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");

    const params = new URL(request.url).searchParams;
    const direction = params.get("direction") ?? "outgoing";
    if (direction !== "outgoing" && direction !== "incoming") {
      throw ApiError.validation("direction must be outgoing or incoming.");
    }

    const status = params.get("status");
    const caseId = params.get("case_id");
    if (caseId !== null && !z.string().uuid().safeParse(caseId).success) {
      throw ApiError.validation("case_id must be a UUID.");
    }
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(params.get("limit") ?? "50", 10) || 50),
    );

    let transfersQuery = auth.supabase
      .from("transfers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (caseId) transfersQuery = transfersQuery.eq("case_id", caseId);

    if (direction === "incoming") {
      transfersQuery = transfersQuery
        .eq("to_firm_id", profile.firm_id)
        .neq("status", "draft")
        .contains("recipient_user_ids", [profile.id]);
    } else {
      transfersQuery = transfersQuery.eq("from_firm_id", profile.firm_id);
      let membershipsQuery = auth.supabase
        .from("case_members")
        .select("case_id")
        .eq("user_id", profile.id);
      if (caseId) membershipsQuery = membershipsQuery.eq("case_id", caseId);
      const { data: memberships, error } = await membershipsQuery;

      if (error) throw new Error("Unable to load transfer case scopes.");
      const caseIds = unique(
        (memberships ?? []).map((row: { case_id: string }) => row.case_id),
      );
      if (caseIds.length === 0) {
        return jsonResponse({ data: [], page: { next_cursor: null } }, request);
      }
      transfersQuery = transfersQuery.in("case_id", caseIds);
    }

    if (status) transfersQuery = transfersQuery.eq("status", status);

    const { data, error } = await transfersQuery.returns<Transfer[]>();
    if (error) throw new Error("Unable to load transfers.");

    return jsonResponse(
      {
        data: await serializeTransfers(auth.supabase, data ?? []),
        page: { next_cursor: null },
      },
      request,
    );
  });
}

export async function POST(request: Request) {
  return apiRoute(request, async () => {
    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");

    const body = createSchema.parse(await request.json());
    if (body.to_firm_id === profile.firm_id) {
      throw ApiError.validation("A transfer must target another firm.");
    }

    const access = await loadCaseAccess(
      auth.supabase,
      profile,
      body.case_id,
    );
    if (!access) throw ApiError.notFound();
    if (access.caseRecord.status === "archived") throw ApiError.caseArchived();
    if (!access.membership || access.membership.role === "external") {
      throw ApiError.forbidden();
    }

    const { data: toFirm, error: firmError } = await auth.supabase
      .from("firms")
      .select("*")
      .eq("id", body.to_firm_id)
      .maybeSingle<Firm>();
    if (firmError) throw new Error("Unable to resolve the recipient firm.");
    if (!toFirm) throw ApiError.validation("Recipient firm was not found.");

    const recipientIds = unique(body.recipient_user_ids);
    if (recipientIds.length !== body.recipient_user_ids.length) {
      throw ApiError.validation("Recipient ids must be unique.");
    }

    const { data: recipientProfiles, error: recipientError } =
      await auth.supabase
        .from("profiles")
        .select("*")
        .eq("firm_id", body.to_firm_id)
        .eq("is_active", true)
        .in("id", recipientIds);

    if (recipientError) throw new Error("Unable to resolve recipients.");
    const recipients = (recipientProfiles ?? []) as Profile[];
    if (recipients.length !== recipientIds.length) {
      throw ApiError.validation(
        "Every recipient must be an active member of the recipient firm.",
      );
    }

    const documentIds = unique(body.document_ids);
    if (documentIds.length !== body.document_ids.length) {
      throw ApiError.validation("Document ids must be unique.");
    }

    const { data: documents, error: documentsError } = await auth.supabase
      .from("documents")
      .select("*")
      .in("id", documentIds)
      .eq("case_id", body.case_id)
      .eq("firm_id", profile.firm_id);

    if (documentsError) throw new Error("Unable to resolve transfer documents.");
    if ((documents ?? []).length !== documentIds.length) {
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

    const { data: transfer, error } = await auth.supabase
      .from("transfers")
      .insert({
        case_id: body.case_id,
        from_firm_id: profile.firm_id,
        to_firm_id: body.to_firm_id,
        created_by: profile.id,
        recipient_user_ids: recipients.map((recipient) => recipient.id),
        status: "draft",
        message: body.message ?? null,
      })
      .select("*")
      .single<Transfer>();

    if (error) throw new Error("Unable to create the transfer.");

    const { error: itemsError } = await auth.supabase
      .from("transfer_items")
      .insert(
        documentIds.map((documentId) => ({
          transfer_id: transfer.id,
          document_id: documentId,
        })),
      );

    if (itemsError) {
      await auth.supabase.from("transfers").delete().eq("id", transfer.id);
      throw new Error("Unable to attach transfer documents.");
    }

    await writeAudit(
      auth.supabase,
      {
        actorUserId: profile.id,
        firmId: profile.firm_id,
        caseId: transfer.case_id,
        transferId: transfer.id,
        action: "transfer.created",
        result: "allow",
        details: {
          to_firm_id: transfer.to_firm_id,
          document_count: documentIds.length,
        },
      },
      auth.geography,
    );

    const [serialized] = await serializeTransfers(auth.supabase, [transfer]);
    return jsonResponse(
      serialized as TransferWithMeta,
      request,
      { status: 201 },
    );
  });
}
