import { z } from "zod";
import { authenticate, requireActiveProfile } from "@/lib/auth";
import { loadCaseAccess } from "@/lib/access/cases";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import { createUploadUrl, storagePath } from "@/lib/storage";
import type { DocumentRecord } from "@/lib/types";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MESSAGE } from "@/lib/upload-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const uploadSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((name) => name.toLowerCase().endsWith(".pdf"), {
      message: "Only PDF files are accepted.",
    })
    .refine((name) => !name.includes("/") && !name.includes("\\"), {
      message: "Filename must not contain a path.",
    }),
  size_bytes: z.number().int().positive().max(MAX_UPLOAD_BYTES, MAX_UPLOAD_MESSAGE),
  security_level: z
    .union([z.literal(1), z.literal(2), z.literal(3)])
    .optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  return apiRoute(request, async () => {
    const { caseId } = await context.params;
    if (!UUID_RE.test(caseId)) throw ApiError.notFound();

    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "upload");

    const access = await loadCaseAccess(auth.supabase, profile, caseId);
    if (!access) throw ApiError.notFound();
    if (access.caseRecord.status === "archived") throw ApiError.caseArchived();
    if (!access.membership || access.membership.role === "external") {
      throw ApiError.forbidden();
    }

    const body = uploadSchema.parse(await request.json());
    const securityLevel =
      body.security_level ?? access.caseRecord.default_security_level;

    if (securityLevel < access.caseRecord.default_security_level) {
      throw ApiError.validation(
        "A document cannot be uploaded below the case default level.",
      );
    }

    const documentId = crypto.randomUUID();
    const path = storagePath({
      firmId: access.caseRecord.firm_id,
      caseId,
      documentId,
      filename: body.filename,
    });

    const { data: document, error } = await auth.supabase
      .from("documents")
      .insert({
        id: documentId,
        case_id: caseId,
        firm_id: access.caseRecord.firm_id,
        filename: body.filename,
        storage_path: path,
        size_bytes: body.size_bytes,
        mime_type: "application/pdf",
        sha256: "0".repeat(64),
        security_level: securityLevel,
        scan_status: "pending",
        scan_method: "magic-bytes-mvp",
        description: body.description ?? null,
        uploaded_by: profile.id,
      })
      .select("*")
      .single<DocumentRecord>();

    if (error) throw new Error("Unable to create the upload record.");

    try {
      const upload = await createUploadUrl(auth.supabase, path);
      return jsonResponse(
        { document, upload },
        request,
        { status: 201 },
      );
    } catch (error) {
      await auth.supabase.from("documents").delete().eq("id", documentId);
      throw error;
    }
  });
}
