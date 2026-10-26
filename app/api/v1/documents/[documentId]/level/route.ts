import { z } from "zod";
import { authenticate, requireActiveProfile } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import type {
  CaseRecord,
  CaseMember,
  DocumentRecord,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const levelSchema = z.object({
  security_level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  reason: z.string().trim().max(500).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  return apiRoute(request, async () => {
    const { documentId } = await context.params;
    if (!UUID_RE.test(documentId)) throw ApiError.notFound();

    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");

    const { data: document, error } = await auth.supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .maybeSingle<DocumentRecord>();

    if (error) throw new Error("Unable to load the document.");
    if (!document || document.firm_id !== profile.firm_id) {
      throw ApiError.notFound();
    }

    const { data: caseRecord, error: caseError } = await auth.supabase
      .from("cases")
      .select("*")
      .eq("id", document.case_id)
      .single<CaseRecord>();

    if (caseError || !caseRecord) throw ApiError.notFound();
    if (caseRecord.status === "archived") throw ApiError.caseArchived();

    const body = levelSchema.parse(await request.json());
    if (body.security_level === document.security_level) {
      throw ApiError.validation("The document already has that level.");
    }

    const raising = body.security_level > document.security_level;

    if (raising) {
      const { data: membership, error: membershipError } = await auth.supabase
        .from("case_members")
        .select("*")
        .eq("case_id", document.case_id)
        .eq("user_id", profile.id)
        .maybeSingle<CaseMember>();

      if (membershipError) throw new Error("Unable to resolve membership.");
      if (!membership || membership.role === "external") {
        throw ApiError.forbidden();
      }
    } else {
      if (profile.role !== "firm_admin") throw ApiError.forbidden();
      if (!body.reason) {
        throw ApiError.validation("A reason is required to lower a level.");
      }
    }

    const { data: updated, error: updateError } = await auth.supabase
      .from("documents")
      .update({ security_level: body.security_level })
      .eq("id", documentId)
      .select("*")
      .single<DocumentRecord>();

    if (updateError) throw new Error("Unable to change the document level.");

    await writeAudit(
      auth.supabase,
      {
        actorUserId: profile.id,
        firmId: document.firm_id,
        caseId: document.case_id,
        documentId: document.id,
        action: raising
          ? "document.level_raised"
          : "document.level_lowered",
        result: "allow",
        details: {
          before: document.security_level,
          after: body.security_level,
          ...(body.reason ? { reason: body.reason } : {}),
        },
      },
      auth.geography,
    );

    return jsonResponse(updated, request);
  });
}
