import { z } from "zod";
import { authenticate, requireActiveProfile } from "@/lib/auth";
import {
  canWriteToCase,
  isCaseLead,
  loadCaseAccess,
  loadCaseMembers,
} from "@/lib/access/cases";
import { acceptedTransferDocumentIds } from "@/lib/access/transfers";
import { serializeCase } from "@/lib/serializers/cases";
import { writeAudit } from "@/lib/audit";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { CaseRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    case_reference: z.string().trim().min(1).max(100).optional(),
    default_security_level: z
      .union([z.literal(1), z.literal(2), z.literal(3)])
      .optional(),
    status: z.enum(["open", "closed", "archived"]).optional(),
    retention_days: z.number().int().positive().nullable().optional(),
    allow_l3_download: z.boolean().optional(),
    legal_hold: z.boolean().optional(),
  })
  .strict();

export async function GET(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  return apiRoute(request, async () => {
    const { caseId } = await context.params;
    if (!UUID_RE.test(caseId)) throw ApiError.notFound();

    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");

    const access = await loadCaseAccess(auth.supabase, profile, caseId);
    if (!access) throw ApiError.notFound();

    const [members, documentsResult] = await Promise.all([
      loadCaseMembers(auth.supabase, [caseId]),
      auth.supabase
        .from("documents")
        .select("id, case_id, firm_id, security_level, uploaded_at, superseded")
        .eq("case_id", caseId),
    ]);

    if (documentsResult.error) {
      throw new Error("Unable to load case documents.");
    }

    const acceptedExternalDocumentIds =
      access.caseRecord.firm_id === profile.firm_id
        ? undefined
        : await acceptedTransferDocumentIds(
            auth.supabase,
            profile,
            access.caseRecord.id,
          );

    return jsonResponse(
      serializeCase(
        access.caseRecord,
        members,
        documentsResult.data ?? [],
        profile,
        access.adminMetadata,
        acceptedExternalDocumentIds,
      ),
      request,
    );
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  return apiRoute(request, async () => {
    const { caseId } = await context.params;
    if (!UUID_RE.test(caseId)) throw ApiError.notFound();

    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");

    const access = await loadCaseAccess(auth.supabase, profile, caseId);
    if (!access) throw ApiError.notFound();
    if (!canWriteToCase(access)) throw ApiError.caseArchived();

    const members = await loadCaseMembers(auth.supabase, [caseId]);
    const lead = isCaseLead(members, caseId, profile.id);
    const isAdmin =
      profile.role === "firm_admin" &&
      access.caseRecord.firm_id === profile.firm_id;
    if (!lead && !isAdmin) throw ApiError.forbidden();

    const body = patchSchema.parse(await request.json());
    if (Object.keys(body).length === 0) {
      throw ApiError.validation("At least one field is required.");
    }

    const adminOnly = new Set([
      "allow_l3_download",
      "legal_hold",
      "status",
    ]);
    for (const field of Object.keys(body)) {
      if (adminOnly.has(field) && !isAdmin) throw ApiError.forbidden();
    }

    if (body.status === "archived" && access.caseRecord.status === "archived") {
      return jsonResponse(
        serializeCase(
          access.caseRecord,
          members,
          [],
          profile,
          isAdmin,
        ),
        request,
      );
    }

    const update: Record<string, unknown> = { ...body };
    if (body.status === "closed") update.closed_at = new Date().toISOString();
    if (body.status === "open") update.closed_at = null;

    const { data: updated, error } = await auth.supabase
      .from("cases")
      .update(update)
      .eq("id", caseId)
      .select("*")
      .single<CaseRecord>();

    if (error) {
      if (error.code === "PT409") throw ApiError.conflict(error.message);
      if (error.code === "23505") {
        throw ApiError.conflict("A case with this reference already exists.");
      }
      throw new Error("Unable to update the case.");
    }

    const action =
      body.status === "archived"
        ? "case.archived"
        : body.status === "closed"
          ? "case.closed"
          : "case.updated";

    await writeAudit(
      auth.supabase,
      {
        actorUserId: profile.id,
        firmId: profile.firm_id,
        caseId,
        action,
        result: "allow",
        details: { fields: Object.keys(body) },
      },
      auth.geography,
    );

    return jsonResponse(
      serializeCase(updated, members, [], profile, isAdmin),
      request,
    );
  });
}
