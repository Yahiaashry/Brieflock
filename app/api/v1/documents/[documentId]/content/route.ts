import { authenticate } from "@/lib/auth";
import { decideDocumentAccess, watermarkRequired } from "@/lib/access";
import { writeAudit } from "@/lib/audit";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import { createReadUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  return apiRoute(request, async () => {
    const { documentId } = await context.params;
    if (!UUID_RE.test(documentId)) throw ApiError.notFound();

    const auth = await authenticate(request);
    if (!auth.profile) throw ApiError.unauthenticated();
    const profile = auth.profile;

    enforceRateLimit(`user:${profile.id}`, "content");

    const dispositionParam = new URL(request.url).searchParams.get("disposition");
    const disposition = dispositionParam ?? "view";
    if (disposition !== "view" && disposition !== "download") {
      throw ApiError.validation("disposition must be view or download.");
    }

    const decision = await decideDocumentAccess(
      auth.supabase,
      profile,
      documentId,
      disposition,
    );

    if (!decision.allow) {
      if (decision.notFound) throw ApiError.notFound();

      await writeAudit(
        auth.supabase,
        {
          actorUserId: profile.id,
          firmId: decision.firm.id,
          caseId: decision.caseRecord.id,
          documentId: decision.document.id,
          action: "document.access_denied",
          result: "deny",
          denyReason: decision.reason,
          details: { disposition },
        },
        auth.geography,
      );

      if (decision.reason === "DOWNLOAD_BLOCKED_L3") {
        throw ApiError.downloadBlockedL3();
      }

      throw ApiError.accessDenied();
    }

    await writeAudit(
      auth.supabase,
      {
        actorUserId: profile.id,
        firmId: decision.firm.id,
        caseId: decision.caseRecord.id,
        documentId: decision.document.id,
        action:
          disposition === "download"
            ? "document.downloaded"
            : "document.viewed",
        result: "allow",
        details: { disposition },
      },
      auth.geography,
    );

    const issuedAt = new Date().toISOString();
    const url = await createReadUrl(auth.supabase, {
      storagePath: decision.document.storage_path,
      disposition,
      filename: decision.document.filename,
    });

    return jsonResponse(
      {
        signed_url: url.signedUrl,
        expires_at: url.expiresAt,
        ttl_seconds: url.ttlSeconds,
        disposition,
        document_id: decision.document.id,
        watermark: {
          required: watermarkRequired(decision.firm, decision.document),
          viewer_name: profile.full_name,
          issued_at: issuedAt,
        },
      },
      request,
    );
  });
}
