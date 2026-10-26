import { authenticate, requireActiveProfile } from "@/lib/auth";
import { decideDocumentAccess } from "@/lib/access";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";

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
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");

    const decision = await decideDocumentAccess(
      auth.supabase,
      profile,
      documentId,
      "metadata",
    );

    if (!decision.allow) throw ApiError.notFound();

    const document = decision.document;
    return jsonResponse(
      {
        id: document.id,
        case_id: document.case_id,
        firm_id: document.firm_id,
        filename: document.filename,
        size_bytes: document.size_bytes,
        mime_type: document.mime_type,
        sha256: document.sha256,
        security_level: document.security_level,
        scan_status: document.scan_status,
        scan_method: document.scan_method,
        description: document.description,
        uploaded_by: document.uploaded_by,
        uploaded_at: document.uploaded_at,
        superseded: document.superseded,
      },
      request,
    );
  });
}
