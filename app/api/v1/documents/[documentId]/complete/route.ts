import { authenticate, requireActiveProfile } from "@/lib/auth";
import { loadCaseAccess } from "@/lib/access/cases";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import { downloadObject } from "@/lib/storage";
import { scanPdf } from "@/lib/scan";
import type { DocumentRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  return apiRoute(request, async () => {
    const { documentId } = await context.params;
    if (!UUID_RE.test(documentId)) throw ApiError.notFound();

    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "upload");

    const { data: document, error } = await auth.supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("uploaded_by", profile.id)
      .eq("firm_id", profile.firm_id)
      .maybeSingle<DocumentRecord>();

    if (error) throw new Error("Unable to load the upload record.");
    if (!document) throw ApiError.notFound();
    const access = await loadCaseAccess(auth.supabase, profile, document.case_id);
    if (!access?.membership || access.membership.role === "external") {
      throw ApiError.notFound();
    }

    if (document.scan_status === "error") {
      throw ApiError.validation("Uploaded object is not a valid PDF.");
    }

    if (document.scan_status !== "pending") {
      return jsonResponse(document, request);
    }
    if (access.caseRecord.status === "archived") throw ApiError.caseArchived();

    let bytes: Buffer;
    try {
      bytes = await downloadObject(auth.supabase, document.storage_path);
    } catch {
      throw ApiError.validation("Uploaded object was not found.");
    }

    if (bytes.length !== document.size_bytes) {
      throw ApiError.validation("Uploaded object size does not match.");
    }
    if (bytes.length > 104_857_600) throw ApiError.payloadTooLarge();

    const scan = scanPdf(bytes);
    const { data: updated, error: finalizeError } = await auth.supabase
      .rpc("finalize_document_scan", {
        document_key: document.id,
        actor_key: profile.id,
        verdict: scan.status,
        checksum: scan.sha256,
        method: scan.method,
        findings: scan.findings,
        audit_context: auth.geography,
      })
      .single<DocumentRecord>();
    if (finalizeError?.code === "PT404") throw ApiError.notFound();
    if (finalizeError?.code === "PT403") throw ApiError.forbidden();
    if (finalizeError?.code === "PT422") throw ApiError.caseArchived();
    if (finalizeError || !updated) throw new Error("Unable to finalize the upload.");
    if (updated.scan_status === "error") {
      throw ApiError.validation("Uploaded object is not a valid PDF.", {
        findings: scan.findings,
      });
    }

    return jsonResponse(updated, request);
  });
}
