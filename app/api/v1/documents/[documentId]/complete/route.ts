import { authenticate, requireActiveProfile } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
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
      .maybeSingle<DocumentRecord>();

    if (error) throw new Error("Unable to load the upload record.");
    if (!document) throw ApiError.notFound();

    if (document.scan_status !== "pending") {
      return jsonResponse(document, request);
    }

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
    if (scan.status === "error") {
      throw ApiError.validation("Uploaded object is not a valid PDF.", {
        findings: scan.findings,
      });
    }

    const { data: updated, error: updateError } = await auth.supabase
      .from("documents")
      .update({
        sha256: scan.sha256,
        scan_status: scan.status,
        scan_method: scan.method,
      })
      .eq("id", documentId)
      .select("*")
      .single<DocumentRecord>();

    if (updateError) throw new Error("Unable to finalize the upload.");

    await writeAudit(
      auth.supabase,
      {
        actorUserId: profile.id,
        firmId: document.firm_id,
        caseId: document.case_id,
        documentId: document.id,
        action: "document.uploaded",
        result: scan.status === "clean" ? "allow" : "info",
        details: {
          size_bytes: bytes.length,
          sha256: scan.sha256,
          scan_status: scan.status,
        },
      },
      auth.geography,
    );

    if (scan.status === "infected") {
      await writeAudit(
        auth.supabase,
        {
          actorUserId: profile.id,
          firmId: document.firm_id,
          caseId: document.case_id,
          documentId: document.id,
          action: "document.scan_failed",
          result: "deny",
          denyReason: "INFECTED",
          details: {
            method: scan.method,
            findings: scan.findings,
          },
        },
        auth.geography,
      );
    }

    return jsonResponse(updated, request);
  });
}
